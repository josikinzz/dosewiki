/**
 * Editor read + write for one substance's Replication Showcase curation
 * (`/dev` → Replications → Substances → panel).
 *
 *   GET  /api/dev/replications/substances/<slug>
 *     → { ok, substance, matches, curation, effectOptions, unmatchedEffectNames }
 *   POST /api/dev/replications/substances/<slug>
 *          { curatedSlugs, removedSlugs, expectedUpdatedAt? }
 *     → 200 the pruned echo from `substanceGalleries:upsert` plus the new
 *           `updated_at` / `updated_by`
 *     → 409 { error, conflict } when the save is stale — nothing was written
 *
 * The write mirrors the featured-carousel route: editor session checked here,
 * Postgres called with the server's token plus the actor's email for the audit
 * trail, full arrays every time, zero optimism — the panel adopts the pruned
 * echo verbatim.
 *
 * `expectedUpdatedAt` is the panel's version check: the `updated_at` it loaded,
 * or `null` when it loaded no curation row at all. Omitting it saves
 * unconditionally. When it disagrees with the stored row Postgres writes nothing
 * and reports the current server state, which this route relays as a 409 —
 * and, having written nothing, publishes nothing.
 *
 * A successful save publishes the substance article and the shared replication
 * collections, so the article's showcase reflects the new order on the public
 * deployments immediately instead of at the end of the public-data cache window.
 */
import { NextResponse } from "next/server";
import { api } from "@server/postgres/runtime/api";
import { publishPublicCache } from "@server/next/publishPublicCache";
import { JsonBodyError } from "@/lib/http/readJsonBody";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import { GALLERY_CURATION_SLUG_CAP } from "@/data/substanceReplicationGallery";

export const runtime = "nodejs";

const MAX_PAYLOAD_BYTES = 32 * 1024;

/** One shared ceiling: the Postgres mutation and the portal's meter read the same number. */
const MAX_CURATION_SLUGS = GALLERY_CURATION_SLUG_CAP;

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

type CurationBody = {
  curatedSlugs?: unknown;
  removedSlugs?: unknown;
  expectedUpdatedAt?: unknown;
};

type ParsedCurationBody = {
  curatedSlugs: string[];
  removedSlugs: string[];
  /** Absent ⇒ save unconditionally; `null` ⇒ the editor loaded no curation row. */
  expectedUpdatedAt: string | null | undefined;
};

/**
 * What a stored replication slug can actually look like. New uploads mint
 * strict kebab-case, but the legacy import left underscores and dots in the
 * corpus (`grass_photos_v2_x2-unknown`), and those rows are as curatable as
 * any other. This gate only bounces garbage; `substanceGalleries:upsert`
 * separately prunes both lists against the showcase-eligible corpus.
 */
const REPLICATION_SLUG = /^[a-z0-9][a-z0-9._-]{0,119}$/;

/**
 * How a full list refuses a save, in an editor's words rather than the
 * payload's. Hitting the exclusion ceiling used to report a field name, which
 * told an editor nothing about which of their afternoon's clicks to undo.
 */
const SLUG_LIST_OVERFLOW: Record<string, (count: number) => string> = {
  curatedSlugs: (count) =>
    `This gallery curates ${count} works; the limit is ${MAX_CURATION_SLUGS}. Uncurate some rows before saving.`,
  removedSlugs: (count) =>
    `This gallery excludes ${count} works; the limit is ${MAX_CURATION_SLUGS}. Restore some from the Excluded shelf, or exclude junk everywhere from the Library instead.`,
};

function parseSlugList(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) {
    throw new JsonBodyError(400, `A curation save needs an array of ${field}.`);
  }
  if (value.length > MAX_CURATION_SLUGS) {
    throw new JsonBodyError(400, SLUG_LIST_OVERFLOW[field](value.length));
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

/**
 * The expected stored version, as the panel saw it: an ISO `updated_at`, `null`
 * for "no curation row existed", or absent to skip the check. An empty string
 * is refused rather than relayed — it can never equal a stored timestamp, so it
 * would 409 forever instead of saving.
 */
function parseExpectedUpdatedAt(value: unknown): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  if (typeof value !== "string" || value.length === 0) {
    throw new JsonBodyError(
      400,
      "expectedUpdatedAt must be the stored updated_at string, null, or omitted.",
    );
  }
  return value;
}

function parseCurationBody(raw: CurationBody): ParsedCurationBody {
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

  return {
    curatedSlugs,
    removedSlugs,
    expectedUpdatedAt: parseExpectedUpdatedAt(raw?.expectedUpdatedAt),
  };
}

export const GET = protectedRouteOperation({
  auth: "editor",
  rateLimit: "diagnosticRead",
  capabilities: [{ type: "dataWrite" }],
  unexpectedErrorLabel: "Failed to load a substance gallery via Next route:",
  unexpectedErrorMessage: "Unable to load that substance's gallery right now.",
  operation: async ({ request, dataWrite }) => {
    if (!dataWrite) {
      throw new Error("Postgres write capability is required.");
    }

    const slug = substanceSlugOf(request);
    const apiKey = dataWrite.getAdminIntentToken?.("replicationMaintenance") ?? dataWrite.adminKey;

    const detail = await dataWrite.client.query(api.substanceGalleries.getCurationDetail, {
      apiKey,
      substance_slug: slug,
    });

    if (detail === null) {
      return NextResponse.json(
        { error: `No substance found for slug "${slug}".` },
        { status: 404 },
      );
    }

    /*
     * `effectOptions` is newer than the deployment may be. Between a checkout
     * and its Postgres deploy the query still answers without the field, and the
     * panel's tag-and-curate chooser would read `undefined.length`. An empty
     * list degrades that one control to "no effect to tag with" instead of
     * taking the whole gallery down, matching how the public read tolerates an
     * undeployed function.
     */
    return NextResponse.json({ ok: true, effectOptions: [], ...detail });
  },
});

export const POST = protectedRouteOperation<CurationBody, ParsedCurationBody>({
  auth: "admin",
  rateLimit: "editorSmallWrite",
  body: { maxBytes: MAX_PAYLOAD_BYTES, parse: parseCurationBody },
  capabilities: [{ type: "dataWrite" }],
  unexpectedErrorLabel: "Failed to save a substance gallery via Next route:",
  unexpectedErrorMessage: "Unable to save that substance's gallery right now.",
  operation: async ({ request, actorEmail, body, dataWrite }) => {
    if (!dataWrite) {
      throw new Error("Postgres write capability is required.");
    }

    const slug = substanceSlugOf(request);
    const apiKey = dataWrite.getAdminIntentToken?.("editorArticleWrite") ?? dataWrite.adminKey;

    const result = await dataWrite.client.mutation(api.substanceGalleries.upsert, {
      apiKey,
      actorEmail,
      substance_slug: slug,
      curated_slugs: body.curatedSlugs,
      removed_slugs: body.removedSlugs,
      updatedBy: actorEmail,
      expectedUpdatedAt: body.expectedUpdatedAt,
    });

    if (result.status === "conflict") {
      // Nothing was written, so nothing is stale downstream: no publication.
      return NextResponse.json(
        {
          error:
            "This substance's curation changed since you loaded it. Review the newer version before saving.",
          conflict: result.server,
        },
        { status: 409 },
      );
    }

    await publishPublicCache({
      targets: [{ kind: "article", slug }, { kind: "replication-collections" }],
      source: "manual",
    });

    return NextResponse.json({
      ok: true,
      curated_slugs: result.curated_slugs,
      removed_slugs: result.removed_slugs,
      pruned_curated: result.pruned_curated,
      pruned_removed: result.pruned_removed,
      updated_at: result.updated_at,
      updated_by: result.updated_by,
    });
  },
});

/** Eligibility is separate from membership edits and always revision-guarded. */
export const PATCH = protectedRouteOperation<
  { disabled?: unknown; expectedRevision?: unknown },
  { disabled: boolean; expectedRevision: string }
>({
  auth: "admin",
  rateLimit: "editorSmallWrite",
  body: {
    maxBytes: 1024,
    parse: (raw) => {
      if (typeof raw?.disabled !== "boolean" || typeof raw.expectedRevision !== "string" || !/^[a-f0-9]{64}$/.test(raw.expectedRevision)) {
        throw new JsonBodyError(400, "A disabled decision and the current collection revision are required.");
      }
      return { disabled: raw.disabled, expectedRevision: raw.expectedRevision };
    },
  },
  capabilities: [{ type: "dataWrite" }],
  unexpectedErrorLabel: "Failed to change substance gallery eligibility:",
  operation: async ({ request, actorEmail, body, dataWrite }) => {
    if (!dataWrite) throw new Error("Postgres write capability is required.");
    const slug = substanceSlugOf(request);
    const result = await dataWrite.client.mutation(api.substanceGalleries.setDisabled, {
      apiKey: dataWrite.getAdminIntentToken?.("editorArticleWrite") ?? dataWrite.adminKey,
      actorEmail, substance_slug: slug, ...body,
    });
    await publishPublicCache({
      targets: [{ kind: "article", slug }, { kind: "replication-collections" }],
      source: "manual",
    });
    return NextResponse.json(result);
  },
});
