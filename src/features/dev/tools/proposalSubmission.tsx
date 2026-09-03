/**
 * Submitting a tab-local document (a copy block, the About page) as a change
 * proposal instead of saving it. Editors land here; admins keep the tool's
 * direct save. The proposal carries the same body the direct save route
 * validates, a one-line summary, and a field-by-field diff for the Queue.
 */
import { Button } from "@/components/ui/button";
import type { EditorNoticeMessage } from "@/features/dev/components";
import type { ProposalPayload } from "@/hooks/useApiMutations";
import { buildTextChangelog } from "@/utils/data/changelog";
import { viewToPath } from "@/utils/routing";

const PROPOSALS_PATH = "/api/dev/proposals";

export type ProposalFieldChange = { label: string; before: string; after: string };

/** One `# Label` diff section per field that changed; fields that did not are left out. */
export function buildFieldDiff(fields: readonly ProposalFieldChange[]): string {
  return fields
    .map((field) => buildTextChangelog(field.label, field.before, field.after))
    .filter((changelog) => changelog.hasChanges)
    .map((changelog) => changelog.markdown)
    .join("\n");
}

export async function submitToolProposal(input: {
  payload: ProposalPayload;
  summary: string;
  diff: string;
}): Promise<{ proposalId: string }> {
  let response: Response;
  try {
    response = await fetch(PROPOSALS_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  } catch {
    throw new Error("Network error while submitting the proposal.");
  }
  const result: Record<string, unknown> = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof result.error === "string" ? result.error : "Unable to submit the proposal.");
  }
  if (typeof result.proposalId !== "string" || result.proposalId.length === 0) {
    throw new Error("The proposal route returned no proposal id.");
  }
  return { proposalId: result.proposalId };
}

/** The success notice after a submission: what was proposed, and the way to the Queue. */
export function proposalSubmittedNotice(subject: string, proposalId: string): EditorNoticeMessage {
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
