/**
 * Editor read of the private submission queue.
 *
 *   GET /api/trip-report-submissions/queue?status=&limit=   newest first, capped at 250
 *   GET /api/trip-report-submissions/queue?scope=needs-review
 *
 * The `needs-review` scope is uncapped and reads `NEEDS_REVIEW_SUBMISSION_STATUSES`,
 * the same list `/api/dev/trip-reports/needs-review-count` counts, so the portal's
 * bucket holds exactly the rows the rail badge announces. It takes no `status`
 * or `limit`: the scope is the filter.
 */
import { NextResponse } from "next/server";

import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import {
  getTripReportSubmissionStore,
  TripReportSubmissionStorageConfigurationError,
} from "@/features/reports/submissions/tripReportSubmissionStore.server";
import {
  isTripReportSubmissionStatus,
  type TripReportSubmissionStatus,
} from "@/features/reports/submissions/tripReportSubmissions";
import { NEEDS_REVIEW_SUBMISSION_STATUSES } from "@/features/dev/tools/trip-report-portal/tripReportPortalModel";

export const runtime = "nodejs";

export const GET = protectedRouteOperation({
  auth: "editor",
  rateLimit: "diagnosticRead",
  unexpectedErrorLabel: "Failed to load trip report submission queue:",
  unexpectedErrorMessage: "Unable to load trip report submissions right now.",
  mapError: (error) => {
    if (error instanceof InvalidQueueFilterError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (error instanceof TripReportSubmissionStorageConfigurationError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }

    return null;
  },
  operation: async ({ request }) => {
    const { searchParams } = new URL(request.url);
    const scope = searchParams.get("scope");

    if (scope !== null) {
      if (scope !== "needs-review") {
        throw new InvalidQueueFilterError(`Unknown trip report queue scope: ${scope}`);
      }

      if (searchParams.has("status") || searchParams.has("limit")) {
        throw new InvalidQueueFilterError("The needs-review scope takes no status or limit.");
      }

      const store = await getTripReportSubmissionStore();
      const submissions = await store.listByStatuses({ statuses: NEEDS_REVIEW_SUBMISSION_STATUSES });
      return NextResponse.json({ ok: true, submissions });
    }

    const status = parseStatus(searchParams.get("status"));
    const limit = parseLimit(searchParams.get("limit"));
    const store = await getTripReportSubmissionStore();
    const submissions = await store.list({ status, limit });

    return NextResponse.json({ ok: true, submissions });
  },
});

function parseStatus(value: string | null): TripReportSubmissionStatus | undefined {
  if (!value) {
    return undefined;
  }

  if (!isTripReportSubmissionStatus(value)) {
    throw new InvalidQueueFilterError(`Unknown trip report submission status: ${value}`);
  }

  return value;
}

class InvalidQueueFilterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidQueueFilterError";
  }
}

function parseLimit(value: string | null): number {
  if (!value) {
    return 100;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 100;
}
