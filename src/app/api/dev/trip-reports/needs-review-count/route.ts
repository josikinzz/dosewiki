/**
 * Needs-review count for the `/dev` tab rail badge.
 *
 * Its own endpoint rather than a field on the corpus read, because the badge is
 * fetched by the shell on every `/dev` visit while the corpus is only fetched
 * when the Trip Report Portal is actually open. Making the badge pay for the
 * whole corpus would put the cost back into first paint, which is exactly what
 * the dev shell stopped doing when the tools were split into dynamic bundles.
 *
 * The statuses counted are `NEEDS_REVIEW_SUBMISSION_STATUSES`, the same list
 * the portal's Needs review bucket is built from, so the badge and the queue
 * cannot disagree about which rows are waiting.
 *
 *   GET /api/dev/trip-reports/needs-review-count → { count }
 */
import { NextResponse } from "next/server";

import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import {
  getTripReportSubmissionStore,
  TripReportSubmissionStorageConfigurationError,
} from "@/features/reports/submissions/tripReportSubmissionStore.server";
import { NEEDS_REVIEW_SUBMISSION_STATUSES } from "@/features/dev/tools/trip-report-portal/tripReportPortalModel";

export const runtime = "nodejs";

export const GET = protectedRouteOperation({
  auth: "editor",
  rateLimit: "diagnosticRead",
  unexpectedErrorLabel: "Failed to count trip reports awaiting review:",
  unexpectedErrorMessage: "Unable to count trip reports awaiting review right now.",
  mapError: (error) => {
    if (error instanceof TripReportSubmissionStorageConfigurationError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }

    return null;
  },
  operation: async () => {
    const store = await getTripReportSubmissionStore();
    const count = await store.count({ statuses: NEEDS_REVIEW_SUBMISSION_STATUSES });

    return NextResponse.json({ ok: true, count });
  },
});
