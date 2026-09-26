/**
 * Pure rules behind the Feedback review workspace: status words, who holds or
 * decided an item, and what the list says when it is empty. No React, so the
 * queue, the pane and their tests read one source.
 */

import { decisionLogOf, UNKNOWN_DECISION_ACTOR, type DecisionLogEntry } from "@/features/intake/decisionLog";
import { FEEDBACK_INTAKE_STATUS, INTAKE_STATUS_LABEL, INTAKE_STATUS_TONE } from "@/features/intake/intakeStatus";

import type { FeedbackImportance, FeedbackQueueFilter, FeedbackQueueStatus } from "./FeedbackReviewQueue";
import { QUEUE_STATUSES, totalFor, type StatusCounts } from "./feedbackQueueModel";

/** The shared intake words (docs/glossary.md, Intake Status); feedback stores them as is. */
export const FEEDBACK_STATUS_LABELS: Record<FeedbackQueueFilter, string> = {
  all: "All",
  unresolved: "Unresolved",
  new: INTAKE_STATUS_LABEL[FEEDBACK_INTAKE_STATUS.new],
  reviewing: INTAKE_STATUS_LABEL[FEEDBACK_INTAKE_STATUS.reviewing],
  resolved: INTAKE_STATUS_LABEL[FEEDBACK_INTAKE_STATUS.resolved],
  rejected: INTAKE_STATUS_LABEL[FEEDBACK_INTAKE_STATUS.rejected],
  spam: INTAKE_STATUS_LABEL[FEEDBACK_INTAKE_STATUS.spam],
};

export type PillTone = "info" | "caution" | "success" | "danger" | "neutral";

export const STATUS_PILL_TONE: Record<FeedbackQueueStatus, PillTone> = {
  new: INTAKE_STATUS_TONE[FEEDBACK_INTAKE_STATUS.new],
  reviewing: INTAKE_STATUS_TONE[FEEDBACK_INTAKE_STATUS.reviewing],
  resolved: INTAKE_STATUS_TONE[FEEDBACK_INTAKE_STATUS.resolved],
  rejected: INTAKE_STATUS_TONE[FEEDBACK_INTAKE_STATUS.rejected],
  spam: INTAKE_STATUS_TONE[FEEDBACK_INTAKE_STATUS.spam],
};

export const IMPORTANCE_WORD: Record<FeedbackImportance, string> = {
  critical: "Critical",
  high: "High",
  normal: "Normal",
  low: "Low",
};

export const IMPORTANCE_PILL_TONE: Record<FeedbackImportance, PillTone> = {
  critical: "danger",
  high: "caution",
  normal: "info",
  low: "neutral",
};

/** The status choices in the list column, waiting work first, then the decided history. */
export const FEEDBACK_FILTER_ORDER: readonly FeedbackQueueFilter[] = [
  "unresolved",
  "new",
  "reviewing",
  "all",
  "resolved",
  "rejected",
  "spam",
];

/** True for the statuses a decision closes; everything else still waits. */
export function isDecided(status: FeedbackQueueStatus): boolean {
  return status === "resolved" || status === "rejected" || status === "spam";
}

/** True when a filter lists more than one status, so each row needs its status pill. */
export function filterSpansStatuses(filter: FeedbackQueueFilter): boolean {
  return filter === "all" || filter === "unresolved";
}

export function sameActor(left: string | null | undefined, right: string | null | undefined): boolean {
  return Boolean(left && right && left.trim().toLowerCase() === right.trim().toLowerCase());
}

type LoggedRow = {
  status: FeedbackQueueStatus;
  created_at?: string;
  reviewed_by?: string;
  reviewed_at?: string;
  review_notes?: string;
  decision_log?: DecisionLogEntry<FeedbackQueueStatus>[];
};

/**
 * Who holds an item, or who decided it, read the way the Inbox reads claims:
 * feedback claims through its Reviewing status, and the decision that put the
 * item in its current status names the actor.
 *
 * - `open`: New, nobody has it.
 * - `mine` / `other`: Reviewing, claimed by the viewer or another admin.
 * - `unknown`: Reviewing with no recorded reviewer (a row from before the log).
 * - `decided`: Resolved, Rejected or Spam, with who and when when recorded.
 */
export type FeedbackHold =
  | { kind: "open" }
  | { kind: "mine"; at: string | null }
  | { kind: "other"; by: string; at: string | null }
  | { kind: "unknown" }
  | { kind: "decided"; status: FeedbackQueueStatus; by: string | null; at: string | null; mine: boolean };

export function holdOf(row: LoggedRow, viewer: string | null | undefined): FeedbackHold {
  if (row.status === "new") return { kind: "open" };
  const log = decisionLogOf({ ...row, created_at: row.created_at ?? "" });
  // The latest entry that moved the item into its status; link entries leave the status where it was.
  const entry = [...log].reverse().find((candidate) => candidate.to === row.status && candidate.from !== candidate.to);
  const actor = entry && entry.actor !== UNKNOWN_DECISION_ACTOR ? entry.actor : row.reviewed_by?.trim() || null;
  const at = entry?.at ?? row.reviewed_at ?? null;
  if (isDecided(row.status)) {
    return { kind: "decided", status: row.status, by: actor, at, mine: sameActor(actor, viewer) };
  }
  if (!actor) return { kind: "unknown" };
  return sameActor(actor, viewer) ? { kind: "mine", at } : { kind: "other", by: actor, at };
}

/** "4 unresolved", "1 spam", "12 in all": the list's count line for a filter. */
export function describeFilterCount(total: number, filter: FeedbackQueueFilter): string {
  return filter === "all" ? `${total} in all` : `${total} ${FEEDBACK_STATUS_LABELS[filter].toLowerCase()}`;
}

/**
 * What an empty list says. A search that matched nothing names the search; a
 * status with nothing says how much waits under the other statuses, so the
 * editor can widen it; a source with nothing at all is all clear.
 */
export type EmptyQueue =
  | { kind: "search"; message: string; found: { status: FeedbackQueueStatus; count: number }[] }
  | { kind: "filtered"; message: string; elsewhere: number }
  | { kind: "clear"; message: string };

export function describeEmptyQueue(
  filter: FeedbackQueueFilter,
  counts: StatusCounts | null,
  search: string,
  noun: string,
): EmptyQueue {
  if (search) {
    // The counts are of every row the search matches, so they say where the matches are.
    const found = counts ? QUEUE_STATUSES.filter((status) => counts[status] > 0).map((status) => ({ status, count: counts[status] })) : [];
    return {
      kind: "search",
      message: `No ${filter === "all" ? "" : `${FEEDBACK_STATUS_LABELS[filter].toLowerCase()} `}${noun} matches “${search}”.`,
      found,
    };
  }
  const everything = counts ? totalFor(counts, "all") : 0;
  if (filter !== "all" && everything > 0) {
    const waiting = counts ? totalFor(counts, "unresolved") : 0;
    const label = FEEDBACK_STATUS_LABELS[filter].toLowerCase();
    const tail =
      filter !== "unresolved" && filter !== "new" && filter !== "reviewing" && waiting > 0
        ? ` ${waiting} still ${waiting === 1 ? "waits" : "wait"} on a decision.`
        : ` ${everything} ${everything === 1 ? "item is" : "items are"} under other statuses.`;
    return { kind: "filtered", message: `No ${label} ${noun}.${tail}`, elsewhere: everything };
  }
  return { kind: "clear", message: `All clear. No ${noun} yet.` };
}

/** Per-status counts are known only when every status has one. */
export function countsKnown(counts: StatusCounts | null): counts is StatusCounts {
  return counts !== null && QUEUE_STATUSES.every((status) => Number.isInteger(counts[status]));
}

/** A refused write under `DATA_WRITES_FROZEN` reads as the freeze, not as the route's words. */
export function isFreezeRefusal(message: string): boolean {
  return /frozen|DATA_WRITES_FROZEN|writes are paused/i.test(message);
}

export const FREEZE_DECISION_COPY = "Writes are paused, so that was not saved. Try again once they resume.";
