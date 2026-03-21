"use client";

import { useState, type ReactNode } from "react";
import { AppImage } from "@/components/common/AppImage";
import { Icon } from "@/components/common/Icon";
import { StateCard } from "@/components/common/StateCard";

import { SectionCard } from "@/components/common/SectionCard";
import { ReportCard } from "@/features/reports/components/ReportCard";
import type { NormalizedUserProfile } from "@/data/userProfiles";
import type { ChangeLogEntry } from "@/data/changelog/changeLog";
import type { TripReport } from "@/types/tripReport";

interface UserProfilePageProps {
  profile: NormalizedUserProfile;
  history: ChangeLogEntry[];
  tripReports?: TripReport[];
  reportHrefPrefix?: string;
  onSelectReport?: (slug: string) => void;
  bioContent?: ReactNode;
}

const dateFormat = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

const renderAvatar = (profile: NormalizedUserProfile) => {
  if (profile.avatarUrl) {
    return (
      <div className="relative group">
        <div className="absolute inset-0 rounded-full bg-fuchsia-500/20 blur-2xl transition duration-500 group-hover:bg-fuchsia-500/30 group-hover:blur-3xl" />
        <div className="relative h-32 w-32 overflow-hidden rounded-full border-2 border-white/10 shadow-2xl shadow-black/50 ring-1 ring-white/20 transition duration-300 group-hover:border-fuchsia-500/30 group-hover:ring-fuchsia-500/30">
          <AppImage
            src={profile.avatarUrl}
            alt={`${profile.displayName} avatar`}
            width={128}
            height={128}
            className="h-full w-full object-cover transition duration-500 group-hover:scale-110"
            draggable={false}
          />
        </div>
      </div>
    );
  }

  const initials = profile.displayName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((segment) => segment.charAt(0).toUpperCase())
    .join("") || profile.key.slice(0, 2).toUpperCase();

  return (
    <div className="relative group">
      <div className="absolute inset-0 rounded-full bg-fuchsia-500/20 blur-2xl transition duration-500 group-hover:bg-fuchsia-500/30 group-hover:blur-3xl" />
      <div className="relative flex h-32 w-32 items-center justify-center overflow-hidden rounded-full border-2 border-white/10 bg-gradient-to-br from-fuchsia-500/20 via-violet-500/20 to-sky-500/20 text-4xl font-semibold text-fuchsia-100 shadow-2xl shadow-black/50 ring-1 ring-white/20 transition duration-300 group-hover:border-fuchsia-500/30 group-hover:ring-fuchsia-500/30">
        <span className="transition duration-500 group-hover:scale-110">{initials}</span>
      </div>
    </div>
  );
};

const contributionBadgeClass =
  "inline-flex items-center rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-medium text-white/70 ring-1 ring-inset ring-white/10";

export function UserProfilePage({ profile, history, tripReports = [], reportHrefPrefix, onSelectReport, bioContent }: UserProfilePageProps) {
  const [isContributionsExpanded, setIsContributionsExpanded] = useState(false);
  const [isReportsExpanded, setIsReportsExpanded] = useState(false);
  const reportsSectionId = `${profile.key}-reports`;
  const contributionsSectionId = `${profile.key}-contributions`;
  
  const hasLinks = profile.links.length > 0;
  const hasBio = profile.hasCustomBio;
  const hasHistory = history.length > 0;

  // Sort reports with featured first, then by title
  const sortedTripReports = tripReports.slice().sort((a, b) => {
    if (a.featured && !b.featured) return -1;
    if (!a.featured && b.featured) return 1;
    return a.title.localeCompare(b.title);
  });

  const hasReports = sortedTripReports.length > 0;

  const handleReportClick = (slug: string) => {
    if (onSelectReport) {
      onSelectReport(slug);
    } else {
      window.location.assign(`/reports/${slug}`);
    }
  };

  return (
    <main id="main-content" tabIndex={-1} className="theme-page-shell min-h-screen focus:outline-none">
      <div className="mx-auto w-full max-w-4xl px-4 pb-24 pt-12 md:px-8">
        <div className="flex flex-col items-center gap-8 text-center">
          {renderAvatar(profile)}
          
          <div className="flex flex-col items-center gap-6">
            <div>
              <h1 className="font-display break-words text-4xl font-bold tracking-tight text-fuchsia-300 sm:text-5xl">
                {profile.displayName}
              </h1>
              <p className="mt-2 text-lg font-medium text-fuchsia-300/80">
                @{profile.key.toLowerCase()}
              </p>
            </div>

            {hasLinks && (
              <div className="flex flex-wrap justify-center gap-3">
                {profile.links.map((link) => (
                  <a
                    key={link.url}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white/80 transition hover:border-white/20 hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400"
                  >
                    <Icon icon="lucide:link-2" size={14} className="text-fuchsia-300/70 transition group-hover:text-fuchsia-300" />
                    <span>{link.label}</span>
                    <Icon icon="lucide:external-link" size={14} className="text-white/40 transition group-hover:text-white/60" />
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="mt-16 space-y-12">
          {hasBio && (
            <section className="space-y-6">
              <div className="flex flex-wrap items-center gap-4">
                <div className="relative shrink-0">
                  <div className="theme-section-header-glow pointer-events-none absolute -inset-x-4 -inset-y-3 rounded-full blur-xl" />
                  <h2 className="relative flex flex-wrap items-center gap-x-4 gap-y-2 text-2xl font-bold tracking-tight text-fuchsia-300">
                    <Icon icon="lucide:user" className="h-8 w-8" />
                    About
                  </h2>
                </div>
                <div className="h-px flex-1 bg-gradient-to-r from-fuchsia-500/30 via-fuchsia-500/10 to-transparent" />
              </div>

                <div className="relative px-4 py-2">
                {bioContent}
              </div>
            </section>
          )}

          {/* Trip Reports Section */}
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
                    href={reportHrefPrefix ? `${reportHrefPrefix}${report.slug}` : undefined}
                    onClick={reportHrefPrefix ? undefined : () => handleReportClick(report.slug)}
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
                description={`Trip reports by ${profile.displayName} will appear here once they’re published.`}
                icon="lucide:file-signature"
                tone="neutral"
                compact
              />
            )}
          </SectionCard>

          {/* Latest Contributions Section */}
          {hasHistory && (
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
          )}
        </div>
      </div>
    </main>
  );
}
