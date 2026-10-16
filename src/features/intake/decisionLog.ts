import type { FeedbackOutcome, LinkedChange } from "./feedbackCorrection";

export type DecisionLogEntry<Status extends string = string> = {
  at: string;
  actor: string;
  from?: Status;
  to: Status;
  note?: string;
  public_reason?: string;
  migrated?: boolean;
  outcome?: FeedbackOutcome;
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

export const UNKNOWN_DECISION_ACTOR = "unknown";

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

export function appendDecision<Status extends string>(
  row: DecisionLogged<Status>,
  entry: DecisionLogEntry<Status>,
): DecisionLogEntry<Status>[] {
  return [...decisionLogOf(row), withoutEmptyText(entry)];
}

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
