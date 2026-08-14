import { NextResponse } from "next/server";

import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import {
  isSiteFeedbackStatus,
  type SiteFeedbackStatus,
} from "@/features/site-feedback/siteFeedback";
import {
  SiteFeedbackStorageConfigurationError,
  getSiteFeedbackStore,
} from "@/features/site-feedback/siteFeedbackStore.server";

export const runtime = "nodejs";

export const GET = protectedRouteOperation({
  auth: "editor",
  rateLimit: "diagnosticRead",
  unexpectedErrorLabel: "Failed to load site feedback queue:",
  unexpectedErrorMessage: "Unable to load site feedback right now.",
  mapError: (error) => {
    if (error instanceof InvalidQueueFilterError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (error instanceof SiteFeedbackStorageConfigurationError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }

    return null;
  },
  operation: async ({ request }) => {
    const { searchParams } = new URL(request.url);
    const status = parseStatus(searchParams.get("status"));
    const limit = parseLimit(searchParams.get("limit"));
    const store = await getSiteFeedbackStore();
    const feedback = await store.list({ status, limit });

    return NextResponse.json({ ok: true, feedback });
  },
});

class InvalidQueueFilterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidQueueFilterError";
  }
}

function parseStatus(value: string | null): SiteFeedbackStatus | undefined {
  if (!value) {
    return undefined;
  }

  if (!isSiteFeedbackStatus(value)) {
    throw new InvalidQueueFilterError(`Unknown site feedback status: ${value}`);
  }

  return value;
}

function parseLimit(value: string | null): number {
  if (!value) {
    return 100;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 100;
}
