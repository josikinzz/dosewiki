import { NextResponse } from "next/server";

import { requireEditorSession } from "@/lib/auth/requireEditorSession";
import { JsonBodyError, readJsonBody } from "@/lib/http/readJsonBody";
import {
  isArticleFeedbackStatus,
  type ArticleFeedbackStatus,
} from "@/features/article/feedback/articleFeedback";
import {
  ArticleFeedbackNotFoundError,
  ArticleFeedbackStorageConfigurationError,
  getArticleFeedbackStore,
} from "@/features/article/feedback/articleFeedbackStore.server";
import { enforceRateLimit } from "@server/http/nextRateLimit";

export const runtime = "nodejs";

type StatusRouteContext = {
  params: Promise<{ id: string }> | { id: string };
};

type StatusBody = {
  status?: unknown;
  note?: unknown;
};

const MAX_STATUS_BODY_BYTES = 16 * 1024;

export async function POST(request: Request, context: StatusRouteContext) {
  const rateLimited = await enforceRateLimit(request, "editorSmallWrite");
  if (rateLimited) {
    return rateLimited;
  }

  const auth = await requireEditorSession();
  if (auth.ok === false) {
    return auth.response;
  }

  try {
    const { id } = await Promise.resolve(context.params);
    const body = await readJsonBody<StatusBody>(request, { maxBytes: MAX_STATUS_BODY_BYTES });
    const status = parseStatus(body.status);
    const note = parseNote(body.note);
    const store = await getArticleFeedbackStore();
    const feedback = await store.transition(id, {
      status,
      reviewer: auth.session.user.email,
      note,
    });

    return NextResponse.json({ ok: true, feedback });
  } catch (error) {
    return mapStatusRouteError(error);
  }
}

function parseStatus(value: unknown): ArticleFeedbackStatus {
  if (!isArticleFeedbackStatus(value)) {
    throw new JsonBodyError(400, "A valid feedback status is required.");
  }

  return value;
}

function parseNote(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new JsonBodyError(400, "The review note must be text.");
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function mapStatusRouteError(error: unknown): NextResponse {
  if (error instanceof JsonBodyError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  if (error instanceof ArticleFeedbackNotFoundError) {
    return NextResponse.json({ error: "Article feedback not found." }, { status: 404 });
  }

  if (error instanceof ArticleFeedbackStorageConfigurationError) {
    return NextResponse.json({ error: error.message }, { status: 503 });
  }

  if (error instanceof Error && error.message.startsWith("Illegal transition:")) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  console.error("Failed to update article feedback status:", error);
  return NextResponse.json(
    { error: "Unable to update article feedback right now." },
    { status: 500 },
  );
}
