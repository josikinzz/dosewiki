export const PROPOSAL_STATUSES = [
  "submitted",
  "changes_requested",
  "applied",
  "rejected",
  "superseded",
  "reverted",
] as const;

export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

export const PROPOSAL_TRANSITIONS: Readonly<Record<ProposalStatus, readonly ProposalStatus[]>> = {
  submitted: ["changes_requested", "applied", "rejected", "superseded"],
  changes_requested: ["submitted", "rejected", "superseded"],
  applied: ["reverted"],
  rejected: [],
  superseded: [],
  reverted: [],
};

export function canTransition(from: ProposalStatus, to: ProposalStatus): boolean {
  return PROPOSAL_TRANSITIONS[from].includes(to);
}

export const OPEN_PROPOSAL_STATUSES: readonly ProposalStatus[] = ["submitted"];
