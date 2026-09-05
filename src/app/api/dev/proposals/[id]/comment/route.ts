/**
 * Discussion on a change proposal.
 *
 *   POST /api/dev/proposals/<id>/comment  { text } -> { comment: { by, at, text } }
 *
 * Editors may comment on their own proposals; admins may comment globally.
 * Convex enforces ownership and attributes the comment to the session email.
 */
import { NextResponse } from "next/server";
import { api } from "../../../../../../../convex/_generated/api";
import { JsonBodyError } from "@/lib/http/readJsonBody";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import { proposalIdOf } from "../../proposalRouteId";

export const runtime = "nodejs";

type CommentBody = { text?: unknown };

type ParsedCommentBody = { text: string };

function parseCommentBody(raw: CommentBody): ParsedCommentBody {
  const text = typeof raw.text === "string" ? raw.text.trim() : "";
  if (text.length === 0) {
    throw new JsonBodyError(400, "A comment needs some text.");
  }
  return { text };
}

export const POST = protectedRouteOperation<CommentBody, ParsedCommentBody>({
  auth: "editor",
  rateLimit: "editorSmallWrite",
  body: { maxBytes: 16 * 1024, parse: parseCommentBody },
  capabilities: [{ type: "convexWrite" }],
  unexpectedErrorLabel: "Failed to comment on a change proposal via Next route:",
  unexpectedErrorMessage: "Unable to post that comment right now.",
  operation: async ({ request, actorEmail, body, convexWrite }) => {
    if (!convexWrite) {
      throw new Error("Convex write capability is required.");
    }

    const comment = await convexWrite.client.mutation(api.changeProposals.comment, {
      apiKey: convexWrite.getAdminIntentToken?.("editorArticleWrite") ?? convexWrite.adminKey,
      actorEmail,
      id: proposalIdOf(request) as never,
      text: body.text,
    });

    return NextResponse.json({ ok: true, comment });
  },
});
