import { NextResponse } from "next/server";
import { api } from "@server/postgres/runtime/api";
import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import { PROPOSAL_STATUSES, type ProposalStatus } from "../../../../../lib/proposals/proposalStatus";
import { projectProposalSummary } from "../../../../../lib/proposals/proposalPublic";
import { MAX_PROPOSAL_PAYLOAD_BYTES, submitProposal, type ProposalBody } from "./submitProposal";

export const runtime = "nodejs";

export const GET = protectedRouteOperation({
  auth: "editor",
  rateLimit: "diagnosticRead",
  capabilities: [{ type: "dataWrite" }],
  unexpectedErrorLabel: "Failed to list change proposals via Next route:",
  unexpectedErrorMessage: "Unable to load the proposal queue right now.",
  operation: async ({ request, actorEmail, dataWrite }) => {
    if (!dataWrite) {
      throw new Error("Postgres write capability is required.");
    }

    const rawStatus = new URL(request.url).searchParams.get("status");
    let status: ProposalStatus | undefined;
    if (rawStatus !== null && rawStatus !== "") {
      if (!PROPOSAL_STATUSES.includes(rawStatus as ProposalStatus)) {
        return NextResponse.json({ error: `Unknown proposal status "${rawStatus}".` }, { status: 400 });
      }
      status = rawStatus as ProposalStatus;
    }

    const proposals = await dataWrite.client.query(api.changeProposals.list, {
      apiKey: dataWrite.getAdminIntentToken?.("editorArticleWrite") ?? dataWrite.adminKey,
      actorEmail,
      ...(status ? { status } : {}),
    });

    return NextResponse.json({ ok: true, proposals: proposals.map((proposal) => projectProposalSummary(proposal, actorEmail)) });
  },
});

export const POST = protectedRouteOperation<ProposalBody>({
  auth: "editor",
  rateLimit: "editorHeavyWrite",
  body: {
    maxBytes: MAX_PROPOSAL_PAYLOAD_BYTES,
  },
  capabilities: [{ type: "dataWrite" }],
  unexpectedErrorLabel: "Failed to submit a change proposal via Next route:",
  unexpectedErrorMessage: "Unable to submit the proposal right now.",
  operation: ({ actorEmail, body, dataWrite }) => submitProposal({ actorEmail, body, dataWrite }),
});
