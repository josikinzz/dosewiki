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
import { api } from "@server/postgres/runtime/api";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import { proposalIdOf } from "../proposalRouteId";
import { projectProposalDetail } from "../../../../../../lib/proposals/proposalPublic";

export const runtime = "nodejs";

export const GET = protectedRouteOperation({
  auth: "editor",
  rateLimit: "diagnosticRead",
  capabilities: [{ type: "dataWrite" }],
  unexpectedErrorLabel: "Failed to load a change proposal via Next route:",
  unexpectedErrorMessage: "Unable to load that proposal right now.",
  operation: async ({ request, actorEmail, dataWrite }) => {
    if (!dataWrite) {
      throw new Error("Postgres write capability is required.");
    }

    const includePayload = new URL(request.url).searchParams.get("seed") === "1";
    const proposal = await dataWrite.client.query(api.changeProposals.get, {
      apiKey: dataWrite.getAdminIntentToken?.("editorArticleWrite") ?? dataWrite.adminKey,
      actorEmail,
      id: proposalIdOf(request) as never,
      includePayload,
    });

    if (!proposal) {
      return NextResponse.json({ ok: false, error: "No proposal with that id." }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      proposal: projectProposalDetail(proposal, actorEmail, { includePayload }),
    });
  },
});
