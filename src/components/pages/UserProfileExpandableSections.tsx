"use client";

import { useState } from "react";
import { Icon } from "@/components/common/Icon";
import { SectionCard } from "@/components/common/SectionCard";
import { StateCard } from "@/components/common/StateCard";
import { ReportCard } from "@/features/reports/components/ReportCard";
import type { ChangeLogEntry } from "@/data/changelog/changeLog";
import type { ReportCardModel } from "@/types/tripReport";
import { publicHref } from "@/utils/publicHref";

interface UserTripReportsSectionProps {
  displayName: string;
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
  "inline-flex items-center rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-medium text-white/70 ring-1 ring-inset ring-white/10";

export function UserTripReportsSection({
  displayName,
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

  return (
    <SectionCard delay={0.2}>
      <div className="flex items-center gap-3 mb-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-fuchsia-500/10 text-fuchsia-300 ring-1 ring-inset ring-fuchsia-500/20">
          <Icon icon="lucide:file-signature" size={20} />
        </div>
        <h2 className="text-xl font-bold text-white">Trip Reports</h2>
      </div>

      {hasReports ? (
        <div id={reportsSectionId} className="space-y-4">
          {sortedTripReports.slice(0, isReportsExpanded ? undefined : 3).map((report) => (
            <ReportCard
              key={report.slug}
              report={report}
              href={reportHrefPrefix ? `${reportHrefPrefix}${report.slug}` : publicHref.report(report.slug)}
            />
          ))}
          {sortedTripReports.length > 3 && (
            <button
              type="button"
              onClick={() => setIsReportsExpanded(!isReportsExpanded)}
              aria-expanded={isReportsExpanded}
              aria-controls={reportsSectionId}
              className="mx-auto flex min-h-11 items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3.5 py-2 text-sm text-white/70 transition-colors hover:border-white/25 hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400"
            >
              <span className="font-medium">+{sortedTripReports.length - 3}</span>
              <Icon icon="lucide:chevron-down" size={14} className={`transition-transform ${isReportsExpanded ? "rotate-180" : ""}`} />
            </button>
          )}
        </div>
      ) : (
        <StateCard
          badge="Quiet for now"
          badgeVariant="secondary"
          title="No trip reports yet"
          description={`Trip reports by ${displayName} will appear here once they’re published.`}
          icon="lucide:file-signature"
          tone="neutral"
          compact
        />
      )}
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
        className="group flex w-full items-center justify-between gap-3 rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-fuchsia-500/10 text-fuchsia-300 ring-1 ring-inset ring-fuchsia-500/20 transition group-hover:bg-fuchsia-500/20">
            <Icon icon="lucide:git-commit-horizontal" size={20} />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-xl font-bold text-white group-hover:text-fuchsia-100 transition">Latest contributions</h2>
            <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-medium text-white/70">
              {history.length}
            </span>
          </div>
        </div>
        <Icon
          icon="lucide:chevron-down"
          size={20}
          className={`text-white/40 transition-transform duration-300 group-hover:text-white/60 ${isContributionsExpanded ? "rotate-180" : ""}`}
        />
      </button>

      {isContributionsExpanded && (
        <div id={contributionsSectionId} className="mt-6 space-y-4">
          {history.map((entry) => (
            <div
              key={entry.id}
              className="overflow-hidden rounded-2xl border border-white/10 bg-black/20"
            >
              <div className="flex flex-col gap-3 border-b border-white/5 bg-white/5 p-4 md:flex-row md:items-center md:justify-between">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2 text-xs text-white/50">
                    <Icon icon="lucide:calendar" size={12} />
                    <span>{dateFormat.format(new Date(entry.createdAt))}</span>
                  </div>
                  <div className="text-sm text-white/90">
                    {entry.commit?.url ? (
                      <a
                        href={entry.commit.url}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium hover:text-fuchsia-300 hover:underline hover:decoration-fuchsia-300/30 hover:underline-offset-2 transition"
                      >
                        {entry.commit.message}
                      </a>
                    ) : (
                      <span className="font-medium">{entry.commit.message}</span>
                    )}
                  </div>
                </div>
                <span className={contributionBadgeClass}>
                  {entry.articles.length} article{entry.articles.length === 1 ? "" : "s"}
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
                          ? "text-blue-300"
                          : isAdded
                            ? "text-[color:var(--theme-success-text-strong)] bg-[color:var(--theme-success-bg)]"
                            : isRemoved
                              ? "text-[color:var(--theme-danger-text-strong)] bg-[color:var(--theme-danger-bg)]"
                              : "text-gray-400";

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
