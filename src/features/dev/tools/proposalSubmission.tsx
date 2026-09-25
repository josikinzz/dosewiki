/**
 * Submitting a tab-local document (a copy block, the About page) as a change
 * proposal instead of saving it. Editors land here; admins keep the tool's
 * direct save. The proposal carries the same body the direct save route
 * validates, a one-line summary, and the loaded baseline for server comparison.
 */
import { Button } from "@/components/ui/button";
import type { NoticeMessage } from "@/features/dev/components";
import type { ProposalPayload } from "@/hooks/useApiMutations";
import { viewToPath } from "@/utils/routing";
import { devPost } from "./devFetch";
import type { ProposalBaseline } from "../../../../lib/proposals/proposalBaseline";

const PROPOSALS_PATH = "/api/dev/proposals";


export async function submitToolProposal(input: {
  payload: ProposalPayload;
  summary: string;
  baselines: ProposalBaseline[];
}): Promise<{ proposalId: string }> {
  const result = await devPost(PROPOSALS_PATH, input, {
    messages: { network: "Network error while submitting the proposal.", failure: "Unable to submit the proposal." },
    emptyBodyOk: true,
  });
  if (typeof result.proposalId !== "string" || result.proposalId.length === 0) {
    throw new Error("The proposal route returned no proposal id.");
  }
  return { proposalId: result.proposalId };
}

/** The success notice after a submission: what was proposed, and the way to the Queue. */
export function proposalSubmittedNotice(subject: string, proposalId: string): NoticeMessage {
  return {
    tone: "success",
    title: "Submitted for review",
    message: `${subject} is held as proposal #${proposalId.slice(-6)} until an admin approves it. Production is unchanged until then.`,
    actions: (
      <Button asChild variant="outline" size="sm" className="rounded-full">
        <a href={viewToPath({ type: "dev", tab: "queue" })}>View in queue</a>
      </Button>
    ),
  };
}
