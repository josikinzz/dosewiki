import { memo, useCallback, useMemo, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";

import { PageHeader } from "../layout/PageHeader";
import { SectionCard } from "../common/SectionCard";
import { Icon } from "../common/Icon";
import { Button } from "@/components/ui/button";
import logoDataUri from "../../assets/dosewiki-logo.svg?inline";
import { useLightweightData } from "../../data/LightweightDataProvider";
import { useLibrary } from "../../data/SubstanceIndexProvider";
import { applyPlaceholders } from "../../data/content/about";
import { getProfileByKey } from "../../data/userProfiles";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { SubstanceArticle } from "../../schema";

const markdownComponents = {
  p: ({ node: _node, ...props }: { node?: unknown }) => (
    <p className="mt-4 text-sm leading-7 text-white/75 first:mt-0 md:text-base" {...props} />
  ),
  strong: ({ node: _node, ...props }: { node?: unknown }) => <strong className="text-fuchsia-200" {...props} />,
  a: ({ node: _node, ...props }: { node?: unknown; children?: ReactNode }) => {
    const { children, ...rest } = props;
    return (
      <a
        className="text-fuchsia-200 transition hover:text-fuchsia-100"
        target="_blank"
        rel="noopener noreferrer"
        {...rest}
      >
        {children}
      </a>
    );
  },
  ul: ({ node: _node, ...props }: { node?: unknown }) => (
    <ul className="mt-4 list-disc space-y-3 pl-5 text-sm text-white/75 marker:text-white/60 md:text-base" {...props} />
  ),
  ol: ({ node: _node, ...props }: { node?: unknown }) => (
    <ol className="mt-4 list-decimal space-y-3 pl-5 text-sm text-white/75 marker:text-white/60 md:text-base" {...props} />
  ),
  li: ({ node: _node, ...props }: { node?: unknown }) => <li {...props} />,
};

/** Canonical field order from substance.schema.ts */
const ARTICLE_FIELD_ORDER = [
  'id', 'title', 'priority', 'index_categories', 'identification', 'classification',
  'summary', 'dosage', 'duration', 'subjective_effects', 'comparisons', 'pharmacology',
  'interactions', 'reagent_testing', 'tolerance', 'harm_potential', 'history_culture',
  'legality', 'source_citations', 'citations'
] as const;

/** Reorder article fields to canonical order for display */
function reorderArticleFields(article: SubstanceArticle): SubstanceArticle {
  const ordered: Record<string, unknown> = {};
  for (const key of ARTICLE_FIELD_ORDER) {
    if (key in article) {
      ordered[key] = article[key as keyof SubstanceArticle];
    }
  }
  for (const key of Object.keys(article)) {
    if (!(key in ordered)) {
      ordered[key] = article[key as keyof SubstanceArticle];
    }
  }
  return ordered as SubstanceArticle;
}

function JsonSyntaxHighlight({ json }: { json: string }) {
  const highlighted = useMemo(() => {
    const escaped = json
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    const tokens: string[] = [];
    let i = 0;
    while (i < escaped.length) {
      if (escaped[i] === '"') {
        let end = i + 1;
        while (end < escaped.length && escaped[end] !== '"') {
          if (escaped[end] === '\\') end++;
          end++;
        }
        end++;
        const str = escaped.slice(i, end);
        let j = end;
        while (j < escaped.length && /\s/.test(escaped[j])) j++;
        const isKey = escaped[j] === ':';
        const cls = isKey ? "text-fuchsia-300" : "text-emerald-400";
        tokens.push(`<span class="${cls}">${str}</span>`);
        i = end;
      } else if (/[-\d]/.test(escaped[i]) && (i === 0 || /[\s,\[:{]/.test(escaped[i - 1]))) {
        let end = i;
        if (escaped[end] === '-') end++;
        while (end < escaped.length && /[\d.]/.test(escaped[end])) end++;
        if (end > i && (i === 0 || escaped[i] !== '-' || end > i + 1)) {
          const num = escaped.slice(i, end);
          if (/^-?\d+\.?\d*$/.test(num)) {
            tokens.push(`<span class="text-sky-400">${num}</span>`);
            i = end;
            continue;
          }
        }
        tokens.push(escaped[i]);
        i++;
      } else if (escaped.slice(i, i + 4) === 'true') {
        tokens.push('<span class="text-amber-400">true</span>');
        i += 4;
      } else if (escaped.slice(i, i + 5) === 'false') {
        tokens.push('<span class="text-amber-400">false</span>');
        i += 5;
      } else if (escaped.slice(i, i + 4) === 'null') {
        tokens.push('<span class="text-rose-400">null</span>');
        i += 4;
      } else {
        tokens.push(escaped[i]);
        i++;
      }
    }
    return tokens.join('');
  }, [json]);

  return (
    <pre
      className="overflow-x-auto text-xs leading-relaxed"
      dangerouslySetInnerHTML={{ __html: highlighted }}
    />
  );
}

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
  // Use lightweight data for substance count
  const { substanceCount, layout } = useLightweightData();
  const { articles } = useLibrary();

  // Get effect count from Convex
  const effects = useQuery(api.subjectiveEffects.getAll);
  const effectCount = effects?.length ?? 233; // Fallback to known count

  // Get About content from Convex (no static fallback)
  const aboutConfig = useQuery(api.siteConfig.getAbout);

  // Download handler for JSON export
  const handleDownload = useCallback(() => {
    const link = document.createElement("a");
    link.href = "/articles.json";
    link.download = "articles.json";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, []);

  // Select 5 random articles for preview
  const previewArticles = useMemo(() => {
    const shuffled = [...articles].sort((a, b) => {
      const hashA = (a.id ?? 0) * 31 + (a.title?.charCodeAt(0) ?? 0);
      const hashB = (b.id ?? 0) * 31 + (b.title?.charCodeAt(0) ?? 0);
      return ((hashA * 17) % 100) - ((hashB * 17) % 100);
    });
    return shuffled.slice(0, 5).map(reorderArticleFields);
  }, [articles]);

  const previewJson = useMemo(() => {
    return JSON.stringify(previewArticles, null, 2);
  }, [previewArticles]);

  // Derive counts from layout (psychoactive classes are the categories)
  const psychoactiveClassCount = layout.categories.length;

  // These counts would need full library - use reasonable defaults
  const chemicalClassCount = 0; // Would need full library
  const mechanismClassCount = 0; // Would need full library

  const placeholderValues = useMemo(
    () => ({
      compoundCount: substanceCount.toLocaleString(),
      categoryCount: psychoactiveClassCount.toLocaleString(),
      effectCount: effectCount.toLocaleString(),
      psychoactiveClassCount: psychoactiveClassCount.toLocaleString(),
      chemicalClassCount: chemicalClassCount.toLocaleString(),
      mechanismClassCount: mechanismClassCount.toLocaleString(),
      mechanismOfActionClassCount: mechanismClassCount.toLocaleString(),
    }),
    [chemicalClassCount, substanceCount, effectCount, mechanismClassCount, psychoactiveClassCount],
  );

  const aboutMarkdown = useMemo(() => {
    const rawMarkdown = aboutConfig?.aboutMarkdown ?? "";
    return applyPlaceholders(rawMarkdown, placeholderValues);
  }, [aboutConfig?.aboutMarkdown, placeholderValues]);

  const aboutSubtitle = useMemo(() => {
    const rawSubtitle = aboutConfig?.aboutSubtitle ?? "";
    const resolved = applyPlaceholders(rawSubtitle, placeholderValues);
    return resolved.length > 0
      ? resolved
      : "Structured psychoactive data for quick reference and research workflows.";
  }, [aboutConfig?.aboutSubtitle, placeholderValues]);

  const founders = useMemo(() => {
    const founderKeys = aboutConfig?.founderProfileKeys ?? [];
    const profiles = founderKeys.map((key) => getProfileByKey(key));
    return profiles.sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [aboutConfig?.founderProfileKeys]);

  const isSafari =
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("is-safari");
  const logoSrc = isSafari ? "/dosewiki-logo.png" : logoDataUri;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-20 pt-12 md:max-w-4xl">
      <img
        src={logoSrc}
        alt="dose.wiki logo"
        className="mx-auto mb-8 h-24 w-24 animate-[spin_30s_linear_infinite] md:h-28 md:w-28"
        draggable={false}
      />
      <PageHeader
        title="About dose.wiki"
        icon="lucide:info"
        description={aboutSubtitle}
      />
      <div className="space-y-6 md:space-y-8">
        <SectionCard className="space-y-2 md:space-y-3">
          <div className="prose prose-invert max-w-none">
            <ReactMarkdown
              components={markdownComponents}
              remarkPlugins={[remarkGfm, remarkBreaks]}
            >
              {aboutMarkdown}
            </ReactMarkdown>
          </div>
        </SectionCard>

        {founders.length > 0 ? (
          <SectionCard className="space-y-6">
            <div className="space-y-2">
              <h2 className="text-xl font-semibold text-fuchsia-200">Founders</h2>
            </div>
            <ul className="grid gap-4 md:grid-cols-2">
              {founders.map((profile) => {
                const contributorHref = `/contributors/${profile.key.toLowerCase()}`;
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

        {/* Download & Data Preview */}
        <SectionCard className="space-y-5">
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-fuchsia-200">Download</h2>
            <p className="text-sm text-white/70">
              All data is public domain under{" "}
              <a
                href="https://creativecommons.org/publicdomain/zero/1.0/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-fuchsia-300 hover:text-fuchsia-200"
              >
                CC0 1.0
              </a>
              .
            </p>
            <div className="flex flex-wrap gap-3">
              <Button onClick={handleDownload} className="gap-2">
                <Icon icon="lucide:download" size={16} />
                articles.json
              </Button>
              <Button variant="secondary" asChild className="gap-2">
                <a
                  href="https://github.com/dose-wiki/dose.wiki"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Icon icon="lucide:github" size={16} />
                  GitHub
                </a>
              </Button>
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-medium text-white/80">Preview (5 random articles)</h3>
            <div className="max-h-[32rem] overflow-auto rounded-lg border border-white/10 bg-[#0a0612] p-4 font-mono">
              <JsonSyntaxHighlight json={previewJson} />
            </div>
          </div>
        </SectionCard>
      </div>
    </div>
  );
});
