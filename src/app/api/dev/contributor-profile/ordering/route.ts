/**
 * Curated ordering write for the Contributors tab's Works and Reports panels.
 *
 *   POST /api/dev/contributor-profile/ordering
 *     { key, replicationOrder?: string[], reportOrder?: string[] }
 *
 * Partial curation: the slugs sent here render first, in this order, and
 * anything unlisted follows in the surface's own default sort. An omitted array
 * leaves that ordering untouched; an empty array is how curation is removed.
 * Slugs that no longer resolve are pruned by the mutation and reported back, so
 * the panel can say what it dropped rather than silently losing a position.
 *
 * Editor floor, ownership in Postgres: `setContributorOrdering` lets an admin
 * curate any profile and an editor only their own, refused here as 403.
 */
import { NextResponse } from "next/server";
import { api } from "@server/postgres/runtime/api";
import { JsonBodyError } from "@/lib/http/readJsonBody";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import { revalidateContributorSurfaces } from "../contributorRevalidation";

export const runtime = "nodejs";

/** Matches `MAX_ORDER_SLUGS` in `server/lib/contributorProfiles.ts`. */
const MAX_ORDER_SLUGS = 500;
const MAX_SLUG_LENGTH = 200;

type OrderingBody = {
  key?: unknown;
  replicationOrder?: unknown;
  reportOrder?: unknown;
  expectedRevision?: unknown;
};

type ParsedOrdering = {
  key: string;
  replicationOrder?: string[];
  reportOrder?: string[];
  expectedRevision?: string;
};

function parseOrder(raw: unknown, label: string): string[] | undefined {
  if (raw === undefined) {
    return undefined;
  }
  if (!Array.isArray(raw)) {
    throw new JsonBodyError(400, `${label} must be an array of slugs.`);
  }
  if (raw.length > MAX_ORDER_SLUGS) {
    throw new JsonBodyError(400, `${label} may hold at most ${MAX_ORDER_SLUGS} slugs.`);
  }

  return raw.map((entry) => {
    if (typeof entry !== "string" || !entry.trim() || entry.length > MAX_SLUG_LENGTH) {
      throw new JsonBodyError(400, `${label} contains an invalid slug.`);
    }
    return entry.trim();
  });
}

function parseOrderingBody(raw: OrderingBody): ParsedOrdering {
  const key = typeof raw.key === "string" ? raw.key.trim() : "";
  if (!key) {
    throw new JsonBodyError(400, "A contributor profile key is required.");
  }

  const replicationOrder = parseOrder(raw.replicationOrder, "The works order");
  const reportOrder = parseOrder(raw.reportOrder, "The reports order");
  if (replicationOrder !== undefined && (typeof raw.expectedRevision !== "string" || !/^[a-f0-9]{64}$/.test(raw.expectedRevision))) throw new JsonBodyError(400, "Reload the stored works order before saving.");

  if (replicationOrder === undefined && reportOrder === undefined) {
    throw new JsonBodyError(400, "Send at least one ordering to save.");
  }

  return {
    key,
    expectedRevision: typeof raw.expectedRevision === "string" ? raw.expectedRevision : undefined,
    ...(replicationOrder === undefined ? {} : { replicationOrder }),
    ...(reportOrder === undefined ? {} : { reportOrder }),
  };
}

export const POST = protectedRouteOperation<OrderingBody, ParsedOrdering>({
  auth: "editor",
  rateLimit: "editorSmallWrite",
  body: {
    maxBytes: 128 * 1024,
    parse: parseOrderingBody,
  },
  capabilities: [{ type: "dataWrite" }],
  unexpectedErrorLabel: "Failed to save a contributor ordering via Next route:",
  unexpectedErrorMessage: "Unable to save that ordering right now.",
  mapError: (error) => {
    // Postgres wraps thrown mutation errors, so match by substring.
    const message = error instanceof Error ? error.message : "";
    if (message.includes("You can only edit your own contributor profile")) {
      return NextResponse.json(
        { error: "You can only edit your own contributor profile." },
        { status: 403 },
      );
    }
    return null;
  },
  operation: async ({ actorEmail, body, dataWrite }) => {
    if (!dataWrite) {
      throw new Error("Postgres write capability is required.");
    }

    const apiKey = dataWrite.getAdminIntentToken?.("profileMediaWrite") ?? dataWrite.adminKey;

    const result = await dataWrite.client.mutation(
      api.contributorProfiles.setContributorOrdering,
      {
        apiKey,
        actorEmail,
        key: body.key,
        expectedRevision: body.expectedRevision,
        ...(body.replicationOrder === undefined
          ? {}
          : { replicationOrder: body.replicationOrder }),
        ...(body.reportOrder === undefined ? {} : { reportOrder: body.reportOrder }),
      },
    );

    await revalidateContributorSurfaces({
      contributorKeys: result.revalidate?.contributorKeys ?? [result.key],
      scope: "ordering",
    });

    return NextResponse.json({
      ok: true,
      key: result.key,
      replicationOrder: result.replicationOrder,
      reportOrder: result.reportOrder,
      prunedReplicationSlugs: result.prunedReplicationSlugs,
      prunedReportSlugs: result.prunedReportSlugs,
    });
  },
});
