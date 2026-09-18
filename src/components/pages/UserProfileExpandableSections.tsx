"use client";

import { useState } from "react";
import { HistoryDiff } from "@/components/changelog/HistoryDiff";
import { ExpandButton } from "@/components/common/ExpandButton";
import { Icon } from "@/components/common/Icon";
import { PublicPill } from "@/components/common/PublicTokens";
import { NestedContentCard } from "@/components/ui/surface";
import { PublicSectionHeading } from "@/components/layout/PublicPagePrimitives";
import { ReportCard } from "@/features/reports/components/ReportCard";
import { applyCuratedOrder } from "@server/curatedOrder";
import type { PublicProfileHistoryEntry } from "@server/data/publicData.changelog";
import type { ReportCardModel } from "@/types/tripReport";
import { icons } from "@/utils/iconNames";
import { publicHref } from "@/utils/publicHref";
import { useT, useUiLocale } from "@/i18n/client";
import { formattingLocale } from "@/i18n/messages";
import { cn } from "@/lib/utils";

interface UserTripReportsSectionProps {
  profileKey: string;
  tripReports: ReportCardModel[];
  /**
   * The contributor's curated report ordering. Applied here rather than only on
   * the server because this section owns the featured/alphabetical default sort
   * below — a curation applied upstream would be sorted straight back out.
   */
  reportOrder?: readonly string[];
  reportHrefPrefix?: string;
}

interface UserContributionsSectionProps {
  profileKey: string;
  history: PublicProfileHistoryEntry[];
}

/** How many changelog rows the section shows before the count expander. */
const COLLAPSED_CONTRIBUTION_ROWS = 4;

export function UserTripReportsSection({
  profileKey,
  tripReports,
  reportOrder,
  reportHrefPrefix,
}: UserTripReportsSectionProps) {
  const t = useT();
  const [isReportsExpanded, setIsReportsExpanded] = useState(false);
  const reportsSectionId = `${profileKey}-reports`;

  const sortedTripReports = applyCuratedOrder(
    tripReports.slice().sort((a, b) => {
      if (a.featured && !b.featured) return -1;
      if (!a.featured && b.featured) return 1;
      return a.title.localeCompare(b.title);
    }),
    reportOrder,
    (report) => report.slug,
  );

  const hasReports = sortedTripReports.length > 0;

  if (!hasReports) {
    return null;
  }

  return (
    <section className="space-y-5">
      <PublicSectionHeading
        icon={icons.fileSignature}
        title={t("Trip Reports")}
        titleElement="h2"
      />

      <div id={reportsSectionId} className="space-y-4">
        {sortedTripReports
          .slice(0, isReportsExpanded ? undefined : 3)
          .map((report, index) => (
            <div key={report.slug} className={index >= 3 ? "theme-reveal-enter" : undefined}>
              <ReportCard
                report={report}
                href={
                  reportHrefPrefix
                    ? `${reportHrefPrefix}${report.slug}`
                    : publicHref.report(report.slug)
                }
              />
            </div>
          ))}
        {sortedTripReports.length > 3 && (
          <ExpandButton
            isExpanded={isReportsExpanded}
            onToggle={() => setIsReportsExpanded(!isReportsExpanded)}
            variant="count"
            count={sortedTripReports.length - 3}
            ariaControls={reportsSectionId}
            ariaLabel={isReportsExpanded ? t("Collapse trip reports") : t("Expand trip reports")}
            className="mx-auto"
          />
        )}
      </div>
    </section>
  );
}

const CONTRIBUTION_ARTICLE_PILL_CAP = 3;

/**
 * One compact changelog row: timestamp (or commit sha) · save message ·
 * article pills · a faint per-row expander that reveals the diff. Resting
 * state never shows diff text.
 */
function ContributionRow({ entry }: { entry: PublicProfileHistoryEntry }) {
  const [isDiffExpanded, setIsDiffExpanded] = useState(false);
  const [hasOpenedDiff, setHasOpenedDiff] = useState(false);
  const t = useT();
  const locale = useUiLocale();
  const timeFormat = new Intl.DateTimeFormat(formattingLocale(locale), {
    hour: "numeric",
    minute: "2-digit",
  });
  const hasDiff = entry.hasDiff;
  const diffId = `contribution-diff-${entry.id}`;
  const stamp = entry.commit?.sha
    ? entry.commit.sha.slice(0, 7)
    : timeFormat.format(new Date(entry.createdAt));
  const articles = entry.articles.slice(0, CONTRIBUTION_ARTICLE_PILL_CAP);
  const overflowCount = entry.articles.length - articles.length;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2.5">
        <code className="theme-text-faint shrink-0 font-mono text-[11px]">{stamp}</code>
        <div className="theme-text-primary min-w-0 flex-1 basis-48 text-sm">
          {entry.commit?.url ? (
            <a
              href={entry.commit.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t("{{message}} (opens commit on GitHub in a new tab)", { message: entry.commit.message })}
              className="group/commit inline-flex items-start gap-1.5 transition hover:underline hover:underline-offset-2"
            >
              <span className="line-clamp-2">{t(entry.commit.message)}</span>
              <Icon
                icon="lucide:external-link"
                size={13}
                className="theme-text-faint mt-0.5 shrink-0 transition-opacity group-hover/commit:opacity-80"
              />
            </a>
          ) : (
            <span className="line-clamp-2">{t(entry.commit.message)}</span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {articles.map((article) => (
            <PublicPill key={article.slug} tone="neutral" size="sm">
              {article.title}
            </PublicPill>
          ))}
          {overflowCount > 0 && (
            <PublicPill tone="neutral" size="sm">
              +{overflowCount}
            </PublicPill>
          )}
          {hasDiff && (
            <ExpandButton
              isExpanded={isDiffExpanded}
              onToggle={() => {
                setHasOpenedDiff(true);
                setIsDiffExpanded((expanded) => !expanded);
              }}
              variant="faint"
              ariaControls={diffId}
              ariaLabel={isDiffExpanded ? t("Hide change diff") : t("Show change diff")}
            />
          )}
        </div>
      </div>
      {hasDiff && hasOpenedDiff && (
        <div hidden={!isDiffExpanded} className={isDiffExpanded ? "theme-reveal-enter" : undefined}>
          <HistoryDiff entryId={entry.id} id={diffId} wholeEntry />
        </div>
      )}
    </div>
  );
}

type ContributionDayGroup = {
  label: string;
  startIndex: number;
  entries: PublicProfileHistoryEntry[];
};

/** Groups already-sorted entries into contiguous same-day runs. */
function groupContributionsByDay(
  entries: readonly PublicProfileHistoryEntry[],
  dayFormat: Intl.DateTimeFormat,
): ContributionDayGroup[] {
  const groups: ContributionDayGroup[] = [];
  for (const [index, entry] of entries.entries()) {
    const label = dayFormat.format(new Date(entry.createdAt));
    const current = groups[groups.length - 1];
    if (current && current.label === label) {
      current.entries.push(entry);
    } else {
      groups.push({ label, startIndex: index, entries: [entry] });
    }
  }
  return groups;
}

export function UserContributionsSection({
  profileKey,
  history,
}: UserContributionsSectionProps) {
  const [isContributionsExpanded, setIsContributionsExpanded] = useState(false);
  const t = useT();
  const locale = useUiLocale();
  const dayFormat = new Intl.DateTimeFormat(formattingLocale(locale), {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const contributionsSectionId = `${profileKey}-contributions`;

  if (history.length === 0) {
    return null;
  }

  const visibleEntries = isContributionsExpanded
    ? history
    : history.slice(0, COLLAPSED_CONTRIBUTION_ROWS);
  const dayGroups = groupContributionsByDay(visibleEntries, dayFormat);

  return (
    <section className="space-y-5">
      <PublicSectionHeading
        icon="lucide:git-commit-horizontal"
        title={t("Latest contributions")}
        titleElement="h2"
        actions={
          <PublicPill tone="neutral" size="sm">
            {history.length}
          </PublicPill>
        }
      />

      <div id={contributionsSectionId} className="space-y-4">
        {dayGroups.map((group) => (
          <div key={group.label} className="space-y-2">
            <div className={cn("theme-text-faint text-[10.5px] font-semibold uppercase tracking-[0.12em]", group.startIndex >= COLLAPSED_CONTRIBUTION_ROWS && "theme-reveal-enter")}>
              {group.label}
            </div>
            <NestedContentCard radius="xl" padding="none" className="overflow-hidden">
              <div className="divide-y divide-dose-border">
                {group.entries.map((entry, index) => (
                  <div
                    key={entry.id}
                    className={group.startIndex + index >= COLLAPSED_CONTRIBUTION_ROWS ? "theme-reveal-enter" : undefined}
                  >
                    <ContributionRow entry={entry} />
                  </div>
                ))}
              </div>
            </NestedContentCard>
          </div>
        ))}
        {history.length > COLLAPSED_CONTRIBUTION_ROWS && (
          <ExpandButton
            isExpanded={isContributionsExpanded}
            onToggle={() =>
              setIsContributionsExpanded(!isContributionsExpanded)
            }
            variant="count"
            count={history.length - COLLAPSED_CONTRIBUTION_ROWS}
            ariaControls={contributionsSectionId}
            ariaLabel={
              isContributionsExpanded
                ? "Collapse contributions"
                : "Expand contributions"
            }
            className="mx-auto"
          />
        )}
      </div>
    </section>
  );
}
