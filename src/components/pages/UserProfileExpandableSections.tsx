"use client";

import { useState } from "react";
import { ChangelogDiff } from "@/components/changelog/ChangelogDiff";
import { ExpandButton } from "@/components/common/ExpandButton";
import { Icon } from "@/components/common/Icon";
import { PublicPill } from "@/components/common/PublicTokens";
import { NestedContentCard } from "@/components/ui/surface";
import { PublicSectionHeading } from "@/components/layout/PublicPagePrimitives";
import { ReportCard } from "@/features/reports/components/ReportCard";
import { applyCuratedOrder } from "@server/curatedOrder";
import type { ChangeLogEntry } from "@/data/changelog/changeLog";
import type { ReportCardModel } from "@/types/tripReport";
import { icons } from "@/utils/iconNames";
import { publicHref } from "@/utils/publicHref";

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
  history: ChangeLogEntry[];
}

/** How many changelog rows the section shows before the count expander. */
const COLLAPSED_CONTRIBUTION_ROWS = 4;

const dayFormat = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
});

const timeFormat = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
});

export function UserTripReportsSection({
  profileKey,
  tripReports,
  reportOrder,
  reportHrefPrefix,
}: UserTripReportsSectionProps) {
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
        title="Trip Reports"
        titleElement="h2"
      />

      <div id={reportsSectionId} className="space-y-4">
        {sortedTripReports
          .slice(0, isReportsExpanded ? undefined : 3)
          .map((report) => (
            <ReportCard
              key={report.slug}
              report={report}
              href={
                reportHrefPrefix
                  ? `${reportHrefPrefix}${report.slug}`
                  : publicHref.report(report.slug)
              }
            />
          ))}
        {sortedTripReports.length > 3 && (
          <ExpandButton
            isExpanded={isReportsExpanded}
            onToggle={() => setIsReportsExpanded(!isReportsExpanded)}
            variant="count"
            count={sortedTripReports.length - 3}
            ariaControls={reportsSectionId}
            ariaLabel={isReportsExpanded ? "Collapse trip reports" : "Expand trip reports"}
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
function ContributionRow({ entry }: { entry: ChangeLogEntry }) {
  const [isDiffExpanded, setIsDiffExpanded] = useState(false);
  const hasDiff = entry.markdown.trim().length > 0;
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
              aria-label={`${entry.commit.message} (opens commit on GitHub in a new tab)`}
              className="group/commit inline-flex items-start gap-1.5 transition hover:underline hover:underline-offset-2"
            >
              <span className="line-clamp-2">{entry.commit.message}</span>
              <Icon
                icon="lucide:external-link"
                size={13}
                className="theme-text-faint mt-0.5 shrink-0 transition-opacity group-hover/commit:opacity-80"
              />
            </a>
          ) : (
            <span className="line-clamp-2">{entry.commit.message}</span>
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
              onToggle={() => setIsDiffExpanded(!isDiffExpanded)}
              variant="faint"
              ariaControls={diffId}
              ariaLabel={isDiffExpanded ? "Hide change diff" : "Show change diff"}
            />
          )}
        </div>
      </div>
      {hasDiff && isDiffExpanded && (
        <ChangelogDiff markdown={entry.markdown} id={diffId} keyPrefix={entry.id} />
      )}
    </div>
  );
}

type ContributionDayGroup = {
  label: string;
  entries: ChangeLogEntry[];
};

/** Groups already-sorted entries into contiguous same-day runs. */
function groupContributionsByDay(entries: readonly ChangeLogEntry[]): ContributionDayGroup[] {
  const groups: ContributionDayGroup[] = [];
  for (const entry of entries) {
    const label = dayFormat.format(new Date(entry.createdAt));
    const current = groups[groups.length - 1];
    if (current && current.label === label) {
      current.entries.push(entry);
    } else {
      groups.push({ label, entries: [entry] });
    }
  }
  return groups;
}

export function UserContributionsSection({
  profileKey,
  history,
}: UserContributionsSectionProps) {
  const [isContributionsExpanded, setIsContributionsExpanded] = useState(false);
  const contributionsSectionId = `${profileKey}-contributions`;

  if (history.length === 0) {
    return null;
  }

  const visibleEntries = isContributionsExpanded
    ? history
    : history.slice(0, COLLAPSED_CONTRIBUTION_ROWS);
  const dayGroups = groupContributionsByDay(visibleEntries);

  return (
    <section className="space-y-5">
      <PublicSectionHeading
        icon="lucide:git-commit-horizontal"
        title="Latest contributions"
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
            <div className="theme-text-faint text-[10.5px] font-semibold uppercase tracking-[0.12em]">
              {group.label}
            </div>
            <NestedContentCard radius="xl" padding="none" className="overflow-hidden">
              <div className="divide-y divide-dose-border">
                {group.entries.map((entry) => (
                  <ContributionRow key={entry.id} entry={entry} />
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
