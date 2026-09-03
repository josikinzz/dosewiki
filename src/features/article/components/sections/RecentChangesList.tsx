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

function RecentChangeRow({ change }: { change: ArticleRecentChange }) {
  const [isDiffExpanded, setIsDiffExpanded] = useState(false);
  const hasDiff = change.diff.length > 0;
  const diffId = `recent-change-diff-${change.id}`;
  const contributorName = change.contributor?.name ?? "Editor";

  return (
    <li>
      <div className="flex items-start gap-3 py-2.5 sm:items-center">
        <time
          dateTime={change.createdAt}
          className="theme-text-faint mt-0.5 w-[6.5rem] shrink-0 font-mono text-[11px] tabular-nums sm:mt-0"
        >
          {dateFormat.format(new Date(change.createdAt))}
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
          <span className="line-clamp-2 sm:inline">{change.message}</span>
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
  return (
    <ol className="divide-y divide-dose-border">
      {changes.map((change) => (
        <RecentChangeRow key={change.id} change={change} />
      ))}
    </ol>
  );
}
