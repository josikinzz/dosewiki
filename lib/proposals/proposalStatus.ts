/**
 * Change-proposal lifecycle. The table is the whole policy: a mutation may
 * move a proposal from `from` to `to` only when `canTransition` says so, and
 * a status with an empty row is terminal.
 *
 *   submitted ---------> changes_requested --> submitted (resubmit)
 *       |                      |
 *       +--> approved --> applied --> reverted
 *       |
 *       +--> rejected | superseded
 *
 * `superseded` is what an earlier revision becomes when a newer proposal
 * carrying `revisionOf` is submitted; `reverted` is an applied proposal whose
 * `snapshotBefore` has been written back.
 */
export const PROPOSAL_STATUSES = [
  "submitted",
  "changes_requested",
  "approved",
  "applied",
  "rejected",
  "superseded",
  "reverted",
] as const;

export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

export const PROPOSAL_TRANSITIONS: Readonly<Record<ProposalStatus, readonly ProposalStatus[]>> = {
  submitted: ["changes_requested", "approved", "applied", "rejected", "superseded"],
  changes_requested: ["submitted", "rejected", "superseded"],
  approved: ["applied", "changes_requested", "rejected", "superseded"],
  applied: ["reverted"],
  rejected: [],
  superseded: [],
  reverted: [],
};

export function canTransition(from: ProposalStatus, to: ProposalStatus): boolean {
  return PROPOSAL_TRANSITIONS[from].includes(to);
}

/** Statuses an admin still has to act on. */
export const OPEN_PROPOSAL_STATUSES: readonly ProposalStatus[] = ["submitted", "approved"];
