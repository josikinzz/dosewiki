import { useId } from "react";

import type { DecisionLogEntry } from "@/features/intake/decisionLog";
import { formatReviewerIdentity } from "@/features/dev/tools/reviewerIdentity";

/**
 * An intake item's decision log as the review panels show it: every status
 * change, oldest first, with who made it, when, the move, and the note.
 */
export function DecisionLogSection<Status extends string>({
  entries,
  statusLabel,
}: {
  entries: readonly DecisionLogEntry<Status>[];
  statusLabel: (status: Status) => string;
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
                {entry.migrated
                  ? `Earlier decision: ${statusLabel(entry.to)}`
                  : `${entry.from ? statusLabel(entry.from) : "Unknown"} to ${statusLabel(entry.to)}`}
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
