/**
 * Editor read of the private submission queue.
 *
 *   GET /api/trip-report-submissions/queue?status=&limit=   newest first, capped at 250
 *   GET /api/trip-report-submissions/queue?scope=needs-review
 *   GET /api/trip-report-submissions/queue?scope=portal
 *   GET /api/trip-report-submissions/queue?id=…
 *
 * The portal scope is a compact, non-overlapping projection: uncapped needs
 * review plus non-needs rows from the existing newest-250 history window. Full
 * private submission detail is read only when the editor selects a row.
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
    const id = searchParams.get("id");

    if (id !== null) {
      if (!id.trim() || id.length > 200 || scope !== null || searchParams.has("status") || searchParams.has("limit")) {
        throw new InvalidQueueFilterError("Submission detail takes only a valid id.");
      }

      const store = await getTripReportSubmissionStore();
      const submission = await store.get(id.trim());
      if (!submission) {
        return NextResponse.json({ error: "Trip report submission not found." }, { status: 404 });
      }

      return NextResponse.json(
        { ok: true, submission },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    }

    if (scope !== null) {
      if (scope !== "needs-review" && scope !== "portal") {
        throw new InvalidQueueFilterError(`Unknown trip report queue scope: ${scope}`);
      }

      if (searchParams.has("status") || searchParams.has("limit")) {
        throw new InvalidQueueFilterError(`The ${scope} scope takes no status or limit.`);
      }

      const store = await getTripReportSubmissionStore();
      if (scope === "portal") {
        const index = await store.listPortalSummaries();
        return NextResponse.json({ ok: true, ...index });
      }

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
