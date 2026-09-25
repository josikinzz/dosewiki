/**
 * Open citation articles for the `/dev` Citations rail badge.
 *
 * Its own endpoint because the shell asks on every `/dev` visit, while the
 * queue summaries are only sent when the Citations tab is open. The count is
 * the queue's own `open` filter over the same summaries, so the badge and the
 * Open queue cannot disagree about which articles are waiting.
 *
 *   GET /api/citation-evidence/open-count -> { count }
 */
import { NextResponse } from "next/server";
import { api } from "@server/postgres/runtime/api";
import {
  matchesQueueSummaryStatus,
  type CitationQueueSummary,
} from "../../../../../server/lib/citationQueueFilter";
import { citationEvidenceRouteOperation } from "../_shared";

export const runtime = "nodejs";

export const GET = citationEvidenceRouteOperation({
  rateLimit: "diagnosticRead",
  unexpectedErrorLabel: "Failed to count open citation articles via Next route:",
  unexpectedErrorMessage: "Unable to count open citation articles right now.",
  operation: async ({ actorEmail, dataWrite }) => {
    const summaries: CitationQueueSummary[] = await dataWrite.client.query(
      api.citationEvidence.getQueueSummary,
      {
        apiKey: dataWrite.getAdminIntentToken?.("citationEvidenceReview") ?? dataWrite.adminKey,
        actorEmail,
      },
    );
    const count = summaries.filter((summary) => matchesQueueSummaryStatus("open", summary)).length;
    return NextResponse.json({ ok: true, count });
  },
});
