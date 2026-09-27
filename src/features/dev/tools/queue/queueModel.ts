/**
 * Pure helpers for the Queue tab (`/dev/queue`): the shapes the proposal
 * routes answer with, how the rail groups them, and drift detection.
 */

import type { EditorStatusPillTone } from "@/features/dev/components";
import type { DevProposalSeed } from "@/features/dev/context/devModeTypes";
import type { ProposalStatus } from "../../../../../lib/proposals/proposalStatus";
import type { ArticlePatch } from "../../../../../lib/proposals/articlePatch";
import type { FeedbackRef } from "@/features/intake/feedbackCorrection";

export type { ProposalStatus };

type ProposalTargetKind = "article" | "indexLayout" | "about" | "copyBlock" | "writing"

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
  /** The reader feedback this proposal answers (id and article section only). */
  feedbackRef?: FeedbackRef;
};

/** `GET /api/dev/proposals/<id>`: the full row plus the live hash of each target. */
export type ProposalDetail = Omit<ProposalSummary, "commentCount"> & {
  diff: string;
  comparisonMode?: "applied" | "submitted" | "verified_live" | "unavailable";
  comparisonNote?: string;
  comments: ProposalComment[];
  revertedAt?: string;
  liveHashes: Array<{ kind: ProposalTargetKind; key: string; hash: string }>;
  /**
   * The field changes of each article this proposal updates: stored at submit,
   * or computed from a trusted before and after for an older proposal. Absent
   * when no field-by-field reading is available; the text diff then stands.
   */
  articlePatches?: ArticlePatch[];
  /** Present only for the fresh, explicitly requested Load into editor seed read. */
  payload?: DevProposalSeed["payload"];
};

/** What `POST /api/dev/proposals/<id>/approve` answers. */
export type ApproveOutcome = { status: "applied" | "changes_requested"; conflictReason?: string };

/**
 * One row of `GET /api/dev/review-recommendations`: an editor's
 * "Recommended reviewed" awaiting an admin. `stale` means the article was
 * published again after it, so it cannot be approved without re-review.
 */
export type ReviewRecommendationRow = {
  slug: string;
  title: string;
  revision: string;
  recommended_by: string;
  recommended_at: string;
  note: string;
  publishedRevision: string;
  stale: boolean;
};

/** What `POST /api/dev/review-recommendations` answers, by slug. */
export type RecommendationApproval = { approved: string[]; stale: string[]; missing: string[] };

type QueueGroupId ="submitted" | "changes_requested" | "applied" | "closed"

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

/**
 * The text diff without the sections of articles already shown field by field,
 * so a mixed proposal lists each change once. Sections are split on the
 * `# <kind>: <key>` headings the server writes.
 */
export function diffWithoutArticles(markdown: string, slugs: readonly string[]): string {
  if (slugs.length === 0) return markdown;
  const shown = new Set(slugs);
  return markdown.split(/(?=^# )/mu).filter((section) => {
    const heading = /^# article: ([^\n/]+?)(?: \/ [^\n]*)?(?:\n|$)/u.exec(section);
    return !heading || !shown.has(heading[1].trim());
  }).join("");
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
 * editor can hold (articles and index layouts; copy blocks, About and
 * Writing have their own editors). Mirrors what `changeProposals.submit` accepts as
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

export const TARGET_KIND_LABELS: Record<ProposalTargetKind, string> = {
  article: "Article",
  indexLayout: "Index layout",
  about: "About",
  copyBlock: "Copy block",
  writing: "Writing",
};

const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

/** What a row says it changes: the one item by name, or the first and how many more. */
export function describeTargets(targets: readonly Pick<ProposalTarget, "kind" | "key">[]): string {
  if (targets.length === 0) return "No items";
  const [first] = targets;
  const name = `${TARGET_KIND_LABELS[first.kind]} ${first.key}`;
  return targets.length === 1 ? name : `${name} and ${targets.length - 1} more`;
}

/** Whether a proposal still waits on someone: an admin's review, or the proposer's revision. */
export function isOpenProposal(status: ProposalStatus): boolean {
  return status === "submitted" || status === "changes_requested";
}

/** The list's count line: waiting work first, then history. */
export function describeQueueCount(rows: readonly Pick<ProposalSummary, "status">[]): string {
  const open = rows.filter((row) => isOpenProposal(row.status)).length;
  const history = rows.length - open;
  if (rows.length === 0) return "None yet";
  return `${open} open, ${history} in history`;
}

/** Words a search matches: the summary, the proposer, and every target's kind and key. */
export function proposalMatches(row: Pick<ProposalSummary, "summary" | "proposerName" | "targets">, query: string): boolean {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = [
    row.summary,
    row.proposerName,
    ...row.targets.flatMap((target) => [target.key, TARGET_KIND_LABELS[target.kind]]),
  ].join(" ").toLowerCase();
  return words.every((word) => haystack.includes(word));
}

/**
 * Where the proposal stands and what happens next, by status and by who is
 * reading: an admin reviewing, an admin reading their own, or the proposer.
 */
export function nextStepFor(
  status: ProposalStatus,
  viewer: { canApprove: boolean; isAuthor: boolean },
): string {
  const { canApprove, isAuthor } = viewer;
  return {
    submitted: canApprove
      ? isAuthor
        ? "Not published. Another admin must review and approve your submission."
        : "Not published. Review every change below, then approve the whole proposal or reject it with a note."
      : "Not published. An admin will review your submission. You can discuss it here or revise it while you wait.",
    changes_requested: canApprove && !isAuthor
      ? "Not published. The author needs to update this proposal against the latest live content and submit a revision before it can be approved."
      : "Not published. Read the feedback, update your changes against the latest live content, and submit again for review.",
    applied: canApprove
      ? "Published at the time shown below. Revert restores the previous content only if no newer edits have changed these items."
      : "Your changes were published at the time shown below. To make further changes, start a new submission from the relevant editor.",
    rejected: "Not published. This submission is closed. Use the feedback to prepare a new submission in the relevant editor; this one cannot be reopened.",
    superseded: "This submission was replaced by a newer revision. Select that revision in the list to follow its review.",
    reverted: "This publication was undone. Further changes need a new submission from the relevant editor.",
  }[status];
}

/**
 * Why Approve is off, in one sentence, or null when it can be pressed. The
 * server makes the same refusals; this only says them before the click.
 */
export function approveBlocker(proposal: Pick<ProposalDetail, "isAuthor" | "diff" | "comparisonMode">): string | null {
  if (proposal.isAuthor) return "You cannot approve your own proposal. Another admin must.";
  // An older proposal with no verifiable comparison cannot be read in full, so
  // it is not approved blind; the proposer prepares a new submission instead.
  if (proposal.comparisonMode === "unavailable") return "There is no verifiable comparison, so it cannot be approved here.";
  if (!proposal.diff.trim()) return "There is no text comparison to review, so it cannot be approved here.";
  return null;
}

/**
 * What approving would do given the live content: publish, or come back as
 * changes requested because a target moved. Null when nothing has moved.
 */
export function describeDrift(targets: readonly TargetDrift[]): string | null {
  const moved = targets.filter((target) => target.drifted).length;
  if (moved === 0) return null;
  const share = targets.length === 1 ? "The live content" : `${moved} of ${plural(targets.length, "item")}`;
  return `${share} changed since submission. Approving will return it for revision instead of publishing, unless the live content matches again.`;
}

/** Who holds a waiting proposal in the Inbox's claim table. */
export type ProposalHold =
  | { kind: "open" }
  | { kind: "mine"; at: string | null }
  | { kind: "other"; by: string; at: string | null }
  | { kind: "unknown" };

export type ProposalClaim = { claimed_by: string; claimed_at?: string | null; expired?: boolean };

/** A claim that has lapsed reads as open, as the Inbox shows it. */
export function proposalHoldOf(
  claim: ProposalClaim | null | undefined,
  actorEmail: string | null,
  claimsKnown: boolean,
): ProposalHold {
  if (!claimsKnown) return { kind: "unknown" };
  if (!claim || claim.expired) return { kind: "open" };
  const at = claim.claimed_at ?? null;
  if (actorEmail && claim.claimed_by.trim().toLowerCase() === actorEmail.trim().toLowerCase()) return { kind: "mine", at };
  return { kind: "other", by: claim.claimed_by, at };
}

/** The history groups a list folds after this many rows. */
export const QUEUE_HISTORY_CAP = 5;
