/**
 * Pure helpers for the Queue tab (`/dev/queue`): the shapes the proposal
 * routes answer with, how the rail groups them, and drift detection.
 */

import type { EditorStatusPillTone } from "@/features/dev/components";
import type { DevProposalSeed } from "@/features/dev/context/devModeTypes";
import type { ProposalStatus } from "../../../../../lib/proposals/proposalStatus";

export type { ProposalStatus };

type ProposalTargetKind = "article" | "indexLayout" | "about" | "copyBlock"

type ProposalTarget = { kind: ProposalTargetKind; key: string; baseHash: string }

export type ProposalComment = { authorName: string; at: string; text: string };

/** One row of `GET /api/dev/proposals`: everything but payload, diff, and snapshot. */
export type ProposalSummary = {
  _id: string;
  proposerName: string;
  isAuthor: boolean;
  createdAt: string;
  updatedAt: string;
  status: ProposalStatus;
  targets: ProposalTarget[];
  summary: string;
  revisionOf?: string;
  reviewerName?: string;
  reviewedAt?: string;
  reviewNotes?: string;
  commentCount: number;
  appliedAt?: string;
  conflictReason?: string;
};

/** `GET /api/dev/proposals/<id>`: the full row plus the live hash of each target. */
export type ProposalDetail = Omit<ProposalSummary, "commentCount"> & {
  diff: string;
  comparisonMode?: "applied" | "submitted" | "verified_live" | "unavailable";
  comparisonNote?: string;
  comments: ProposalComment[];
  revertedAt?: string;
  liveHashes: Array<{ kind: ProposalTargetKind; key: string; hash: string }>;
  /** Present only for the fresh, explicitly requested Load into editor seed read. */
  payload?: DevProposalSeed["payload"];
};

/** What `POST /api/dev/proposals/<id>/approve` answers. */
export type ApproveOutcome = { status: "applied" | "changes_requested"; conflictReason?: string };

type QueueGroupId = "submitted" | "changes_requested" | "applied" | "closed"

type QueueGroup = {
  id: QueueGroupId;
  label: string;
  statuses: readonly ProposalStatus[];
}

/** Rail order: what an admin has to act on first, closed proposals last. */
export const QUEUE_GROUPS: readonly QueueGroup[] = [
  { id: "submitted", label: "Awaiting review", statuses: ["submitted"] },
  { id: "changes_requested", label: "Needs revision", statuses: ["changes_requested"] },
  { id: "applied", label: "Published", statuses: ["applied"] },
  { id: "closed", label: "Closed", statuses: ["rejected", "superseded", "reverted"] },
];

export const STATUS_LABELS: Record<ProposalStatus, string> = {
  submitted: "Awaiting review",
  changes_requested: "Changes requested",
  applied: "Published",
  rejected: "Rejected",
  superseded: "Replaced by revision",
  reverted: "Reverted",
};

export const STATUS_PILL_TONE: Record<ProposalStatus, EditorStatusPillTone> = {
  submitted: "info",
  changes_requested: "caution",
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
    approve: status === "submitted",
    reject: status === "submitted" || status === "changes_requested",
    revert: status === "applied",
  };
}

/**
 * Whether the viewer may rebase this proposal: it is still open to its
 * proposer (waiting, or returned with changes requested), the viewer is that
 * proposer or an admin, and everything it changes is something the substances
 * editor can hold (articles and index layouts; copy blocks and About have
 * their own editors). Mirrors what `changeProposals.submit` accepts as
 * `revisionOf`.
 */
export function canLoadIntoEditor(
  proposal: Pick<ProposalSummary, "status" | "isAuthor" | "targets">,
  viewer: { canApprove: boolean },
): boolean {
  const open = proposal.status === "submitted" || proposal.status === "changes_requested";
  const seedable = proposal.targets.every((target) => target.kind === "article" || target.kind === "indexLayout");
  return open && seedable && (viewer.canApprove || proposal.isAuthor);
}

/** The seed the dev context takes: the row's identity, why it came back, and its staged save. */
export function proposalSeedOf(proposal: ProposalDetail): DevProposalSeed {
  if (!proposal.payload) {
    throw new Error("The proposal seed was not returned. Refresh and try loading it again.");
  }
  return {
    proposalId: proposal._id,
    summary: proposal.summary,
    reason: proposal.conflictReason ?? proposal.reviewNotes ?? null,
    payload: proposal.payload,
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
