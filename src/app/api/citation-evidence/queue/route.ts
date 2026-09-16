import { NextResponse } from "next/server";
import { api } from "@server/postgres/runtime/api";
import {
  finalizeQueueSummaries,
  type CitationQueueSummary,
} from "../../../../../server/lib/citationQueueFilter";
import { JsonBodyError } from "@/lib/http/readJsonBody";
import { classifyDataRejection } from "@/lib/http/dataRejection";
import {
  isCitationReviewQueueFilter,
  type CitationReviewQueueFilter,
  type CitationReviewQueueLoadFailure,
} from "@/features/dev/tools/citation-review/citationReviewModels";
import { citationEvidenceRouteOperation } from "../_shared";

export const runtime = "nodejs";

const UNEXPECTED_ERROR_LABEL = "Failed to read citation review queue via Next route:";

function parseStatus(value: string | null): CitationReviewQueueFilter {
  if (!value) {
    return "open";
  }

  if (!isCitationReviewQueueFilter(value)) {
    throw new JsonBodyError(400, `Unknown citation review queue filter: ${value}`);
  }

  return value;
}

/** Postgres stamps every failed request with an id the reviewer can report. */
function dataRequestId(error: unknown): string | null {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  return /\[Request ID: ([0-9a-f]+)\]/i.exec(message)?.[1] ?? null;
}

export const GET = citationEvidenceRouteOperation({
  rateLimit: "diagnosticRead",
  unexpectedErrorLabel: UNEXPECTED_ERROR_LABEL,
  unexpectedErrorMessage: "Unable to load the citation review queue right now.",
  mapError: (error) => {
    // A deliberate refusal keeps its own text; only a crashed or refused
    // query is classified here so the reviewer learns which side failed.
    if (classifyDataRejection(error)) {
      return null;
    }

    const requestId = dataRequestId(error);
    if (!requestId) {
      return null;
    }

    console.error(UNEXPECTED_ERROR_LABEL, error);
    return NextResponse.json(
      {
        error: "The data server could not run the queue query.",
        cause: "query",
        requestId,
      } satisfies CitationReviewQueueLoadFailure,
      { status: 502 },
    );
  },
  operation: async ({ request, actorEmail, dataWrite }) => {
    const status = parseStatus(new URL(request.url).searchParams.get("status"));
    const apiKey =
      dataWrite.getAdminIntentToken?.("citationEvidenceReview") ??
      dataWrite.adminKey;

    const summaries: CitationQueueSummary[] =
      await dataWrite.client.query(api.citationEvidence.getQueueSummary, {
        apiKey,
        actorEmail,
      });

    return NextResponse.json({
      ok: true,
      queue: finalizeQueueSummaries(summaries, status),
    });
  },
});
