"use client";

import { useState } from "react";

import { ChangelogDiff } from "@/components/changelog/ChangelogDiff";
import { ExpandButton } from "@/components/common/ExpandButton";
import { SmartLink } from "@/components/common/SmartLink";
import { cn } from "@/lib/utils";
import type { ArticleRecentChange } from "@/data/changelog/articleRecentChanges";

interface RecentChangesListProps {
  changes: ArticleRecentChange[];
}

// Fixed locale and zone: this renders on the server and hydrates on the
// client, and a locale-dependent date would mismatch between the two.
const dateFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const nameClassName = cn(
  "theme-accent-heading rounded font-semibold",
  "underline decoration-[color-mix(in_srgb,currentColor_35%,transparent)] decoration-1 underline-offset-2",
  "transition-[text-decoration-color,opacity] hover:decoration-current",
  "theme-focus-ring",
);

function RecentChangeRow({ change, dateLabel }: { change: ArticleRecentChange; dateLabel: string | null }) {
  const [isDiffExpanded, setIsDiffExpanded] = useState(false);
  const hasDiff = change.diff.length > 0;
  const diffId = `recent-change-diff-${change.id}`;
  const contributorName = change.contributor?.name ?? "Editor";

  return (
    <li>
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1 py-2.5 sm:flex-nowrap sm:items-center">
        <time
          dateTime={change.createdAt}
          className="theme-text-faint basis-full font-mono text-[11px] tabular-nums sm:w-[6.5rem] sm:basis-auto sm:shrink-0"
        >
          {dateLabel ?? <span className="sr-only">{dateFormat.format(new Date(change.createdAt))}</span>}
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
          {change.articleCount > 1 ? (
            <span className="theme-text-faint"> · one of {change.articleCount} articles in this save</span>
          ) : null}
        </p>
        {hasDiff ? (
          <ExpandButton
            isExpanded={isDiffExpanded}
            onToggle={() => setIsDiffExpanded(!isDiffExpanded)}
            variant="faint"
            ariaControls={diffId}
            ariaLabel={isDiffExpanded ? "Hide what changed" : "Show what changed"}
            className="shrink-0"
          />
        ) : null}
      </div>
      {hasDiff && isDiffExpanded ? (
        <ChangelogDiff
          markdown={change.diff}
          id={diffId}
          keyPrefix={change.id}
          wrap
          className="mb-2.5 rounded-lg border"
        />
      ) : null}
    </li>
  );
}

/**
 * The article's human edits, newest first, one line each. Diff text stays
 * hidden until the row's own expander is pressed, so the resting list is as
 * tall as its rows and nothing more.
 */
export function RecentChangesList({ changes }: RecentChangesListProps) {
  // A run of same-day edits shows its date once; later rows keep it for
  // screen readers only.
  let previousLabel: string | null = null;
  return (
    <ol className="divide-y divide-dose-border">
      {changes.map((change) => {
        const label = dateFormat.format(new Date(change.createdAt));
        const dateLabel = label === previousLabel ? null : label;
        previousLabel = label;
        return <RecentChangeRow key={change.id} change={change} dateLabel={dateLabel} />;
      })}
    </ol>
  );
}
