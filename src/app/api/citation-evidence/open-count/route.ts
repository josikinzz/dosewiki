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
