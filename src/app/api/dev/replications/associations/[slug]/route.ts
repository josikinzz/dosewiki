/**
 * Editor read + write for one replication's drug associations
 * (`/dev` → Replications → Studio → associations panel).
 *
 *   GET   /api/dev/replications/associations/<slug>
 *     → { ok, associations }
 *   PATCH /api/dev/replications/associations/<slug>
 *          { substanceSlug, assigned }
 *     → { ok, association }
 *   POST  /api/dev/replications/associations/<slug>
 *          { excludedSubstanceSlugs }
 *     → { ok, updated, droppedCuratedPositions }
 * The association is derived, never stored: a substance article surfaces this
 * replication when one of its visual-effect names resolves to the row's owning
 * `effect_slug` or to one of its `effect_tags`. So there is no join table to
 * read — Postgres walks the article table
 * (`substanceGalleries:getReplicationAssociationsPage`) and pages to stay under
 * its read limits, and this route drains the cursor so the panel makes exactly
 * one request. A figure or audio row is on no article and answers with an empty
 * list rather than an error.
 *
 * The write is a full-set replace: `excludedSubstanceSlugs` is every drug that
 * should suppress this replication, and every drug missing from it stops
 * suppressing it. Each decision lands in that one substance's `removed_slugs`,
 * the same delta the per-substance curation portal writes — unticking a drug is
 * never an `effect_tags` edit, which would drop the replication off every
 * article deriving that effect.
 *
 * Its own URL segment rather than a `substances`-sibling parameter: the picker
 * route at `/api/dev/replications/substances` is static, and a `[slug]` in that
 * segment reads as a substance address everywhere else in this tree.
 *
 * A successful save publishes each written substance article and the shared
 * replication collections, so the showcases this replication left or joined
 * reflect the change on the public deployments immediately instead of at the
 * end of the public-data cache window.
 */
import { NextResponse } from "next/server";
import { api } from "@server/postgres/runtime/api";
import type { PublicationTarget } from "@server/next/publicationWire";
import { publishPublicCache } from "@server/next/publishPublicCache";
import { JsonBodyError } from "@/lib/http/readJsonBody";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import { replicationViewerEditorRoute } from "@server/next/replicationViewerEditorPolicy";
import type { ReplicationAssociation } from "@/features/dev/tools/replication-studio/replicationAssociationModel";

export const runtime = "nodejs";

const MAX_PAYLOAD_BYTES = 32 * 1024;

/** Matches the ceiling enforced in `server/substanceGalleries.ts`. */
const MAX_EXCLUDED_SUBSTANCES = 250;

const PAGE_LIMIT = 100;
/** Hard stop against a cursor that never reports done. */
const MAX_PAGES = 100;

/** Substance slugs are kebab-case with the occasional dotted segment. */
const SUBSTANCE_SLUG = /^[a-z0-9]+(?:[-.][a-z0-9]+)*$/;

/**
 * What a stored replication slug can actually look like — the tolerant shape
 * the curation route accepts, not strict kebab-case: the legacy import left
 * underscores and dots in the corpus (`grass_photos_v2_x2-unknown`) and those
 * rows have associations like any other.
 */
const REPLICATION_SLUG = /^[a-z0-9][a-z0-9._-]{0,119}$/;

/** The `<slug>` path segment, or a 404 refusal for a shape no replication has. */
function replicationSlugOf(request: Request): string {
  const segments = new URL(request.url).pathname.split("/").filter(Boolean);
  const slug = decodeURIComponent(segments[segments.length - 1] ?? "").trim().toLowerCase();
  if (!REPLICATION_SLUG.test(slug)) {
    throw new JsonBodyError(404, "No replication found for that address.");
  }
  return slug;
}

type ExclusionBody = {
  excludedSubstanceSlugs?: unknown;
};

type ParsedExclusionBody = {
  excludedSubstanceSlugs: string[];
};

/**
 * The authoritative set of drugs that should suppress this replication.
 * Membership is what matters, so duplicates are collapsed rather than refused;
 * anything that is not a substance address is a client bug and is bounced.
 */
function parseExclusionBody(raw: ExclusionBody): ParsedExclusionBody {
  const value = raw?.excludedSubstanceSlugs;
  if (!Array.isArray(value)) {
    throw new JsonBodyError(400, "An association save needs an array of excludedSubstanceSlugs.");
  }
  if (value.length > MAX_EXCLUDED_SUBSTANCES) {
    throw new JsonBodyError(
      400,
      `A replication may be excluded from at most ${MAX_EXCLUDED_SUBSTANCES} substances.`,
    );
  }

  const slugs: string[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== "string" || !SUBSTANCE_SLUG.test(entry)) {
      throw new JsonBodyError(
        400,
        "Every entry of excludedSubstanceSlugs must be a lowercase substance slug.",
      );
    }
    if (seen.has(entry)) {
      continue;
    }
    seen.add(entry);
    slugs.push(entry);
  }
  return { excludedSubstanceSlugs: slugs };
}

type DirectAssociationBody = {
  substanceSlug?: unknown;
  assigned?: unknown;
};

function parseDirectAssociationBody(raw: DirectAssociationBody): {
  substanceSlug: string;
  assigned: boolean;
} {
  if (
    typeof raw.substanceSlug !== "string" ||
    !SUBSTANCE_SLUG.test(raw.substanceSlug)
  ) {
    throw new JsonBodyError(400, "A valid lowercase substance slug is required.");
  }
  if (typeof raw.assigned !== "boolean") {
    throw new JsonBodyError(400, "assigned must be true or false.");
  }
  return { substanceSlug: raw.substanceSlug, assigned: raw.assigned };
}

export const GET = protectedRouteOperation({
  auth: "editor",
  rateLimit: "diagnosticRead",
  capabilities: [{ type: "dataWrite" }],
  unexpectedErrorLabel: "Failed to load a replication's associations via Next route:",
  unexpectedErrorMessage: "Unable to load that replication's drug associations right now.",
  operation: async ({ request, dataWrite }) => {
    if (!dataWrite) {
      throw new Error("Postgres write capability is required.");
    }

    const slug = replicationSlugOf(request);
    const apiKey = dataWrite.getAdminIntentToken?.("replicationMaintenance") ?? dataWrite.adminKey;

    const rows: ReplicationAssociation[] = [];
    let cursor: string | undefined;
    for (let pages = 0; pages < MAX_PAGES; pages += 1) {
      const page = (await dataWrite.client.query(
        api.substanceGalleries.getReplicationAssociationsPage,
        { apiKey, replicationSlug: slug, cursor, limit: PAGE_LIMIT },
      )) as { items: ReplicationAssociation[]; cursor: string; isDone: boolean };
      rows.push(...page.items);
      if (page.isDone) {
        break;
      }
      cursor = page.cursor;
    }

    // A slug stored on two articles is ambiguous, and the write refuses to
    // touch one for exactly that reason, so both copies are dropped rather than
    // offering a tick box that could never save.
    const slugCounts = new Map<string, number>();
    for (const row of rows) {
      slugCounts.set(row.slug, (slugCounts.get(row.slug) ?? 0) + 1);
    }

    const associations = rows
      .filter((row) => slugCounts.get(row.slug) === 1)
      .sort((a, b) => a.title.localeCompare(b.title));

    return NextResponse.json({ ok: true, associations });
  },
});

export const PATCH = replicationViewerEditorRoute(protectedRouteOperation<
  DirectAssociationBody,
  ReturnType<typeof parseDirectAssociationBody>
>({
  auth: "admin",
  rateLimit: "editorSmallWrite",
  body: { maxBytes: 4 * 1024, parse: parseDirectAssociationBody },
  capabilities: [{ type: "dataWrite" }],
  unexpectedErrorLabel: "Failed to update a replication's drug association:",
  unexpectedErrorMessage: "Unable to update that drug assignment right now.",
  operation: async ({ request, actorEmail, body, dataWrite }) => {
    if (!dataWrite) {
      throw new Error("Postgres write capability is required.");
    }
    const slug = replicationSlugOf(request);
    const result = await dataWrite.client.mutation(
      api.substanceGalleries.setReplicationDirectAssociation,
      {
        apiKey:
          dataWrite.getAdminIntentToken?.("editorArticleWrite") ??
          dataWrite.adminKey,
        actorEmail,
        replicationSlug: slug,
        substanceSlug: body.substanceSlug,
        assigned: body.assigned,
      },
    );
    await publishPublicCache({
      targets: [
        { kind: "article", slug: body.substanceSlug },
        { kind: "replication-collections" },
      ],
      source: "manual",
    });
    return NextResponse.json({ ok: true, association: result.association });
  },
}));

export const POST = protectedRouteOperation<ExclusionBody, ParsedExclusionBody>({
  auth: "admin",
  rateLimit: "editorSmallWrite",
  body: { maxBytes: MAX_PAYLOAD_BYTES, parse: parseExclusionBody },
  capabilities: [{ type: "dataWrite" }],
  unexpectedErrorLabel: "Failed to save a replication's associations via Next route:",
  unexpectedErrorMessage: "Unable to save that replication's drug associations right now.",
  operation: async ({ request, actorEmail, body, dataWrite }) => {
    if (!dataWrite) {
      throw new Error("Postgres write capability is required.");
    }

    const slug = replicationSlugOf(request);
    const apiKey = dataWrite.getAdminIntentToken?.("editorArticleWrite") ?? dataWrite.adminKey;

    const result = await dataWrite.client.mutation(
      api.substanceGalleries.setReplicationExclusions,
      {
        apiKey,
        actorEmail,
        replicationSlug: slug,
        excludedSubstanceSlugs: body.excludedSubstanceSlugs,
        updatedBy: actorEmail,
      },
    );

    // Only substances whose row actually changed are published; a save that
    // wrote nothing leaves every cache entry still true.
    if (result.updated.length > 0) {
      const targets: PublicationTarget[] = [{ kind: "replication-collections" }];
      for (const substanceSlug of result.updated) {
        targets.push({ kind: "article", slug: substanceSlug });
      }
      await publishPublicCache({ targets, source: "manual" });
    }

    return NextResponse.json({
      ok: true,
      updated: result.updated,
      droppedCuratedPositions: result.droppedCuratedPositions,
    });
  },
});
