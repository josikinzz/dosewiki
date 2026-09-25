/**
 * Where an article feedback item's correction stands.
 *
 *   GET  /api/article-feedback/<id>/corrections
 *        -> { corrections: ResolvedCorrection[], candidates: { proposals, revisions } }
 *   POST /api/article-feedback/<id>/corrections  { change: { kind, id }, note? }
 *        -> { feedback }  link an existing proposal or published revision
 *
 * Admin floor for both, like the feedback decisions: the candidates include
 * other members' proposals. The answer names proposals and revisions by id,
 * status, summary and date only; no proposer, actor or reader contact detail.
 * A link is advisory and never gates a proposal's approval or publication.
 */
import { NextResponse } from "next/server";

import {
  ArticleFeedbackNotFoundError,
  ArticleFeedbackStorageConfigurationError,
  getArticleFeedbackStore,
} from "@/features/article/feedback/articleFeedbackStore.server";
import { isLinkedChange, type LinkedChange } from "@/features/intake/feedbackCorrection";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import { JsonBodyError } from "@/lib/http/readJsonBody";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

type LinkBody = { change?: unknown; note?: unknown };

const MAX_LINK_BODY_BYTES = 16 * 1024;
const MAX_LINK_NOTE_LENGTH = 2000;

function mapError(error: unknown): NextResponse {
  if (error instanceof JsonBodyError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof ArticleFeedbackNotFoundError) {
    return NextResponse.json({ error: "Article feedback not found." }, { status: 404 });
  }
  if (error instanceof ArticleFeedbackStorageConfigurationError) {
    return NextResponse.json({ error: error.message }, { status: 503 });
  }
  if (error instanceof Error && error.message.startsWith("Illegal link: ")) {
    return NextResponse.json({ error: error.message.slice("Illegal link: ".length) }, { status: 400 });
  }
  console.error("Failed to read or link an article feedback correction:", error);
  return NextResponse.json({ error: "Unable to reach the feedback correction right now." }, { status: 500 });
}

export async function GET(request: Request, context: RouteContext) {
  return protectedRouteOperation({
    auth: "admin",
    rateLimit: "diagnosticRead",
    unexpectedErrorLabel: "Failed to read article feedback corrections:",
    mapError,
    operation: async ({ actorEmail }) => {
      const { id } = await Promise.resolve(context.params);
      const store = await getArticleFeedbackStore();
      const result = await store.corrections(id, { actorEmail });
      return NextResponse.json({ ok: true, ...result });
    },
  })(request);
}

export async function POST(request: Request, context: RouteContext) {
  return protectedRouteOperation<LinkBody, { change: LinkedChange; note?: string }>({
    auth: "admin",
    rateLimit: "editorSmallWrite",
    body: {
      maxBytes: MAX_LINK_BODY_BYTES,
      parse: (body) => {
        if (!isLinkedChange(body.change)) {
          throw new JsonBodyError(400, "Choose a proposal or a published revision to link.");
        }
        if (body.note !== undefined && body.note !== null && typeof body.note !== "string") {
          throw new JsonBodyError(400, "The link note must be text.");
        }
        const note = typeof body.note === "string" ? body.note.trim() : "";
        if (note.length > MAX_LINK_NOTE_LENGTH) {
          throw new JsonBodyError(400, `The link note must stay under ${MAX_LINK_NOTE_LENGTH} characters.`);
        }
        return {
          change: { kind: body.change.kind, id: body.change.id.trim() } as LinkedChange,
          ...(note ? { note } : {}),
        };
      },
    },
    unexpectedErrorLabel: "Failed to link an article feedback correction:",
    mapError,
    operation: async ({ actorEmail, body }) => {
      const { id } = await Promise.resolve(context.params);
      const store = await getArticleFeedbackStore();
      const feedback = await store.linkChange(id, { actorEmail, change: body.change, note: body.note });
      return NextResponse.json({ ok: true, feedback });
    },
  })(request);
}
