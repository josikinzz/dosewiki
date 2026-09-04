"use client";

import { useState } from "react";

import { ProseDiff } from "@/components/changelog/ProseDiff";
import { ExpandButton } from "@/components/common/ExpandButton";
import { SmartLink } from "@/components/common/SmartLink";
import { cn } from "@/lib/utils";
import type { ArticleRecentChange } from "@/data/changelog/articleRecentChanges";

interface RecentChangesListProps {
  changes: ArticleRecentChange[];
  /** Reference id → citation number, so diffs render citations as the article does. */
  citationNumbers: Record<string, number>;
}

// Fixed locale and zone: this renders on the server and hydrates on the
// client, and a locale-dependent date would mismatch between the two.
const dayFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const timeFormat = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "UTC",
});

const linkClassName = cn(
  "rounded underline decoration-[color-mix(in_srgb,currentColor_35%,transparent)] decoration-1 underline-offset-2",
  "transition-[text-decoration-color,opacity] hover:decoration-current",
  "theme-focus-ring",
);
const nameClassName = cn("theme-accent-heading font-semibold", linkClassName);

function RecentChangeRow({
  change,
  citationNumbers,
}: {
  change: ArticleRecentChange;
  citationNumbers: Record<string, number>;
}) {
  const [isDiffExpanded, setIsDiffExpanded] = useState(false);
  // Source rows say everything in their own line; only prose and bulk edits
  // have a passage worth opening.
  const hasDiff = change.kind !== "source" && change.diff.length > 0;
  const diffId = `recent-change-diff-${change.id}`;
  const contributorName = change.contributor?.name ?? "Editor";

  return (
    <li>
      <div className="flex items-start gap-x-3 py-2.5 sm:items-center">
        <time
          dateTime={change.createdAt}
          className="theme-text-faint mt-[3px] w-[3.25rem] shrink-0 font-mono text-[11px] tabular-nums sm:mt-0"
        >
          {timeFormat.format(new Date(change.createdAt))}
        </time>
        <p className="theme-text-secondary min-w-0 flex-1 text-sm leading-snug">
          {change.contributor?.href ? (
            <SmartLink href={change.contributor.href} className={nameClassName}>
              {contributorName}
            </SmartLink>
          ) : (
            <span className="theme-text-primary font-semibold">{contributorName}</span>
          )}
          <span className="theme-text-faint"> · </span>
          <span>{change.message}</span>
          {change.section && change.kind !== "source" ? (
            <>
              <span className="theme-text-faint"> in </span>
              <a href={`#${change.section.id}`} className={cn("theme-text-primary", linkClassName)}>
                {change.section.label}
              </a>
              {change.field ? <span className="theme-text-faint"> › {change.field}</span> : null}
            </>
          ) : change.field ? (
            <span className="theme-text-faint"> in {change.field}</span>
          ) : null}
          {change.detail ? (
            <span className="theme-text-faint">
              {": "}
              <span className="theme-text-muted">{change.detail}</span>
            </span>
          ) : null}
          {change.articleCount > 1 ? (
            <span className="theme-text-faint"> · part of a save across {change.articleCount} articles</span>
          ) : null}
        </p>
        {hasDiff ? (
          <ExpandButton
            isExpanded={isDiffExpanded}
            onToggle={() => setIsDiffExpanded(!isDiffExpanded)}
            variant="faint"
            ariaControls={isDiffExpanded ? diffId : undefined}
            ariaLabel={isDiffExpanded ? "Hide what changed" : "Show what changed"}
            className="shrink-0"
          />
        ) : null}
      </div>
      {hasDiff && isDiffExpanded ? (
        <ProseDiff
          markdown={change.diff}
          id={diffId}
          citationNumbers={citationNumbers}
          className="theme-public-card-subtle mb-3 rounded-xl border px-4 py-3 sm:ml-[4rem]"
        />
      ) : null}
    </li>
  );
}

/**
 * The article's human edits, newest first, grouped by day with a time on
 * every row. Diff text stays hidden until the row's own expander is pressed,
 * so the resting list is as tall as its rows and nothing more.
 */
export function RecentChangesList({ changes, citationNumbers }: RecentChangesListProps) {
  const days: { label: string; changes: ArticleRecentChange[] }[] = [];
  for (const change of changes) {
    const label = dayFormat.format(new Date(change.createdAt));
    const last = days[days.length - 1];
    if (last && last.label === label) {
      last.changes.push(change);
    } else {
      days.push({ label, changes: [change] });
    }
  }

  return (
    <div>
      <p className="theme-text-faint flex items-baseline justify-between gap-3 pt-2 text-[11px]">
        <span>Times are UTC</span>
        <span>Newest first</span>
      </p>
      {days.map((day) => (
        <section key={day.label} aria-label={day.label}>
          <h3 className="theme-text-faint mt-2 border-b border-dose-border pb-1.5 font-mono text-[11px] tabular-nums">
            {day.label}
          </h3>
          <ol className="divide-y divide-dose-border">
            {day.changes.map((change) => (
              <RecentChangeRow key={change.id} change={change} citationNumbers={citationNumbers} />
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
