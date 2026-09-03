/**
 * One change proposal in full, for the review pane.
 *
 *   GET /api/dev/proposals/<id> -> { proposal } with `liveHashes[{kind,key,hash}]`
 *
 * `liveHashes` is the production hash of every target as it stands now; the
 * queue flags a target whose live hash no longer matches the pinned `baseHash`
 * before an admin tries to apply it.
 */
import { NextResponse } from "next/server";
import { api } from "../../../../../../convex/_generated/api";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import { proposalIdOf } from "../proposalRouteId";

export const runtime = "nodejs";

export const GET = protectedRouteOperation({
  auth: "editor",
  rateLimit: "diagnosticRead",
  capabilities: [{ type: "convexWrite" }],
  unexpectedErrorLabel: "Failed to load a change proposal via Next route:",
  unexpectedErrorMessage: "Unable to load that proposal right now.",
  operation: async ({ request, actorEmail, convexWrite }) => {
    if (!convexWrite) {
      throw new Error("Convex write capability is required.");
    }

    const proposal = await convexWrite.client.query(api.changeProposals.get, {
      apiKey: convexWrite.getAdminIntentToken?.("editorArticleWrite") ?? convexWrite.adminKey,
      actorEmail,
      id: proposalIdOf(request) as never,
    });

    if (!proposal) {
      return NextResponse.json({ ok: false, error: "No proposal with that id." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, proposal });
  },
});
