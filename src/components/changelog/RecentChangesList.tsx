"use client";

import { useState } from "react";

import { ChangelogDiff } from "@/components/changelog/ChangelogDiff";
import { ProseDiff, type CitationContext } from "@/components/changelog/ProseDiff";
import { ExpandButton } from "@/components/common/ExpandButton";
import { SmartLink } from "@/components/common/SmartLink";
import { cn } from "@/lib/utils";
import type { ArticleRecentChange } from "@/data/changelog/articleRecentChanges";
import { publicHref } from "@/utils/publicHref";

interface RecentChangesListProps {
  changes: ArticleRecentChange[];
  /**
   * On an article page: that article's citation numbering, section anchors
   * on this page. Absent (the site-wide feed): each row names its article and
   * links into it; citations render as "source" chips into that article.
   */
  article?: { citations: CitationContext } | null;
  /** Site-wide list already filtered to one article: skip naming it on every row. */
  hideArticleNames?: boolean;
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
/** On the article page, how many other articles of a bulk save are named before "and N more". */
const NAMED_SIBLINGS = 3;
const targetClassName = cn("theme-text-primary", linkClassName);

function RecentChangeRow({
  change,
  article,
  hideArticleNames,
}: {
  change: ArticleRecentChange;
  article: RecentChangesListProps["article"];
  hideArticleNames: boolean;
}) {
  const [isDiffExpanded, setIsDiffExpanded] = useState(false);
  // Source rows say everything in their own line; only prose and bulk edits
  // have a passage worth opening.
  const hasDiff = change.kind !== "source" && change.diff.length > 0;
  const diffId = `recent-change-diff-${change.id}`;
  const contributorName = change.contributor?.name ?? "Editor";
  // Site-wide, a row's anchors point into the article it touched. A bulk
  // save across several articles has no single home; its rows link each one.
  const siblings = article ? change.articles.filter((touched) => touched.slug !== change.subjectSlug) : [];
  const primary = article ? null : change.articles[0] ?? null;
  const hrefBase = article ? "" : primary ? publicHref.substance(primary.slug) : "";
  const citations: CitationContext = article ? article.citations : { numbers: {}, hrefBase };

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
          {!article && change.articles.length > 1 ? (
            <>
              <span className="theme-text-faint"> across </span>
              {change.articles.map((touched, index) => (
                <span key={touched.slug}>
                  {index > 0 ? <span className="theme-text-faint">, </span> : null}
                  <SmartLink href={publicHref.substance(touched.slug)} className={targetClassName}>
                    {touched.title}
                  </SmartLink>
                </span>
              ))}
            </>
          ) : (
            <>
              {!article && primary && !hideArticleNames ? (
                <>
                  <span className="theme-text-faint"> to </span>
                  <SmartLink
                    href={change.section ? `${hrefBase}#${change.section.id}` : hrefBase}
                    className={targetClassName}
                  >
                    {primary.title}
                  </SmartLink>
                </>
              ) : null}
              {change.section && change.kind !== "source" ? (
                <>
                  <span className="theme-text-faint"> {article || hideArticleNames ? "in" : "›"} </span>
                  {article || hideArticleNames ? (
                    <a href={`${hrefBase}#${change.section.id}`} className={targetClassName}>
                      {change.section.label}
                    </a>
                  ) : (
                    <span className="theme-text-faint">{change.section.label}</span>
                  )}
                  {change.field ? <span className="theme-text-faint"> › {change.field}</span> : null}
                </>
              ) : change.field ? (
                <span className="theme-text-faint"> in {change.field}</span>
              ) : null}
            </>
          )}
          {change.detail ? (
            <span className="theme-text-faint">
              {": "}
              <span className="theme-text-muted">{change.detail}</span>
            </span>
          ) : null}
          {article && siblings.length > 0 ? (
            <span className="theme-text-faint">
              {" · also "}
              {siblings.slice(0, NAMED_SIBLINGS).map((touched, index) => (
                <span key={touched.slug}>
                  {index > 0 ? ", " : ""}
                  <SmartLink href={publicHref.substance(touched.slug)} className={targetClassName}>
                    {touched.title}
                  </SmartLink>
                </span>
              ))}
              {siblings.length > NAMED_SIBLINGS ? ` and ${siblings.length - NAMED_SIBLINGS} more` : ""}
            </span>
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
        change.kind === "bulk" ? (
          // A Dev-editor save is a structural JSON diff, one section per
          // article: the code-style renderer keeps its columns readable.
          <ChangelogDiff
            markdown={change.diff}
            id={diffId}
            keyPrefix={change.id}
            className="mb-3 rounded-xl border border-dose-border sm:ml-[4rem]"
          />
        ) : (
          <ProseDiff
            markdown={change.diff}
            id={diffId}
            citations={citations}
            className="theme-public-card-subtle mb-3 rounded-xl border px-4 py-3 sm:ml-[4rem]"
          />
        )
      ) : null}
    </li>
  );
}

/**
 * Human edits, newest first, grouped by day with a time on every row. Diff
 * text stays hidden until the row's own expander is pressed, so the resting
 * list is as tall as its rows and nothing more.
 */
export function RecentChangesList({ changes, article = null, hideArticleNames = false }: RecentChangesListProps) {
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
              <RecentChangeRow key={change.id} change={change} article={article} hideArticleNames={hideArticleNames} />
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
