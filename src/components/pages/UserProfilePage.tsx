import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import { ExternalLink, FileText, Link2, Sparkles, UserRound } from "lucide-react";

import { SectionCard } from "../common/SectionCard";
import type { NormalizedUserProfile } from "../../data/userProfiles";
import type { ChangeLogEntry } from "../../data/changeLog";

interface UserProfilePageProps {
  profile: NormalizedUserProfile;
  history: ChangeLogEntry[];
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
        className="h-24 w-24 rounded-3xl border border-white/20 object-cover shadow-[0_20px_60px_-30px_rgba(232,121,249,0.75)]"
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
    <div className="flex h-24 w-24 items-center justify-center rounded-3xl border border-white/10 bg-gradient-to-br from-fuchsia-500/20 via-violet-500/20 to-sky-500/20 text-3xl font-semibold text-fuchsia-100 shadow-[0_20px_60px_-30px_rgba(232,121,249,0.75)]">
      {initials}
    </div>
  );
};

const bioComponents = {
  p: ({ node, ...props }: { node?: unknown }) => (
    <p className="mt-4 text-[0.95rem] leading-7 text-white/85 first:mt-0" {...props} />
  ),
  strong: ({ node, ...props }: { node?: unknown }) => <strong className="text-white" {...props} />,
  a: ({ node, ...props }: { node?: unknown }) => (
    <a
      className="text-fuchsia-200 underline decoration-dotted underline-offset-4 transition hover:text-fuchsia-100"
      target="_blank"
      rel="noopener noreferrer"
      {...props}
    />
  ),
  ul: ({ node, ...props }: { node?: unknown }) => (
    <ul className="mt-4 list-disc space-y-2 pl-5 text-[0.95rem] leading-7 text-white/85" {...props} />
  ),
  ol: ({ node, ...props }: { node?: unknown }) => (
    <ol className="mt-4 list-decimal space-y-2 pl-5 text-[0.95rem] leading-7 text-white/85" {...props} />
  ),
  li: ({ node, ...props }: { node?: unknown }) => (
    <li className="marker:text-fuchsia-300" {...props} />
  ),
};

export function UserProfilePage({ profile, history }: UserProfilePageProps) {
  const hasLinks = profile.links.length > 0;
  const hasBio = profile.hasCustomBio;
  const hasHistory = history.length > 0;

  return (
    <main className="mx-auto w-full max-w-4xl px-4 pb-24 pt-16">
      <div className="flex flex-col items-center gap-6 text-center">
        {renderAvatar(profile)}
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-fuchsia-300 sm:text-4xl">
            {profile.displayName}
          </h1>
          <p className="mt-2 text-sm uppercase tracking-[0.35em] text-white/45">{profile.key}</p>
        </div>
        {!hasBio && (
          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs text-white/65">
            <UserRound className="h-4 w-4" />
            <span>This contributor has not published a bio yet.</span>
          </div>
        )}
      </div>

      <div className="mt-10 space-y-6">
        <SectionCard className="space-y-4 bg-white/[0.04]">
          <div className="flex items-center gap-3">
            <FileText className="h-5 w-5 text-fuchsia-300" />
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-white/45">Bio</p>
              <h2 className="text-lg font-semibold text-fuchsia-200">About {profile.displayName}</h2>
            </div>
          </div>

          {hasBio ? (
            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkBreaks]}
              components={bioComponents}
            >
              {profile.bio}
            </ReactMarkdown>
          ) : (
            <p className="text-sm text-white/70">
              Use the Dev Tools profile editor to add Markdown copy introducing yourself to the community.
            </p>
          )}
        </SectionCard>

        <SectionCard className="space-y-4 bg-white/[0.04]">
          <div className="flex items-center gap-3">
            <Link2 className="h-5 w-5 text-fuchsia-300" />
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-white/45">Links</p>
              <h2 className="text-lg font-semibold text-fuchsia-200">Connected spaces</h2>
            </div>
          </div>

          {hasLinks ? (
            <ul className="grid gap-3 sm:grid-cols-2">
              {profile.links.map((link) => (
                <li key={link.url}>
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-white/85 transition hover:border-fuchsia-400/60 hover:bg-fuchsia-500/10 hover:text-white"
                  >
                    <span>{link.label}</span>
                    <ExternalLink className="h-4 w-4 text-white/60 transition group-hover:text-fuchsia-200" />
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-white/70">
              Share up to three verified resources—personal site, social profiles, or research portfolios.
            </p>
          )}
        </SectionCard>

        <SectionCard className="space-y-5 bg-white/[0.04]">
          <div className="flex items-center gap-3">
            <Sparkles className="h-5 w-5 text-fuchsia-300" />
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-white/45">Recent Activity</p>
              <h2 className="text-lg font-semibold text-fuchsia-200">Latest contributions</h2>
            </div>
          </div>

          {hasHistory ? (
            <div className="space-y-4">
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
                    <span className="rounded-full border border-white/12 px-3 py-1 text-xs text-white/70">
                      {entry.articles.length} article{entry.articles.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  {entry.articles.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {entry.articles.map((article) => (
                        <span
                          key={`${entry.id}-${article.slug}`}
                          className="inline-flex items-center rounded-full border border-white/12 px-3 py-1 text-xs text-white/80"
                        >
                          {article.title}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/15 bg-transparent px-6 py-16 text-center">
              <Sparkles className="mb-4 h-9 w-9 text-white/35" />
              <p className="text-base font-semibold text-white/80">No commits yet</p>
              <p className="mt-2 text-sm text-white/60">Publish a change via Dev Tools to surface activity here.</p>
            </div>
          )}
        </SectionCard>
      </div>
    </main>
  );
}
