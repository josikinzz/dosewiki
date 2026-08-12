"use client";

import { useState } from "react";
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

const dateFormat = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
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

function ContributionEntryCard({ entry }: { entry: ChangeLogEntry }) {
  return (
    <NestedContentCard radius="xl" padding="none" className="overflow-hidden">
      <div className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="theme-text-faint flex items-center gap-2 text-xs">
            <Icon icon="lucide:calendar" size={12} />
            <span>{dateFormat.format(new Date(entry.createdAt))}</span>
          </div>
          <div className="theme-text-primary min-w-0 text-sm">
            {entry.commit?.url ? (
              <a
                href={entry.commit.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${entry.commit.message} (opens commit on GitHub in a new tab)`}
                className="group/commit inline-flex items-start gap-1.5 font-medium transition hover:underline hover:underline-offset-2"
              >
                <span className="line-clamp-2">{entry.commit.message}</span>
                <Icon
                  icon="lucide:external-link"
                  size={14}
                  className="theme-text-faint mt-0.5 shrink-0 transition-opacity group-hover/commit:opacity-80"
                />
              </a>
            ) : (
              <span className="line-clamp-2 font-medium">
                {entry.commit.message}
              </span>
            )}
          </div>
        </div>
        <PublicPill tone="neutral" size="sm" className="shrink-0">
          {entry.articles.length} article
          {entry.articles.length === 1 ? "" : "s"}
        </PublicPill>
      </div>

      {entry.markdown.trim().length > 0 && (
        <div className="theme-code-surface overflow-x-auto p-4">
          <pre
            className="font-mono text-xs leading-relaxed"
            aria-label="Diff of changed lines"
          >
            <code>
              {entry.markdown.split("\n").map((line, index) => {
                const isAdded = line.startsWith("+");
                const isRemoved = line.startsWith("-");
                const isHunk = line.startsWith("@@");
                const lineClass = isHunk
                  ? "text-[color:var(--theme-semantic-info-badge-text)]"
                  : isAdded
                    ? "bg-[color:var(--editor-code-line-add-bg)] text-[color:var(--editor-code-line-add-text)]"
                    : isRemoved
                      ? "bg-[color:var(--editor-code-line-remove-bg)] text-[color:var(--editor-code-line-remove-text)]"
                      : "theme-text-muted";

                return (
                  <div
                    key={`${entry.id}-line-${index}`}
                    className={`${lineClass} ${isAdded || isRemoved ? "-mx-2 rounded px-2" : ""}`}
                  >
                    {isAdded ? <span className="sr-only">Added: </span> : null}
                    {isRemoved ? <span className="sr-only">Removed: </span> : null}
                    {line.trim().length > 0 ? line : "\u00A0"}
                  </div>
                );
              })}
            </code>
          </pre>
        </div>
      )}
    </NestedContentCard>
  );
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
        {history
          .slice(0, isContributionsExpanded ? undefined : 3)
          .map((entry) => (
            <ContributionEntryCard key={entry.id} entry={entry} />
          ))}
        {history.length > 3 && (
          <ExpandButton
            isExpanded={isContributionsExpanded}
            onToggle={() =>
              setIsContributionsExpanded(!isContributionsExpanded)
            }
            variant="count"
            count={history.length - 3}
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
