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
