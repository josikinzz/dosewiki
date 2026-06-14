"use client";

import { useState } from "react";
import { ExpandButton } from "@/components/common/ExpandButton";
import { Icon } from "@/components/common/Icon";
import { SectionCard } from "@/components/common/SectionCard";
import { PublicSectionHeading } from "@/components/layout/PublicPagePrimitives";
import { ReportCard } from "@/features/reports/components/ReportCard";
import type { ChangeLogEntry } from "@/data/changelog/changeLog";
import type { ReportCardModel } from "@/types/tripReport";
import { icons } from "@/utils/iconNames";
import { publicHref } from "@/utils/publicHref";

interface UserTripReportsSectionProps {
  profileKey: string;
  tripReports: ReportCardModel[];
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

const contributionBadgeClass =
  "theme-public-card-subtle inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium";

export function UserTripReportsSection({
  profileKey,
  tripReports,
  reportHrefPrefix,
}: UserTripReportsSectionProps) {
  const [isReportsExpanded, setIsReportsExpanded] = useState(false);
  const reportsSectionId = `${profileKey}-reports`;

  const sortedTripReports = tripReports.slice().sort((a, b) => {
    if (a.featured && !b.featured) return -1;
    if (!a.featured && b.featured) return 1;
    return a.title.localeCompare(b.title);
  });

  const hasReports = sortedTripReports.length > 0;

  if (!hasReports) {
    return null;
  }

  return (
    <SectionCard delay={0.2}>
      <PublicSectionHeading
        variant="card"
        icon={icons.fileSignature}
        title="Trip Reports"
        titleElement="h2"
        titleClassName="theme-text-primary text-xl font-bold"
        className="mb-6"
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
    </SectionCard>
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
    <SectionCard delay={0.3}>
      <button
        type="button"
        onClick={() => setIsContributionsExpanded(!isContributionsExpanded)}
        aria-expanded={isContributionsExpanded}
        aria-controls={contributionsSectionId}
        className="group flex min-h-11 w-full items-center justify-between gap-3 rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400"
      >
        <PublicSectionHeading
          variant="action"
          icon="lucide:git-commit-horizontal"
          title="Latest contributions"
          titleElement="span"
          actions={
            <span className={contributionBadgeClass}>{history.length}</span>
          }
        />
        <Icon
          icon="lucide:chevron-down"
          size={20}
          className={`theme-text-faint transition-transform duration-300 group-hover:opacity-90 ${isContributionsExpanded ? "rotate-180" : ""}`}
        />
      </button>

      {isContributionsExpanded && (
        <div id={contributionsSectionId} className="mt-6 space-y-4">
          {history.map((entry) => (
            <div
              key={entry.id}
              className="theme-public-card-subtle overflow-hidden rounded-2xl border"
            >
              <div className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
                <div className="flex flex-col gap-1">
                  <div className="theme-text-faint flex items-center gap-2 text-xs">
                    <Icon icon="lucide:calendar" size={12} />
                    <span>{dateFormat.format(new Date(entry.createdAt))}</span>
                  </div>
                  <div className="theme-text-primary text-sm">
                    {entry.commit?.url ? (
                      <a
                        href={entry.commit.url}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium transition hover:underline hover:underline-offset-2"
                      >
                        {entry.commit.message}
                      </a>
                    ) : (
                      <span className="font-medium">
                        {entry.commit.message}
                      </span>
                    )}
                  </div>
                </div>
                <span className={contributionBadgeClass}>
                  {entry.articles.length} article
                  {entry.articles.length === 1 ? "" : "s"}
                </span>
              </div>

              {entry.markdown.trim().length > 0 && (
                <div className="theme-code-surface p-4 overflow-x-auto">
                  <pre className="text-xs leading-relaxed font-mono">
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
                            className={`${lineClass} ${isAdded || isRemoved ? "px-2 -mx-2 rounded" : ""}`}
                          >
                            {line.trim().length > 0 ? line : "\u00A0"}
                          </div>
                        );
                      })}
                    </code>
                  </pre>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}
