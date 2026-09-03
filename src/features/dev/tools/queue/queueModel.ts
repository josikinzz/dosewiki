/**
 * Pure helpers for the Queue tab (`/dev/queue`): the shapes the proposal
 * routes answer with, how the rail groups them, and drift detection.
 */

import type { EditorStatusPillTone } from "@/features/dev/components";
import type { ProposalStatus } from "../../../../../lib/proposals/proposalStatus";

export type { ProposalStatus };

export type ProposalTargetKind = "article" | "indexLayout" | "about" | "copyBlock";

export type ProposalTarget = { kind: ProposalTargetKind; key: string; baseHash: string };

export type ProposalComment = { by: string; at: string; text: string };

/** One row of `GET /api/dev/proposals`: everything but payload, diff, and snapshot. */
export type ProposalSummary = {
  _id: string;
  proposedBy: string;
  createdAt: string;
  updatedAt: string;
  status: ProposalStatus;
  targets: ProposalTarget[];
  summary: string;
  revisionOf?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewNotes?: string;
  commentCount: number;
  appliedAt?: string;
  conflictReason?: string;
};

/** `GET /api/dev/proposals/<id>`: the full row plus the live hash of each target. */
export type ProposalDetail = Omit<ProposalSummary, "commentCount"> & {
  diff: string;
  comments: ProposalComment[];
  revertedAt?: string;
  liveHashes: Array<{ kind: ProposalTargetKind; key: string; hash: string }>;
};

/** What `POST /api/dev/proposals/<id>/approve` answers. */
export type ApproveOutcome = { status: "applied" | "changes_requested"; conflictReason?: string };

export type QueueGroupId = "submitted" | "changes_requested" | "approved" | "closed";

export type QueueGroup = {
  id: QueueGroupId;
  label: string;
  statuses: readonly ProposalStatus[];
};

/** Rail order: what an admin has to act on first, closed proposals last. */
export const QUEUE_GROUPS: readonly QueueGroup[] = [
  { id: "submitted", label: "Submitted", statuses: ["submitted"] },
  { id: "changes_requested", label: "Changes requested", statuses: ["changes_requested"] },
  { id: "approved", label: "Approved / Applied", statuses: ["approved", "applied"] },
  { id: "closed", label: "Rejected / Superseded / Reverted", statuses: ["rejected", "superseded", "reverted"] },
];

export const STATUS_LABELS: Record<ProposalStatus, string> = {
  submitted: "Submitted",
  changes_requested: "Changes requested",
  approved: "Approved",
  applied: "Applied",
  rejected: "Rejected",
  superseded: "Superseded",
  reverted: "Reverted",
};

export const STATUS_PILL_TONE: Record<ProposalStatus, EditorStatusPillTone> = {
  submitted: "info",
  changes_requested: "caution",
  approved: "success",
  applied: "success",
  rejected: "danger",
  superseded: "neutral",
  reverted: "neutral",
};

export type GroupedProposals = Array<QueueGroup & { rows: ProposalSummary[] }>;

/** Every group in rail order, each holding its rows in the order the list came (newest first). */
export function groupProposals(rows: readonly ProposalSummary[]): GroupedProposals {
  return QUEUE_GROUPS.map((group) => ({
    ...group,
    rows: rows.filter((row) => group.statuses.includes(row.status)),
  }));
}

export type TargetDrift = ProposalTarget & {
  /** True when production no longer matches the hash the proposal pinned; approve would refuse. */
  drifted: boolean;
};

/**
 * Each target with whether production moved under it. A target the live
 * hashes do not mention counts as drifted: the reviewer should not read a
 * missing answer as "still fine".
 */
export function targetDrift(detail: Pick<ProposalDetail, "targets" | "liveHashes">): TargetDrift[] {
  return detail.targets.map((target) => {
    const live = detail.liveHashes.find((hash) => hash.kind === target.kind && hash.key === target.key);
    return { ...target, drifted: live === undefined || live.hash !== target.baseHash };
  });
}

/** Admin actions the proposal's status still allows; the buttons render from this. */
export function reviewActionsFor(status: ProposalStatus): { approve: boolean; reject: boolean; revert: boolean } {
  return {
    approve: status === "submitted" || status === "approved",
    reject: status === "submitted" || status === "changes_requested" || status === "approved",
    revert: status === "applied",
  };
}

export function formatProposalDate(iso: string | undefined): string {
  if (!iso) {
    return "unknown date";
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "unknown date";
  }
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}
