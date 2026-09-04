import { NextResponse } from "next/server";
import { api } from "../../../../../convex/_generated/api";
import {
  finalizeQueueSummaries,
  mergeQueueSummary,
  type CitationQueueSummary,
} from "../../../../../convex/lib/citationQueueFilter";
import { JsonBodyError } from "@/lib/http/readJsonBody";
import { classifyConvexRejection } from "@/lib/http/convexRejection";
import {
  isCitationReviewQueueFilter,
  type CitationReviewQueueFilter,
  type CitationReviewQueueLoadFailure,
} from "@/features/dev/tools/citation-review/citationReviewModels";
import { citationEvidenceRouteOperation } from "../_shared";

export const runtime = "nodejs";

// Each Convex query may read one page; the whole table is summarized by
// walking pages here. The cap bounds a runaway table at 200k rows.
const QUEUE_SUMMARY_MAX_PAGES = 200;

const UNEXPECTED_ERROR_LABEL = "Failed to read citation review queue via Next route:";

class QueueCapacityError extends Error {
  constructor() {
    super(`Citation review queue exceeded the ${QUEUE_SUMMARY_MAX_PAGES}-page cap.`);
    this.name = "QueueCapacityError";
  }
}

function parseStatus(value: string | null): CitationReviewQueueFilter {
  if (!value) {
    return "open";
  }

  if (!isCitationReviewQueueFilter(value)) {
    throw new JsonBodyError(400, `Unknown citation review queue filter: ${value}`);
  }

  return value;
}

/** Convex stamps every failed request with an id the reviewer can report. */
function convexRequestId(error: unknown): string | null {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  return /\[Request ID: ([0-9a-f]+)\]/i.exec(message)?.[1] ?? null;
}

export const GET = citationEvidenceRouteOperation({
  rateLimit: "diagnosticRead",
  unexpectedErrorLabel: UNEXPECTED_ERROR_LABEL,
  unexpectedErrorMessage: "Unable to load the citation review queue right now.",
  mapError: (error) => {
    if (error instanceof QueueCapacityError) {
      console.error(UNEXPECTED_ERROR_LABEL, error);
      return NextResponse.json(
        {
          error: "The evidence table has grown past what the queue can summarize in one load.",
          cause: "capacity",
        } satisfies CitationReviewQueueLoadFailure,
        { status: 500 },
      );
    }

    // A deliberate refusal keeps its own text; only a crashed or refused
    // query is classified here so the reviewer learns which side failed.
    if (classifyConvexRejection(error)) {
      return null;
    }

    const requestId = convexRequestId(error);
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
  operation: async ({ request, actorEmail, convexWrite }) => {
    const status = parseStatus(new URL(request.url).searchParams.get("status"));
    const apiKey =
      convexWrite.getAdminIntentToken?.("citationEvidenceReview") ??
      convexWrite.adminKey;

    const summaries = new Map<string, CitationQueueSummary>();
    let cursor: string | null = null;
    for (let pagesRead = 0; ; pagesRead += 1) {
      if (pagesRead >= QUEUE_SUMMARY_MAX_PAGES) {
        throw new QueueCapacityError();
      }

      const page: { summaries: CitationQueueSummary[]; continueCursor: string | null } =
        await convexWrite.client.query(api.citationEvidence.getQueueSummary, {
          apiKey,
          actorEmail,
          cursor,
        });

      for (const summary of page.summaries) {
        mergeQueueSummary(summaries, summary);
      }

      if (page.continueCursor === null) {
        break;
      }
      cursor = page.continueCursor;
    }

    return NextResponse.json({
      ok: true,
      queue: finalizeQueueSummaries(summaries.values(), status),
    });
  },
});
