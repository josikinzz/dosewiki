import { NextResponse } from "next/server";

import { JsonBodyError, readJsonBody } from "@/lib/http/readJsonBody";
import type { ArticleFeedbackInput } from "@/features/article/feedback/articleFeedback";
import {
  ArticleFeedbackStorageConfigurationError,
  ArticleFeedbackValidationError,
  getArticleFeedbackIpHashSecret,
  getPublicArticleFeedbackStore,
} from "@/features/article/feedback/articleFeedbackStore.server";
import { enforceRateLimit, getClientIp } from "@server/http/nextRateLimit";

export const runtime = "nodejs";

const MAX_FEEDBACK_PAYLOAD_BYTES = 32 * 1024;

type PublicFeedbackBody = {
  substance_slug?: unknown;
  substance_title?: unknown;
  category?: unknown;
  importance?: unknown;
  details?: unknown;
  source_url?: unknown;
  contact_email?: unknown;
  honeypot?: unknown;
  website?: unknown;
};

export async function POST(request: Request) {
  const rateLimited = await enforceRateLimit(request, "publicArticleFeedbackSubmit");
  if (rateLimited) {
    return rateLimited;
  }

  try {
    const rawBody = await readJsonBody<PublicFeedbackBody>(request, {
      maxBytes: MAX_FEEDBACK_PAYLOAD_BYTES,
    });
    const body = parseFeedbackBody(rawBody, request);
    const store = await getPublicArticleFeedbackStore();
    const row = await store.create(body, {
      ip: getClientIp(request),
      ip_hash_secret: getArticleFeedbackIpHashSecret(),
    });

    return NextResponse.json(
      { ok: true, id: row.id, status: "received" },
      { status: 202 },
    );
  } catch (error) {
    if (error instanceof JsonBodyError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    if (error instanceof ArticleFeedbackValidationError) {
      return NextResponse.json(
        { error: "Feedback validation failed.", errors: error.errors },
        { status: 400 },
      );
    }

    if (error instanceof ArticleFeedbackStorageConfigurationError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }

    console.error("Failed to receive article feedback:", error);
    return NextResponse.json(
      { error: "Unable to receive feedback right now." },
      { status: 500 },
    );
  }
}

function parseFeedbackBody(body: PublicFeedbackBody, request: Request): ArticleFeedbackInput {
  return {
    substance_slug: asString(body.substance_slug),
    substance_title: asString(body.substance_title),
    category: asString(body.category),
    importance: asString(body.importance),
    details: asString(body.details),
    source_url: asString(body.source_url),
    contact_email: asString(body.contact_email),
    honeypot: asString(body.honeypot) || asString(body.website),
    user_agent: request.headers.get("user-agent") ?? undefined,
  };
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}
