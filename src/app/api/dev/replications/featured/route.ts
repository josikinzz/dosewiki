/**
 * Editor read + write for the Effect Index featured carousel
 * (`/dev` → Replications → Featured).
 *
 *   GET  /api/dev/replications/featured            → { slugs, curated, updatedAt, updatedBy }
 *   POST /api/dev/replications/featured  { slugs } → replace the selection (admin only)
 *
 * The browser holds no admin intent token, so the write is delegated here the
 * way the Copy Studio delegates its own: the route checks the session floor,
 * then calls Postgres with the server's token plus the actor's email for the
 * audit trail. The selection is site configuration, so the write is admin.
 *
 * `curated: false` on the GET means this deployment has never stored a
 * selection and the homepage is still running on the checked-in JSON list. The
 * studio shows that list as the starting point, so saving from an uncurated
 * deployment records what was already on screen rather than silently replacing
 * it with something else.
 *
 * The POST finishes by publishing the featured replication set, which expires
 * the featured-replications tag with `expire: 0` and the Effect Index home
 * route that renders the carousel, on this deployment and on the public ones.
 * That is what makes a re-curation reach the homepage immediately instead of at
 * the end of the 15-minute public-data window.
 */
import { NextResponse } from "next/server";
import { publishPublicCache } from "@server/next/publishPublicCache";
import { api } from "@server/postgres/runtime/api";
import { EFFECT_INDEX_FEATURED_REPLICATION_SLUGS } from "@server/next/effectIndexHome";
import { JsonBodyError } from "@/lib/http/readJsonBody";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import { isValidReplicationSlug } from "@/features/dev/tools/replication-studio/replicationStudioModel";

export const runtime = "nodejs";

const MAX_PAYLOAD_BYTES = 16 * 1024;

/** Matches the ceiling enforced in `server/siteConfig.ts`. */
const MAX_FEATURED = 120;

type FeaturedBody = { slugs?: unknown };

function parseFeaturedBody(raw: FeaturedBody): string[] {
  if (!Array.isArray(raw?.slugs)) {
    throw new JsonBodyError(400, "A featured selection needs an array of slugs.");
  }
  if (raw.slugs.length > MAX_FEATURED) {
    throw new JsonBodyError(400, `A featured selection may hold at most ${MAX_FEATURED} entries.`);
  }

  const slugs: string[] = [];
  const seen = new Set<string>();
  for (const entry of raw.slugs) {
    if (typeof entry !== "string" || !isValidReplicationSlug(entry)) {
      throw new JsonBodyError(400, "Every featured entry must be a kebab-case replication slug.");
    }
    if (seen.has(entry)) {
      continue;
    }
    seen.add(entry);
    slugs.push(entry);
  }

  return slugs;
}

export const GET = protectedRouteOperation({
  auth: "editor",
  rateLimit: "diagnosticRead",
  capabilities: [{ type: "dataWrite" }],
  unexpectedErrorLabel: "Failed to load the featured replications via Next route:",
  unexpectedErrorMessage: "Unable to load the featured selection right now.",
  operation: async ({ dataWrite }) => {
    if (!dataWrite) {
      throw new Error("Postgres write capability is required.");
    }

    const config = await dataWrite.client.query(api.siteConfig.getFeaturedReplications, {});

    return NextResponse.json({
      ok: true,
      curated: config !== null,
      slugs: config?.slugs ?? [...EFFECT_INDEX_FEATURED_REPLICATION_SLUGS],
      updatedAt: config?.updatedAt ?? null,
      updatedBy: config?.updatedBy ?? null,
    });
  },
});

export const POST = protectedRouteOperation<FeaturedBody, string[]>({
  auth: "admin",
  rateLimit: "editorSmallWrite",
  body: { maxBytes: MAX_PAYLOAD_BYTES, parse: parseFeaturedBody },
  capabilities: [{ type: "dataWrite" }],
  unexpectedErrorLabel: "Failed to save the featured replications via Next route:",
  unexpectedErrorMessage: "Unable to save the featured selection right now.",
  operation: async ({ actorEmail, body, dataWrite }) => {
    if (!dataWrite) {
      throw new Error("Postgres write capability is required.");
    }

    const apiKey =
      dataWrite.getAdminIntentToken?.("editorArticleWrite") ?? dataWrite.adminKey;

    const result = await dataWrite.client.mutation(api.siteConfig.saveFeaturedReplications, {
      apiKey,
      actorEmail,
      slugs: body,
      updatedBy: actorEmail,
    });

    await publishPublicCache({
      targets: [{ kind: "featured-replications" }],
      source: "manual",
    });

    return NextResponse.json({ ok: true, slugs: result.slugs, pruned: result.pruned });
  },
});
