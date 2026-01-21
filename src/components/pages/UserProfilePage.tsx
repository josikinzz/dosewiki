import ReactMarkdown from "react-markdown";
import { useState, type ReactNode } from "react";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import { Icon } from "@/components/common/Icon";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";

import { SectionCard } from "@/components/common/SectionCard";
import { ReportCard } from "@/features/reports/components";
import type { NormalizedUserProfile } from "@/data/userProfiles";
import type { ChangeLogEntry } from "@/data/changelog/changeLog";
import type { TripReport } from "@/types/tripReport";

interface UserProfilePageProps {
  profile: NormalizedUserProfile;
  history: ChangeLogEntry[];
  onSelectReport?: (slug: string) => void;
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
      <img
        src={profile.avatarUrl}
        alt={`${profile.displayName} avatar`}
        className="h-32 w-32 rounded-3xl border border-white/20 object-cover shadow-[0_20px_60px_-30px_rgba(232,121,249,0.75)]"
        draggable={false}
      />
    );
  }

  const initials = profile.displayName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((segment) => segment.charAt(0).toUpperCase())
    .join("") || profile.key.slice(0, 2).toUpperCase();

  return (
    <div className="flex h-32 w-32 items-center justify-center rounded-3xl border border-white/10 bg-gradient-to-br from-fuchsia-500/20 via-violet-500/20 to-sky-500/20 text-4xl font-semibold text-fuchsia-100 shadow-[0_20px_60px_-30px_rgba(232,121,249,0.75)]">
      {initials}
    </div>
  );
};

const bioComponents = {
  p: ({ node: _node, ...props }: { node?: unknown }) => (
    <p className="mt-4 text-[0.95rem] leading-7 text-white/85 first:mt-0" {...props} />
  ),
  strong: ({ node: _node, ...props }: { node?: unknown }) => <strong className="text-white" {...props} />,
  a: ({ node: _node, ...props }: { node?: unknown; children?: ReactNode }) => {
    const { children, ...rest } = props;
    return (
      <a
        className="text-fuchsia-200 underline decoration-dotted underline-offset-4 transition hover:text-fuchsia-100"
        target="_blank"
        rel="noopener noreferrer"
        {...rest}
      >
        {children}
      </a>
    );
  },
  ul: ({ node: _node, ...props }: { node?: unknown }) => (
    <ul className="mt-4 list-disc space-y-2 pl-5 text-[0.95rem] leading-7 text-white/85" {...props} />
  ),
  ol: ({ node: _node, ...props }: { node?: unknown }) => (
    <ol className="mt-4 list-decimal space-y-2 pl-5 text-[0.95rem] leading-7 text-white/85" {...props} />
  ),
  li: ({ node: _node, ...props }: { node?: unknown }) => (
    <li className="marker:text-fuchsia-300" {...props} />
  ),
};

const contributionBadgeClass =
  "inline-flex items-center rounded-full bg-white/12 px-3 py-1 text-xs font-medium text-white/80 shadow-sm shadow-fuchsia-500/10 ring-1 ring-white/20";

export function UserProfilePage({ profile, history, onSelectReport }: UserProfilePageProps) {
  const [isContributionsExpanded, setIsContributionsExpanded] = useState(false);
  
  const hasLinks = profile.links.length > 0;
  const hasBio = profile.hasCustomBio;
  const hasHistory = history.length > 0;

  // Query trip reports by this author's display name
  const tripReportsRaw = useQuery(
    api.tripReports.getByAuthor,
    { authorName: profile.displayName }
  ) as TripReport[] | undefined;

  // Sort reports with featured first, then by title
  const tripReports = tripReportsRaw?.slice().sort((a, b) => {
    if (a.featured && !b.featured) return -1;
    if (!a.featured && b.featured) return 1;
    return a.title.localeCompare(b.title);
  });

  const hasReports = tripReports && tripReports.length > 0;

  const handleReportClick = (slug: string) => {
    if (onSelectReport) {
      onSelectReport(slug);
    } else {
      // Fallback to standard navigation
      window.history.pushState({}, "", `/reports/${slug}`);
      window.dispatchEvent(new PopStateEvent("popstate"));
    }
  };

  return (
    <main className="mx-auto w-full max-w-4xl px-4 pb-24 pt-12">
      <div className="flex flex-col items-center gap-6 text-center">
        {renderAvatar(profile)}
        <div className="flex flex-col items-center gap-4">
          <div>
            <h1 className="font-display text-[2.25rem] font-semibold tracking-tight text-fuchsia-300 sm:text-[2.7rem]">
              {profile.displayName}
            </h1>
          </div>
          {hasLinks ? (
            <div className="flex flex-wrap justify-center gap-3">
              {profile.links.map((link) => (
                <a
                  key={link.url}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group inline-flex items-center gap-2 rounded-full bg-gradient-to-tr from-white/12 to-white/6 px-4 py-1.5 text-sm text-white/90 shadow-sm shadow-fuchsia-500/10 ring-1 ring-white/20 transition hover:ring-white/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400"
                >
                  <Icon icon="lucide:link-2" size={16} className="text-fuchsia-200 transition group-hover:text-fuchsia-100" />
                  <span className="font-medium tracking-tight">{link.label}</span>
                  <Icon icon="lucide:external-link" size={16} className="text-white/55 transition group-hover:text-fuchsia-100" />
                </a>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-10 space-y-6">
        {hasBio && (
          <SectionCard className="space-y-4 bg-white/[0.04]">
            <div className="flex items-center gap-3">
              <Icon icon="lucide:file-text" size={20} className="text-fuchsia-300" />
              <h2 className="text-lg font-semibold text-fuchsia-200">Bio</h2>
            </div>

            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkBreaks]}
              components={bioComponents}
            >
              {profile.bio}
            </ReactMarkdown>
          </SectionCard>
        )}

        {/* Trip Reports Section */}
        <SectionCard className="space-y-5 bg-white/[0.04]">
          <div className="flex items-center gap-3">
            <Icon icon="lucide:file-signature" size={20} className="text-fuchsia-300" />
            <h2 className="text-lg font-semibold text-fuchsia-200">Trip Reports</h2>
          </div>

          {hasReports ? (
            <div className="space-y-3">
              {tripReports.map((report) => (
                <ReportCard
                  key={report.slug}
                  report={report}
                  onClick={() => handleReportClick(report.slug)}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/15 bg-transparent px-6 py-16 text-center">
              <Icon icon="lucide:file-signature" size={36} className="mb-4 text-white/35" />
              <p className="text-base font-semibold text-white/80">No trip reports yet</p>
              <p className="mt-2 text-sm text-white/60">
                Trip reports by {profile.displayName} will appear here.
              </p>
            </div>
          )}
        </SectionCard>

        {/* Latest Contributions Section - Only shown if user has contributions */}
        {hasHistory && (
          <SectionCard className="bg-white/[0.04]">
            <button
              type="button"
              onClick={() => setIsContributionsExpanded(!isContributionsExpanded)}
              className="flex w-full items-center justify-between gap-3"
            >
              <div className="flex items-center gap-3">
                <Icon icon="lucide:sparkles" size={20} className="text-fuchsia-300" />
                <h2 className="text-lg font-semibold text-fuchsia-200">Latest contributions</h2>
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/60">
                  {history.length}
                </span>
              </div>
<Icon icon="lucide:chevron-down" size={20}
                className={`text-white/50 transition-transform ${isContributionsExpanded ? "rotate-180" : ""}`}
              />
            </button>

            {isContributionsExpanded && (
              <div className="mt-5 space-y-4">
                {history.map((entry) => (
                  <div
                    key={entry.id}
                    className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4 shadow-inner shadow-black/20"
                  >
                    <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-white/90">{dateFormat.format(new Date(entry.createdAt))}</p>
                        <p className="text-xs text-white/60">
                          {entry.commit?.url ? (
                            <a
                              href={entry.commit.url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-fuchsia-200 transition hover:text-fuchsia-100"
                            >
                              {entry.commit.message}
                            </a>
                          ) : (
                            entry.commit.message
                          )}
                        </p>
                      </div>
                      <span className={contributionBadgeClass}>
                        {entry.articles.length} article{entry.articles.length === 1 ? "" : "s"}
                      </span>
                    </div>
                    {entry.markdown.trim().length > 0 && (
                      <div className="overflow-hidden rounded-xl border border-white/10 bg-black/60">
                        <pre className="max-h-96 overflow-x-auto overflow-y-auto text-xs leading-relaxed">
                          <code>
                            {entry.markdown.split("\n").map((line, index) => {
                              const isAdded = line.startsWith("+");
                              const isRemoved = line.startsWith("-");
                              const isHunk = line.startsWith("@@");
                              const lineClass = isHunk
                                ? "text-rose-200"
                                : isAdded
                                  ? "text-emerald-300"
                                  : isRemoved
                                    ? "text-rose-300"
                                    : "text-white/75";

                              return (
                                <span
                                  key={`${entry.id}-line-${index}`}
                                  className={`block whitespace-pre px-4 py-1 font-mono ${lineClass}`}
                                >
                                  {line.trim().length > 0 ? line : "\u00A0"}
                                </span>
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
    </main>
  );
}
