import { NextResponse } from "next/server";
import { api } from "../../../../../convex/_generated/api";
import { JsonBodyError } from "@/lib/http/readJsonBody";
import {
  isCitationReviewQueueFilter,
  type CitationReviewQueueFilter,
} from "@/features/dev/tools/citation-review/citationReviewModels";
import { citationEvidenceRouteOperation } from "../_shared";

export const runtime = "nodejs";

function parseStatus(value: string | null): CitationReviewQueueFilter {
  if (!value) {
    return "open";
  }

  if (!isCitationReviewQueueFilter(value)) {
    throw new JsonBodyError(400, `Unknown citation review queue filter: ${value}`);
  }

  return value;
}

export const GET = citationEvidenceRouteOperation({
  rateLimit: "diagnosticRead",
  unexpectedErrorLabel: "Failed to read citation review queue via Next route:",
  unexpectedErrorMessage: "Unable to load the citation review queue right now.",
  operation: async ({ request, actorEmail, convexWrite }) => {
    const status = parseStatus(new URL(request.url).searchParams.get("status"));
    const apiKey =
      convexWrite.getAdminIntentToken?.("citationEvidenceReview") ??
      convexWrite.adminKey;
    const queue = await convexWrite.client.query(api.citationEvidence.getQueueSummary, {
      apiKey,
      actorEmail,
      status,
    });

    return NextResponse.json({
      ok: true,
      queue,
    });
  },
});
