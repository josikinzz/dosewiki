import { memo, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { Info } from "lucide-react";

import { PageHeader } from "../sections/PageHeader";
import { SectionCard } from "../common/SectionCard";
import logoDataUri from "../../assets/dosewiki-logo.svg?inline";
import {
  dosageCategoryGroups,
  effectSummaries,
  chemicalClassIndexGroups,
  mechanismIndexGroups,
  substanceRecords,
} from "../../data/library";
import { aboutFounderKeys, resolveAboutMarkdown, resolveAboutSubtitle } from "../../data/about";
import { getProfileByKey } from "../../data/userProfiles";

const markdownComponents = {
  p: ({ node, ...props }: { node?: unknown }) => (
    <p className="mt-4 text-sm leading-7 text-white/75 first:mt-0 md:text-base" {...props} />
  ),
  strong: ({ node, ...props }: { node?: unknown }) => <strong className="text-fuchsia-200" {...props} />,
  a: ({ node, ...props }: { node?: unknown }) => (
    <a
      className="text-fuchsia-200 transition hover:text-fuchsia-100"
      target="_blank"
      rel="noopener noreferrer"
      {...props}
    />
  ),
  ul: ({ node, ...props }: { node?: unknown }) => (
    <ul className="mt-4 list-disc space-y-3 pl-5 text-sm text-white/75 marker:text-white/60 md:text-base" {...props} />
  ),
  ol: ({ node, ...props }: { node?: unknown }) => (
    <ol className="mt-4 list-decimal space-y-3 pl-5 text-sm text-white/75 marker:text-white/60 md:text-base" {...props} />
  ),
  li: ({ node, ...props }: { node?: unknown }) => <li {...props} />,
};

const toInitials = (value: string) => {
  const parts = value
    .split(/\s+/)
    .filter((segment) => segment.length > 0)
    .slice(0, 2);

  if (parts.length === 0) {
    return value.slice(0, 2).toUpperCase();
  }

  return parts
    .map((segment) => segment.charAt(0).toUpperCase())
    .join("");
};

export const AboutPage = memo(function AboutPage() {
  const compoundCount = substanceRecords.length;
  const psychoactiveClassCount = dosageCategoryGroups.length;
  const chemicalClassCount = chemicalClassIndexGroups.length;
  const mechanismClassCount = mechanismIndexGroups.length;
  const effectCount = effectSummaries.length;

  const placeholderValues = useMemo(
    () => ({
      compoundCount: compoundCount.toLocaleString(),
      categoryCount: psychoactiveClassCount.toLocaleString(),
      effectCount: effectCount.toLocaleString(),
      psychoactiveClassCount: psychoactiveClassCount.toLocaleString(),
      chemicalClassCount: chemicalClassCount.toLocaleString(),
      mechanismClassCount: mechanismClassCount.toLocaleString(),
      mechanismOfActionClassCount: mechanismClassCount.toLocaleString(),
    }),
    [chemicalClassCount, compoundCount, effectCount, mechanismClassCount, psychoactiveClassCount],
  );

  const aboutMarkdown = useMemo(
    () => resolveAboutMarkdown(placeholderValues),
    [placeholderValues],
  );

  const aboutSubtitle = useMemo(() => {
    const resolved = resolveAboutSubtitle(placeholderValues);
    return resolved.length > 0
      ? resolved
      : "Structured psychoactive data for quick reference and research workflows.";
  }, [placeholderValues]);

  const founders = useMemo(() => {
    const profiles = aboutFounderKeys.map((key) => getProfileByKey(key));
    return profiles.sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, []);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-20 pt-12 md:max-w-4xl">
      <img
        src={logoDataUri}
        alt="dose.wiki logo"
        className="logo mx-auto mb-8 h-24 w-24 animate-[spin_30s_linear_infinite] md:h-28 md:w-28"
        draggable={false}
      />
      <PageHeader
        title="About dose.wiki"
        icon={Info}
        description={aboutSubtitle}
      />
      <div className="space-y-6 md:space-y-8">
        <SectionCard className="space-y-2 md:space-y-3">
          <ReactMarkdown
            className="prose prose-invert max-w-none"
            components={markdownComponents}
            remarkPlugins={[remarkGfm, remarkBreaks]}
          >
            {aboutMarkdown}
          </ReactMarkdown>
        </SectionCard>

        {founders.length > 0 ? (
          <SectionCard className="space-y-6">
            <div className="space-y-2">
              <h2 className="text-xl font-semibold text-fuchsia-200">Founders</h2>
            </div>
            <ul className="grid gap-4 md:grid-cols-2">
              {founders.map((profile) => {
                const contributorHref = `#/contributors/${profile.key}`;
                const initials = toInitials(profile.displayName || profile.key);

                return (
                  <li key={profile.key} className="group">
                    <a
                      href={contributorHref}
                      className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/5 p-4 shadow-sm shadow-black/30 transition hover:border-fuchsia-400/60 hover:bg-fuchsia-500/10 hover:text-white"
                    >
                      <div className="relative h-14 w-14 overflow-hidden rounded-full border border-white/10 bg-white/10 text-center text-base font-semibold text-white/80 shadow-inner shadow-black/20">
                        {profile.avatarUrl ? (
                          <img
                            src={profile.avatarUrl}
                            alt={`${profile.displayName} avatar`}
                            className="h-full w-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <span className="flex h-full w-full items-center justify-center text-lg">{initials}</span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-white/90 group-hover:text-white">
                          {profile.displayName}
                        </p>
                        <p className="mt-1 text-xs font-semibold uppercase tracking-[0.3em] text-white/45 group-hover:text-white/75">
                          @{profile.key.toLowerCase()}
                        </p>
                      </div>
                    </a>
                  </li>
                );
              })}
            </ul>
          </SectionCard>
        ) : (
          <SectionCard className="space-y-3">
            <h2 className="text-xl font-semibold text-fuchsia-200">Founders</h2>
            <p className="text-sm text-white/65">
              Founder profiles have not been published yet. Pin contributors from the Dev Tools About tab to surface them here.
            </p>
          </SectionCard>
        )}
      </div>
    </div>
  );
});
