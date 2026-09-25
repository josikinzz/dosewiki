import { useId } from "react";

import type { DecisionLogEntry } from "@/features/intake/decisionLog";
import type { FeedbackOutcome } from "@/features/intake/feedbackCorrection";
import { formatReviewerIdentity } from "@/features/dev/tools/reviewerIdentity";

/**
 * An intake item's decision log as the review panels show it: every status
 * change, oldest first, with who made it, when, the move, and the note. An
 * article feedback entry also names its outcome, or the change it linked.
 */
export function DecisionLogSection<Status extends string>({
  entries,
  statusLabel,
  outcomeLabel,
}: {
  entries: readonly DecisionLogEntry<Status>[];
  statusLabel: (status: Status) => string;
  /** How a recorded outcome reads; sources without outcomes leave it out. */
  outcomeLabel?: (outcome: FeedbackOutcome) => string;
}) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId}>
      <h4 id={headingId} className="theme-accent-heading text-sm font-semibold">
        Decision log
      </h4>
      {entries.length === 0 ? (
        <p className="text-dose-text-ghost mt-1.5 text-sm">No decisions yet.</p>
      ) : (
        <ol aria-label="Decision log" className="mt-2 space-y-3">
          {entries.map((entry, index) => (
            <li key={`${entry.at}-${index}`} className="theme-portal-rule border-l-2 pl-3">
              <p className="theme-text-primary text-sm font-medium">
                {describeEntry(entry, statusLabel, outcomeLabel)}
              </p>
              <p className="theme-text-faint mt-0.5 text-xs">
                {[
                  formatReviewerIdentity(entry.actor) ?? entry.actor,
                  formatDecisionTime(entry.at),
                  entry.migrated ? "recorded before the decision log" : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {entry.note ? (
                <p className="theme-text-secondary mt-1 whitespace-pre-line text-sm leading-6">{entry.note}</p>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function describeEntry<Status extends string>(
  entry: DecisionLogEntry<Status>,
  statusLabel: (status: Status) => string,
  outcomeLabel: ((outcome: FeedbackOutcome) => string) | undefined,
): string {
  if (entry.migrated) {
    return `Earlier decision: ${statusLabel(entry.to)}`;
  }
  if (entry.linked_change && entry.from === entry.to) {
    const kind = entry.linked_change.kind === "proposal" ? "proposal" : "published revision";
    return `Linked ${kind} #${entry.linked_change.id.slice(-6)}`;
  }
  const move = `${entry.from ? statusLabel(entry.from) : "Unknown"} to ${statusLabel(entry.to)}`;
  return entry.outcome && outcomeLabel ? `${move} as ${outcomeLabel(entry.outcome)}` : move;
}

function formatDecisionTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
