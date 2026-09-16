"use client";

import { useState } from "react";

import { HistoryDiff } from "@/components/changelog/HistoryDiff";
import type { CitationContext } from "@/components/changelog/ProseDiff";
import { ExpandButton } from "@/components/common/ExpandButton";
import { SmartLink } from "@/components/common/SmartLink";
import { cn } from "@/lib/utils";
import { useT, useUiLocale } from "@/i18n/client";
import type {
  ArticleRecentChange,
  ChangeFieldSegment,
} from "@/data/changelog/articleRecentChanges";
import {
  fieldWords,
  NAMED_SIBLINGS,
} from "@/data/changelog/articleRecentChanges";
import {
  formattingLocale,
  UI_LOCALES,
  type Translate,
  type UiLocale,
} from "@/i18n/messages";
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

// Zone is fixed (UTC) so every render agrees; the locale follows the page's
// UI locale, which is hydration-stable because both the server render and the
// client hydrate read it from the same matched route segments.
const dayFormats = Object.fromEntries(
  UI_LOCALES.map((locale) => [
    locale,
    new Intl.DateTimeFormat(formattingLocale(locale), {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }),
  ]),
) as Record<UiLocale, Intl.DateTimeFormat>;
const timeFormats = Object.fromEntries(
  UI_LOCALES.map((locale) => [
    locale,
    new Intl.DateTimeFormat(formattingLocale(locale), {
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      timeZone: "UTC",
    }),
  ]),
) as Record<UiLocale, Intl.DateTimeFormat>;

const linkClassName = cn(
  "rounded underline decoration-[color-mix(in_srgb,currentColor_35%,transparent)] decoration-1 underline-offset-2",
  "transition-[text-decoration-color,opacity] hover:decoration-current",
  "theme-focus-ring",
);
const nameClassName = cn("theme-accent-heading font-semibold", linkClassName);

const targetClassName = cn("theme-text-primary", linkClassName);

/** "Routes 1 › Dose ranges › Heavy": each label translates alone, the index stays a number. */
function fieldLabel(segments: ChangeFieldSegment[], t: Translate): string {
  return fieldWords(segments, t);
}

function RecentChangeRow({
  change,
  article,
  hideArticleNames,
}: {
  change: ArticleRecentChange;
  article: RecentChangesListProps["article"];
  hideArticleNames: boolean;
}) {
  const t = useT();
  const locale = useUiLocale();
  const [isDiffExpanded, setIsDiffExpanded] = useState(false);
  // Source rows say everything in their own line; only prose and bulk edits
  // have a passage worth opening.
  const hasDiff = change.kind !== "source" && change.hasDiff;
  const diffId = `recent-change-diff-${change.id}`;
  const contributorName = change.contributor?.name ?? t("Editor");
  // Site-wide, a row's anchors point into the article it touched. A bulk
  // save across several articles has no single home; its rows link each one.
  const siblings = article
    ? change.articles.filter((touched) => touched.slug !== change.subjectSlug)
    : [];
  const named = siblings.slice(0, NAMED_SIBLINGS);
  // Trimmed projections carry the real count; the site-wide feed has them all.
  const siblingTotal = change.siblingTotal ?? siblings.length;
  const primary = article
    ? null
    : ((change.subjectSlug
        ? change.articles.find((touched) => touched.slug === change.subjectSlug)
        : change.articles[0]) ?? null);
  const hrefBase = article
    ? ""
    : primary
      ? publicHref.substance(primary.slug)
      : "";
  const citations: CitationContext = article
    ? article.citations
    : { numbers: {}, hrefBase };

  return (
    <li>
      <div className="flex items-start gap-x-3 py-2.5 sm:items-center">
        <time
          dateTime={change.createdAt}
          className="theme-text-faint mt-[3px] w-[3.25rem] shrink-0 font-mono text-[11px] tabular-nums sm:mt-0"
        >
          {timeFormats[locale].format(new Date(change.createdAt))}
        </time>
        <p className="theme-text-secondary min-w-0 flex-1 text-sm leading-snug">
          {change.contributor?.href ? (
            <SmartLink href={change.contributor.href} className={nameClassName}>
              {contributorName}
            </SmartLink>
          ) : (
            <span className="theme-text-primary font-semibold">
              {contributorName}
            </span>
          )}
          <span className="theme-text-faint"> · </span>
          <span>{t(change.message)}</span>
          {!article && change.articles.length > 1 ? (
            <>
              <span className="theme-text-faint"> {t("across")} </span>
              {change.articles.map((touched, index) => (
                <span key={touched.slug}>
                  {index > 0 ? (
                    <span className="theme-text-faint">, </span>
                  ) : null}
                  <SmartLink
                    href={publicHref.substance(touched.slug)}
                    className={targetClassName}
                  >
                    {touched.title}
                  </SmartLink>
                </span>
              ))}
            </>
          ) : (
            <>
              {!article && primary && !hideArticleNames ? (
                <>
                  <span className="theme-text-faint"> {t("to")} </span>
                  <SmartLink
                    href={
                      change.section
                        ? `${hrefBase}#${change.section.id}`
                        : hrefBase
                    }
                    className={targetClassName}
                  >
                    {primary.title}
                  </SmartLink>
                </>
              ) : null}
              {change.section && change.kind !== "source" ? (
                <>
                  <span className="theme-text-faint">
                    {" "}
                    {article || hideArticleNames ? t("in") : "›"}{" "}
                  </span>
                  {article || hideArticleNames ? (
                    <a
                      href={`${hrefBase}#${change.section.id}`}
                      className={targetClassName}
                    >
                      {t(change.section.label)}
                    </a>
                  ) : (
                    <span className="theme-text-faint">
                      {t(change.section.label)}
                    </span>
                  )}
                  {change.field ? (
                    <span className="theme-text-faint">
                      {" "}
                      › {fieldLabel(change.field, t)}
                    </span>
                  ) : null}
                </>
              ) : change.field ? (
                <span className="theme-text-faint">
                  {" "}
                  {t("in")} {fieldLabel(change.field, t)}
                </span>
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
              {" · "}
              {t("also")}{" "}
              {named.map((touched, index) => (
                <span key={touched.slug}>
                  {index > 0 ? ", " : ""}
                  <SmartLink
                    href={publicHref.substance(touched.slug)}
                    className={targetClassName}
                  >
                    {touched.title}
                  </SmartLink>
                </span>
              ))}
              {siblingTotal > named.length
                ? ` ${t("and {{count}} more", { count: siblingTotal - named.length })}`
                : ""}
            </span>
          ) : null}
        </p>
        {hasDiff ? (
          <ExpandButton
            isExpanded={isDiffExpanded}
            onToggle={() => setIsDiffExpanded(!isDiffExpanded)}
            variant="faint"
            ariaControls={isDiffExpanded ? diffId : undefined}
            ariaLabel={
              isDiffExpanded ? t("Hide what changed") : t("Show what changed")
            }
            className="shrink-0"
          />
        ) : null}
      </div>
      {hasDiff && isDiffExpanded ? (
        <HistoryDiff
          entryId={change.id}
          subjectSlug={change.subjectSlug}
          id={diffId}
          prose={change.kind !== "bulk"}
          citations={citations}
          className="theme-public-card-subtle mb-3 rounded-xl border px-4 py-3 sm:ml-[4rem]"
        />
      ) : null}
    </li>
  );
}

/**
 * Human edits, newest first, grouped by day with a time on every row. Diff
 * text stays hidden until the row's own expander is pressed, so the resting
 * list is as tall as its rows and nothing more.
 */
export function RecentChangesList({
  changes,
  article = null,
  hideArticleNames = false,
}: RecentChangesListProps) {
  const t = useT();
  const locale = useUiLocale();
  const days: { label: string; changes: ArticleRecentChange[] }[] = [];
  for (const change of changes) {
    const label = dayFormats[locale].format(new Date(change.createdAt));
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
        <span>{t("Times are UTC")}</span>
        <span>{t("Newest first")}</span>
      </p>
      {days.map((day) => (
        <section key={day.label} aria-label={day.label}>
          <h3 className="theme-text-faint mt-2 border-b border-dose-border pb-1.5 font-mono text-[11px] tabular-nums">
            {day.label}
          </h3>
          <ol className="divide-y divide-dose-border">
            {day.changes.map((change) => (
              <RecentChangeRow
                key={change.id}
                change={change}
                article={article}
                hideArticleNames={hideArticleNames}
              />
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
