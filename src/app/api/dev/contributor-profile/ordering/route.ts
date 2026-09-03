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
 * Editor floor, ownership in Convex: `setContributorOrdering` lets an admin
 * curate any profile and an editor only their own, refused here as 403.
 */
import { NextResponse } from "next/server";
import { api } from "../../../../../../convex/_generated/api";
import { JsonBodyError } from "@/lib/http/readJsonBody";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import { revalidateContributorSurfaces } from "../contributorRevalidation";

export const runtime = "nodejs";

/** Matches `MAX_ORDER_SLUGS` in `convex/lib/contributorProfiles.ts`. */
const MAX_ORDER_SLUGS = 500;
const MAX_SLUG_LENGTH = 200;

type OrderingBody = {
  key?: unknown;
  replicationOrder?: unknown;
  reportOrder?: unknown;
};

type ParsedOrdering = {
  key: string;
  replicationOrder?: string[];
  reportOrder?: string[];
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

export function parseOrderingBody(raw: OrderingBody): ParsedOrdering {
  const key = typeof raw.key === "string" ? raw.key.trim() : "";
  if (!key) {
    throw new JsonBodyError(400, "A contributor profile key is required.");
  }

  const replicationOrder = parseOrder(raw.replicationOrder, "The works order");
  const reportOrder = parseOrder(raw.reportOrder, "The reports order");

  if (replicationOrder === undefined && reportOrder === undefined) {
    throw new JsonBodyError(400, "Send at least one ordering to save.");
  }

  return {
    key,
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
  capabilities: [{ type: "convexWrite" }],
  unexpectedErrorLabel: "Failed to save a contributor ordering via Next route:",
  unexpectedErrorMessage: "Unable to save that ordering right now.",
  mapError: (error) => {
    // Convex wraps thrown mutation errors, so match by substring.
    const message = error instanceof Error ? error.message : "";
    if (message.includes("You can only edit your own contributor profile")) {
      return NextResponse.json(
        { error: "You can only edit your own contributor profile." },
        { status: 403 },
      );
    }
    return null;
  },
  operation: async ({ actorEmail, body, convexWrite }) => {
    if (!convexWrite) {
      throw new Error("Convex write capability is required.");
    }

    const apiKey = convexWrite.getAdminIntentToken?.("profileMediaWrite") ?? convexWrite.adminKey;

    const result = await convexWrite.client.mutation(
      api.contributorProfiles.setContributorOrdering,
      {
        apiKey,
        actorEmail,
        key: body.key,
        ...(body.replicationOrder === undefined
          ? {}
          : { replicationOrder: body.replicationOrder }),
        ...(body.reportOrder === undefined ? {} : { reportOrder: body.reportOrder }),
      },
    );

    revalidateContributorSurfaces({
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
