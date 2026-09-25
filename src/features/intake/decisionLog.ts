/**
 * The append-only decision log an intake item (trip report submission, article
 * or site feedback) keeps: one entry per status transition, oldest first.
 * Article feedback also logs each change linked to it as an entry whose status
 * does not move (see `feedbackCorrection.ts`).
 * Client-safe (no node imports), so the Postgres mutations, the routes and the
 * review panels read one shape and one derivation.
 *
 * `review_notes` stays on the row for compatibility and still carries the
 * latest note. A row decided before the log existed has no stored log; its
 * review note (and the reviewer stamped with it) reads back as one migrated
 * entry, and the first new transition stores that entry ahead of its own, so
 * no backfill is needed.
 */

import type { FeedbackOutcome, LinkedChange } from "./feedbackCorrection";

export type DecisionLogEntry<Status extends string = string> = {
  /** ISO timestamp of the decision. */
  at: string;
  /** The resolved actor who made it, never a caller-supplied name. */
  actor: string;
  /** Absent only on a migrated entry, whose earlier status was never recorded. */
  from?: Status;
  to: Status;
  /** The reviewer's private note. */
  note?: string;
  /**
   * Reason the submitter may see. Trip report authors read it in My reports
   * while the decision that carries it still stands (see `publicReasonOf`).
   */
  public_reason?: string;
  /** True on the entry derived from a review note stored before the log existed. */
  migrated?: boolean;
  /**
   * Feedback only: the explicit outcome the decision closed the item with
   * (see `feedbackCorrection.ts`). Advisory; it gates nothing.
   */
  outcome?: FeedbackOutcome;
  /**
   * Feedback only: a change linked to the item. A link entry leaves the
   * status where it was (`from` equals `to`).
   */
  linked_change?: LinkedChange;
};

export type DecisionLogged<Status extends string = string> = {
  status: Status;
  review_notes?: string;
  reviewed_by?: string;
  reviewed_at?: string;
  updated_at?: string;
  created_at: string;
  decision_log?: DecisionLogEntry<Status>[];
};

/** Actor shown on a migrated entry whose row recorded no reviewer. */
export const UNKNOWN_DECISION_ACTOR = "unknown";

/**
 * The row's decision log, oldest first. A stored log is returned as is; a row
 * without one yields its last recorded decision (review note, reviewer) as a
 * single migrated entry, or nothing when it was never decided.
 */
export function decisionLogOf<Status extends string>(
  row: DecisionLogged<Status>,
): DecisionLogEntry<Status>[] {
  if (row.decision_log && row.decision_log.length > 0) {
    return row.decision_log;
  }

  const note = row.review_notes?.trim() ? row.review_notes : undefined;
  const reviewer = row.reviewed_by?.trim() || undefined;
  if (!note && !reviewer) {
    return [];
  }

  return [
    {
      at: row.reviewed_at ?? row.updated_at ?? row.created_at,
      actor: reviewer ?? UNKNOWN_DECISION_ACTOR,
      to: row.status,
      ...(note ? { note } : {}),
      migrated: true,
    },
  ];
}

/** The log after one more decision: every earlier entry kept, in order, then this one. */
export function appendDecision<Status extends string>(
  row: DecisionLogged<Status>,
  entry: DecisionLogEntry<Status>,
): DecisionLogEntry<Status>[] {
  return [...decisionLogOf(row), withoutEmptyText(entry)];
}

/**
 * The public reason a submitter may read: the one on the latest decision, and
 * only while that decision still stands (the row is in the status it moved
 * to). A reason given on a rejection that was later reopened is not shown.
 * Private notes and the actor never leave through here.
 */
export function publicReasonOf<Status extends string>(row: DecisionLogged<Status>): string | undefined {
  const log = decisionLogOf(row);
  const latest = log[log.length - 1];
  if (!latest || latest.to !== row.status) {
    return undefined;
  }
  return latest.public_reason?.trim() || undefined;
}

function withoutEmptyText<Status extends string>(entry: DecisionLogEntry<Status>): DecisionLogEntry<Status> {
  const { note, public_reason: publicReason, ...rest } = entry;
  return {
    ...rest,
    ...(note?.trim() ? { note } : {}),
    ...(publicReason?.trim() ? { public_reason: publicReason } : {}),
  };
}
