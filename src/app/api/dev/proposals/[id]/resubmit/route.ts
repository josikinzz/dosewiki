import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import { proposalIdOf } from "../../proposalRouteId";
import { MAX_PROPOSAL_PAYLOAD_BYTES, PROPOSAL_SUBMISSION_RATE_LIMIT_KEY, submitProposal, type ProposalBody } from "../../submitProposal";

export const runtime = "nodejs";

export const POST = protectedRouteOperation<ProposalBody>({
  auth: "editor",
  rateLimit: "editorHeavyWrite",
  rateLimitKeySuffix: PROPOSAL_SUBMISSION_RATE_LIMIT_KEY,
  body: {
    maxBytes: MAX_PROPOSAL_PAYLOAD_BYTES,
  },
  capabilities: [{ type: "dataWrite" }],
  unexpectedErrorLabel: "Failed to resubmit a change proposal via Next route:",
  unexpectedErrorMessage: "Unable to submit the proposal right now.",
  operation: ({ request, actorEmail, body, dataWrite }) =>
    submitProposal({ actorEmail, body: { ...body, revisionOf: proposalIdOf(request) }, dataWrite }),
});
