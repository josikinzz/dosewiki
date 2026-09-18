import { NextResponse } from "next/server";

import { JsonBodyError, readJsonBody } from "@/lib/http/readJsonBody";
import type { SiteFeedbackInput } from "@/features/site-feedback/siteFeedback";
import {
  SiteFeedbackStorageConfigurationError,
  SiteFeedbackValidationError,
  getSiteFeedbackIpHashSecret,
  getPublicSiteFeedbackStore,
} from "@/features/site-feedback/siteFeedbackStore.server";
import {
  TurnstileVerificationError,
  verifyTurnstileToken,
} from "@/features/site-feedback/turnstile.server";
import { enforceRateLimit, getClientIp } from "@server/http/nextRateLimit";

export const runtime = "nodejs";

const MAX_FEEDBACK_PAYLOAD_BYTES = 32 * 1024;

type PublicFeedbackBody = {
  category?: unknown;
  urgency?: unknown;
  details?: unknown;
  page?: unknown;
  email?: unknown;
  honeypot?: unknown;
  website?: unknown;
  turnstileToken?: unknown;
};

export async function POST(request: Request) {
  const rateLimited = await enforceRateLimit(request, "publicSiteFeedbackSubmit");
  if (rateLimited) {
    return rateLimited;
  }

  try {
    const rawBody = await readJsonBody<PublicFeedbackBody>(request, {
      maxBytes: MAX_FEEDBACK_PAYLOAD_BYTES,
    });
    const clientIp = getClientIp(request);
    await verifyTurnstileToken(
      typeof rawBody.turnstileToken === "string" ? rawBody.turnstileToken : undefined,
      clientIp,
    );
    const body = parseFeedbackBody(rawBody, request);
    const store = await getPublicSiteFeedbackStore();
    const row = await store.create(body, {
      ip: clientIp,
      ip_hash_secret: getSiteFeedbackIpHashSecret(),
    });

    return NextResponse.json(
      { ok: true, id: row.id, status: "received" },
      { status: 202 },
    );
  } catch (error) {
    if (error instanceof JsonBodyError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    if (error instanceof TurnstileVerificationError) {
      return NextResponse.json(
        { error: "Captcha verification failed.", errors: [error.message] },
        { status: 400 },
      );
    }

    if (error instanceof SiteFeedbackValidationError) {
      return NextResponse.json(
        { error: "Feedback validation failed.", errors: error.errors },
        { status: 400 },
      );
    }

    if (error instanceof SiteFeedbackStorageConfigurationError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }

    console.error("Failed to receive site feedback:", error);
    return NextResponse.json(
      { error: "Unable to receive feedback right now." },
      { status: 500 },
    );
  }
}

function parseFeedbackBody(body: PublicFeedbackBody, request: Request): SiteFeedbackInput {
  return {
    category: asString(body.category),
    urgency: asString(body.urgency),
    details: asString(body.details),
    page: asString(body.page),
    email: asString(body.email),
    honeypot: asString(body.honeypot) || asString(body.website),
    user_agent: request.headers.get("user-agent") ?? undefined,
  };
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}
