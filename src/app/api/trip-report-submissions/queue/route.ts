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
    const statusParam = searchParams.get("status");
    const status = parseStatus(statusParam);
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
