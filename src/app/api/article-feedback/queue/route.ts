import { NextResponse } from "next/server";

import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import {
  isArticleFeedbackStatus,
  type ArticleFeedbackStatus,
} from "@/features/article/feedback/articleFeedback";
import {
  ArticleFeedbackStorageConfigurationError,
  getArticleFeedbackStore,
} from "@/features/article/feedback/articleFeedbackStore.server";

export const runtime = "nodejs";

export const GET = protectedRouteOperation({
  auth: "editor",
  rateLimit: "diagnosticRead",
  unexpectedErrorLabel: "Failed to load article feedback queue:",
  unexpectedErrorMessage: "Unable to load article feedback right now.",
  mapError: (error) => {
    if (error instanceof InvalidQueueFilterError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (error instanceof ArticleFeedbackStorageConfigurationError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }

    return null;
  },
  operation: async ({ request }) => {
    const { searchParams } = new URL(request.url);
    const status = parseStatus(searchParams.get("status"));
    const limit = parseLimit(searchParams.get("limit"));
    const store = await getArticleFeedbackStore();
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

function parseStatus(value: string | null): ArticleFeedbackStatus | undefined {
  if (!value) {
    return undefined;
  }

  if (!isArticleFeedbackStatus(value)) {
    throw new InvalidQueueFilterError(`Unknown article feedback status: ${value}`);
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
