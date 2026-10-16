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

const MAX_EXCLUDED_SUBSTANCES = 250;

const PAGE_LIMIT = 100;
const MAX_PAGES = 100;

const SUBSTANCE_SLUG = /^[a-z0-9]+(?:[-.][a-z0-9]+)*$/;

const REPLICATION_SLUG = /^[a-z0-9][a-z0-9._-]{0,119}$/;

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
