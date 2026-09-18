/**
 * Reject one change proposal with a note the editor sees. Admin only; the
 * note is required so a rejection always explains itself.
 */
import { NextResponse } from "next/server";
import { api } from "@server/postgres/runtime/api";
import type { Id } from "@server/postgres/runtime/dataModel";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import { JsonBodyError } from "@/lib/http/readJsonBody";
import { proposalIdOf } from "../../proposalRouteId";

export const runtime = "nodejs";

const MAX_NOTE_LENGTH = 2000;

type RejectBody = { note?: unknown };

function parseNote(body: RejectBody): string {
  const note = typeof body.note === "string" ? body.note.trim() : "";
  if (note.length === 0) {
    throw new JsonBodyError(400, "Rejecting a proposal needs a note for the editor.");
  }
  if (note.length > MAX_NOTE_LENGTH) {
    throw new JsonBodyError(400, `Keep the note under ${MAX_NOTE_LENGTH} characters.`);
  }
  return note;
}

export const POST = protectedRouteOperation<RejectBody, string>({
  auth: "admin",
  rateLimit: "editorSmallWrite",
  body: { maxBytes: 16 * 1024, parse: parseNote },
  capabilities: [{ type: "dataWrite" }],
  unexpectedErrorLabel: "Failed to reject a change proposal via Next route:",
  unexpectedErrorMessage: "Unable to reject the proposal right now.",
  operation: async ({ request, actorEmail, body: note, dataWrite }) => {
    if (!dataWrite) {
      throw new Error("Postgres write capability is required.");
    }
    const proposalId = proposalIdOf(request) as Id<"changeProposals">;

    const result = await dataWrite.client.mutation(api.changeProposalReview.reject, {
      apiKey: dataWrite.getAdminIntentToken?.("editorArticleWrite") ?? dataWrite.adminKey,
      actorEmail,
      proposalId,
      note,
    });

    return NextResponse.json({ ok: true, status: result.status });
  },
});
