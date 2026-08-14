/**
 * Editor read + write for one substance's Replication Showcase curation
 * (`/dev` → Replications → Substances → panel).
 *
 *   GET  /api/dev/replications/substances/<slug>
 *     → { substance, matches, curation, unmatchedEffectNames }
 *   POST /api/dev/replications/substances/<slug>  { curatedSlugs, removedSlugs }
 *     → the pruned echo from `substanceGalleries:upsert`
 *
 * The write mirrors the featured-carousel route: editor session checked here,
 * Convex called with the server's token plus the actor's email for the audit
 * trail, full arrays every time, zero optimism — the panel adopts the pruned
 * echo verbatim. Saving revalidates the public replications tag with
 * `expire: 0` and the substance article route, so the article's showcase
 * reflects the new order immediately instead of at the end of the public-data
 * cache window.
 */
import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { api } from "../../../../../../../convex/_generated/api";
import { PUBLIC_CONVEX_CACHE_TAGS } from "@server/convex/publicData";
import { JsonBodyError } from "@/lib/http/readJsonBody";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";

export const runtime = "nodejs";

const MAX_PAYLOAD_BYTES = 32 * 1024;

/** Matches the ceiling enforced in `convex/substanceGalleries.ts`. */
const MAX_CURATION_SLUGS = 250;

/** Substance slugs are kebab-case with the occasional dotted segment. */
const SUBSTANCE_SLUG = /^[a-z0-9]+(?:[-.][a-z0-9]+)*$/;

/** The `<slug>` path segment, or a 404 refusal for a shape no substance has. */
function substanceSlugOf(request: Request): string {
  const segments = new URL(request.url).pathname.split("/").filter(Boolean);
  const slug = decodeURIComponent(segments[segments.length - 1] ?? "").trim().toLowerCase();
  if (!SUBSTANCE_SLUG.test(slug)) {
    throw new JsonBodyError(404, "No substance found for that address.");
  }
  return slug;
}

type CurationBody = { curatedSlugs?: unknown; removedSlugs?: unknown };

/**
 * What a stored replication slug can actually look like. New uploads mint
 * strict kebab-case, but the legacy import left underscores and dots in the
 * corpus (`grass_photos_v2_x2-unknown`), and those rows are as curatable as
 * any other. This gate only bounces garbage — `substanceGalleries:upsert`
 * prunes anything that names no current match either way.
 */
const REPLICATION_SLUG = /^[a-z0-9][a-z0-9._-]{0,119}$/;

function parseSlugList(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) {
    throw new JsonBodyError(400, `A curation save needs an array of ${field}.`);
  }
  if (value.length > MAX_CURATION_SLUGS) {
    throw new JsonBodyError(400, `A curation may hold at most ${MAX_CURATION_SLUGS} ${field}.`);
  }
  const slugs: string[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== "string" || !REPLICATION_SLUG.test(entry)) {
      throw new JsonBodyError(400, `Every entry of ${field} must be a lowercase replication slug.`);
    }
    if (seen.has(entry)) {
      continue;
    }
    seen.add(entry);
    slugs.push(entry);
  }
  return slugs;
}

function parseCurationBody(raw: CurationBody): { curatedSlugs: string[]; removedSlugs: string[] } {
  const curatedSlugs = parseSlugList(raw?.curatedSlugs, "curatedSlugs");
  const removedSlugs = parseSlugList(raw?.removedSlugs, "removedSlugs");

  const removed = new Set(removedSlugs);
  const overlap = curatedSlugs.filter((slug) => removed.has(slug));
  if (overlap.length > 0) {
    throw new JsonBodyError(
      400,
      `A replication cannot be both curated and excluded: ${overlap.join(", ")}`,
    );
  }

  return { curatedSlugs, removedSlugs };
}

export const GET = protectedRouteOperation({
  auth: "editor",
  rateLimit: "diagnosticRead",
  capabilities: [{ type: "convexWrite" }],
  unexpectedErrorLabel: "Failed to load a substance gallery via Next route:",
  unexpectedErrorMessage: "Unable to load that substance's gallery right now.",
  operation: async ({ request, convexWrite }) => {
    if (!convexWrite) {
      throw new Error("Convex write capability is required.");
    }

    const slug = substanceSlugOf(request);
    const apiKey = convexWrite.getAdminIntentToken?.("replicationMaintenance") ?? convexWrite.adminKey;

    const detail = await convexWrite.client.query(api.substanceGalleries.getCurationDetail, {
      apiKey,
      substance_slug: slug,
    });

    if (detail === null) {
      return NextResponse.json(
        { error: `No substance found for slug "${slug}".` },
        { status: 404 },
      );
    }

    return NextResponse.json({ ok: true, ...detail });
  },
});

export const POST = protectedRouteOperation<CurationBody, { curatedSlugs: string[]; removedSlugs: string[] }>({
  auth: "editor",
  rateLimit: "editorSmallWrite",
  body: { maxBytes: MAX_PAYLOAD_BYTES, parse: parseCurationBody },
  capabilities: [{ type: "convexWrite" }],
  unexpectedErrorLabel: "Failed to save a substance gallery via Next route:",
  unexpectedErrorMessage: "Unable to save that substance's gallery right now.",
  operation: async ({ request, actorEmail, body, convexWrite }) => {
    if (!convexWrite) {
      throw new Error("Convex write capability is required.");
    }

    const slug = substanceSlugOf(request);
    const apiKey = convexWrite.getAdminIntentToken?.("editorArticleWrite") ?? convexWrite.adminKey;

    const result = await convexWrite.client.mutation(api.substanceGalleries.upsert, {
      apiKey,
      actorEmail,
      substance_slug: slug,
      curated_slugs: body.curatedSlugs,
      removed_slugs: body.removedSlugs,
      updatedBy: actorEmail,
    });

    revalidateTag(PUBLIC_CONVEX_CACHE_TAGS.replications, { expire: 0 });
    revalidatePath(`/${slug}`);

    return NextResponse.json({
      ok: true,
      curated_slugs: result.curated_slugs,
      removed_slugs: result.removed_slugs,
      pruned_curated: result.pruned_curated,
      pruned_removed: result.pruned_removed,
    });
  },
});
