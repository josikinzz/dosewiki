import { NextResponse } from "next/server";
import { api } from "@server/postgres/runtime/api";
import { publishPublicCache } from "@server/next/publishPublicCache";
import { JsonBodyError } from "@/lib/http/readJsonBody";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import { GALLERY_CURATION_SLUG_CAP } from "@/data/substanceReplicationGallery";

export const runtime = "nodejs";

const MAX_PAYLOAD_BYTES = 32 * 1024;

const MAX_CURATION_SLUGS = GALLERY_CURATION_SLUG_CAP;

const SUBSTANCE_SLUG = /^[a-z0-9]+(?:[-.][a-z0-9]+)*$/;

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
  expectedUpdatedAt: string | null | undefined;
};

const REPLICATION_SLUG = /^[a-z0-9][a-z0-9._-]{0,119}$/;

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
