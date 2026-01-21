import { memo, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { motion } from "framer-motion";

import { SectionCard } from "../common/SectionCard";
import { Icon } from "../common/Icon";
import { IconBadge } from "../common/IconBadge";
import { Button } from "@/components/ui/button";
import logoDataUri from "../../assets/dosewiki-logo.svg?inline";
import { useLightweightData } from "../../data/LightweightDataProvider";
import { applyPlaceholders } from "../../data/content/about";
import { getProfileByKey } from "../../data/userProfiles";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { SubstanceArticle } from "../../schema";
import { cardAnimation } from "../../constants/motion";

const markdownComponents = {
  p: ({ node: _node, ...props }: { node?: unknown }) => (
    <p className="mt-4 text-[1.0625rem] leading-7 text-white/80 first:mt-0" {...props} />
  ),
  strong: ({ node: _node, ...props }: { node?: unknown }) => <strong className="font-semibold text-fuchsia-200" {...props} />,
  a: ({ node: _node, ...props }: { node?: unknown; children?: ReactNode }) => {
    const { children, ...rest } = props;
    return (
      <a
        className="font-medium text-fuchsia-300 transition hover:text-fuchsia-200 hover:underline hover:decoration-fuchsia-300/30 hover:underline-offset-2"
        target="_blank"
        rel="noopener noreferrer"
        {...rest}
      >
        {children}
      </a>
    );
  },
  ul: ({ node: _node, ...props }: { node?: unknown }) => (
    <ul className="mt-4 list-disc space-y-2 pl-6 text-[1.0625rem] text-white/80 marker:text-fuchsia-400/50" {...props} />
  ),
  ol: ({ node: _node, ...props }: { node?: unknown }) => (
    <ol className="mt-4 list-decimal space-y-2 pl-6 text-[1.0625rem] text-white/80 marker:text-fuchsia-400/50" {...props} />
  ),
  li: ({ node: _node, ...props }: { node?: unknown }) => <li className="pl-1" {...props} />,
  h1: ({ node: _node, ...props }: { node?: unknown }) => <h1 className="mt-8 mb-4 text-2xl font-bold text-white" {...props} />,
  h2: ({ node: _node, ...props }: { node?: unknown }) => <h2 className="mt-8 mb-4 text-xl font-bold text-white" {...props} />,
  h3: ({ node: _node, ...props }: { node?: unknown }) => <h3 className="mt-6 mb-3 text-lg font-bold text-white" {...props} />,
  blockquote: ({ node: _node, ...props }: { node?: unknown }) => (
    <blockquote className="mt-6 border-l-4 border-fuchsia-500/30 pl-4 italic text-white/70" {...props} />
  ),
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
  const highlightedLines = useMemo(() => {
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
    return tokens.join("").split("\n");
  }, [json]);

  return (
    <div className="font-mono text-xs leading-relaxed text-white/55">
      {highlightedLines.map((line, idx) => (
        <div
          key={idx}
          className="grid grid-cols-[2.5rem,1fr] items-start gap-3"
        >
          <span className="select-none pr-2 text-right tabular-nums text-white/20">
            {idx + 1}
          </span>
          <span
            className="min-w-0 whitespace-pre-wrap break-words"
            // Preserve empty lines so the line-number gutter stays consistent.
            dangerouslySetInnerHTML={{ __html: line.length ? line : "&nbsp;" }}
          />
        </div>
      ))}
    </div>
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
  const { substanceCount, layout, substances } = useLightweightData();

  // Get effect count from Convex
  const effects = useQuery(api.subjectiveEffects.getAll);
  const effectCount = effects?.length ?? 233; // Fallback to known count

  // Get About content from Convex (no static fallback)
  const aboutConfig = useQuery(api.siteConfig.getAbout);

  const eligiblePreviewSubstances = useMemo(() => {
    return substances.filter((s) => s.priority !== "low");
  }, [substances]);

  // Random slug selection for the preview (chosen from the precomputed non-low list).
  const [previewSlug, setPreviewSlug] = useState<string | null>(null);

  // Initialize preview slug once the lightweight list is available.
  useEffect(() => {
    if (previewSlug) return;
    if (eligiblePreviewSubstances.length === 0) return;
    const pick = eligiblePreviewSubstances[Math.floor(Math.random() * eligiblePreviewSubstances.length)];
    setPreviewSlug(pick?.slug ?? null);
  }, [eligiblePreviewSubstances, previewSlug]);

  const previewDoc = useQuery(
    api.substanceIndex.getBySlug,
    previewSlug ? { slug: previewSlug } : "skip",
  ) as (SubstanceArticle & { _id?: unknown; _creationTime?: number }) | null | undefined;

  // Download handler for JSON export
  const handleDownload = useCallback(() => {
    const link = document.createElement("a");
    link.href = "/SubstanceIndex.json";
    link.download = "SubstanceIndex.json";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, []);

  // Handler to re-randomize articles
  const handleShuffle = useCallback(() => {
    if (eligiblePreviewSubstances.length === 0) return;
    if (eligiblePreviewSubstances.length === 1) {
      setPreviewSlug(eligiblePreviewSubstances[0]?.slug ?? null);
      return;
    }

    let next: string | null = null;
    // Try a few times to avoid picking the same slug.
    for (let i = 0; i < 6; i++) {
      const pick = eligiblePreviewSubstances[Math.floor(Math.random() * eligiblePreviewSubstances.length)];
      const slug = pick?.slug ?? null;
      if (slug && slug !== previewSlug) {
        next = slug;
        break;
      }
    }
    setPreviewSlug(next ?? eligiblePreviewSubstances[0]?.slug ?? null);
  }, [eligiblePreviewSubstances, previewSlug]);

  const previewArticle = useMemo(() => {
    if (previewDoc === undefined) return undefined; // loading
    if (previewDoc === null) return null; // not found
    if (!previewDoc) return null;
    const { _id: _ignoredId, _creationTime: _ignoredCreationTime, ...article } = previewDoc as unknown as Record<
      string,
      unknown
    >;
    return reorderArticleFields(article as SubstanceArticle);
  }, [previewDoc]);

  const previewJson = useMemo(() => {
    if (previewArticle === undefined) return JSON.stringify("Loading…", null, 2);
    if (previewArticle === null) return JSON.stringify("No preview available.", null, 2);
    return JSON.stringify(previewArticle, null, 2);
  }, [previewArticle]);

  // Debug logs for the JSON preview pipeline (dev only).
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    console.debug("[AboutPage] JSON preview eligibility:", {
      total: substances.length,
      eligibleNonLow: eligiblePreviewSubstances.length,
      previewSlug,
    });
  }, [eligiblePreviewSubstances.length, previewSlug, substances.length]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    console.debug("[AboutPage] JSON preview doc:", {
      status: previewDoc === undefined ? "loading" : previewDoc === null ? "not_found" : "loaded",
      slug: previewSlug,
      priority: (previewDoc as { priority?: string } | null | undefined)?.priority,
    });
  }, [previewDoc, previewSlug]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    console.debug("[AboutPage] JSON preview render:", {
      hasArticle: previewArticle !== null && previewArticle !== undefined,
      previewJsonLength: previewJson.length,
      previewJsonStartsWith: previewJson.slice(0, 24),
    });
  }, [previewArticle, previewJson]);

  const [hasCopied, setHasCopied] = useState(false);
  const handleCopyPreview = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(previewJson);
      setHasCopied(true);
      window.setTimeout(() => setHasCopied(false), 1400);
    } catch {
      // Fallback for older browsers / insecure contexts
      const textarea = document.createElement("textarea");
      textarea.value = previewJson;
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      textarea.style.top = "0";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      try {
        document.execCommand("copy");
        setHasCopied(true);
        window.setTimeout(() => setHasCopied(false), 1400);
      } finally {
        document.body.removeChild(textarea);
      }
    }
  }, [previewJson]);

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
    <main className="min-h-screen bg-gradient-to-b from-[#0b0818] via-[#130e2b] to-[#0f0a1f]">
      <div className="mx-auto w-full max-w-4xl px-4 pb-24 pt-12 md:px-8">
        <div className="space-y-12">
          
          {/* Hero Section */}
          <motion.div 
            className="mb-10"
            {...cardAnimation}
          >
            <div className="relative flex flex-col gap-6">
              {/* Decorative background glow */}
              <div className="pointer-events-none absolute -left-12 -top-12 h-64 w-64 rounded-full bg-fuchsia-500/10 blur-[80px]" aria-hidden="true" />
              
              <div className="flex flex-col gap-6">
                {/* Title with icon */}
                <div className="flex items-center gap-6">
                  <img
                    src={logoSrc}
                    alt="dose.wiki logo"
                    className="h-24 w-24 animate-[spin_30s_linear_infinite]"
                    draggable={false}
                  />
                  <div>
                    <h1 className="font-display text-[2.5rem] font-bold tracking-tight text-fuchsia-300 sm:text-[3.2rem] leading-none">
                      About dose.wiki
                    </h1>
                    <p className="mt-2 text-lg text-white/60 font-medium">
                      The open-source encyclopedia of psychoactive substances
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Main Content */}
          <motion.section
            {...cardAnimation}
            transition={{ ...cardAnimation.transition, delay: 0.1 }}
            className="space-y-6"
          >
            <div className="flex items-center gap-4">
              <div className="relative shrink-0">
                <div className="absolute inset-0 bg-fuchsia-500/20 blur-xl rounded-full" />
                <h2 className="relative flex items-center gap-4 text-2xl font-bold tracking-tight text-fuchsia-300 whitespace-nowrap">
                  <Icon icon="lucide:book-open" className="h-8 w-8" />
                  Project Mission
                </h2>
              </div>
              <div className="h-px flex-1 bg-gradient-to-r from-fuchsia-500/30 via-fuchsia-500/10 to-transparent" />
            </div>
            
            <div className="relative px-4 py-2">
              <div className="prose prose-invert prose-fuchsia max-w-none">
                <ReactMarkdown
                  components={{
                    ...markdownComponents,
                    p: ({ node, children, ...props }) => {
                      // Check if this is the first paragraph
                      const isFirst = node?.position?.start.line === 1 || (node?.position?.start.offset === 0);
                      
                      if (isFirst && typeof children === 'string') {
                        const [firstWord, ...rest] = children.split(' ');
                        return (
                          <p className="mt-4 text-[1.125rem] leading-8 text-white/90 first:mt-0" {...props}>
                            <span className="font-bold text-fuchsia-300">{firstWord}</span> {rest.join(' ')}
                          </p>
                        );
                      }
                      
                      // For other paragraphs or complex children, use default styling
                      return (
                        <p className="mt-4 text-[1.0625rem] leading-7 text-white/80 first:mt-0" {...props}>
                          {children}
                        </p>
                      );
                    }
                  }}
                  remarkPlugins={[remarkGfm, remarkBreaks]}
                >
                  {aboutMarkdown}
                </ReactMarkdown>
              </div>
            </div>
          </motion.section>

          {/* Data & Tools */}
          <motion.section
            {...cardAnimation}
            transition={{ ...cardAnimation.transition, delay: 0.2 }}
            className="space-y-6"
          >
            <div className="flex items-center gap-4">
              <div className="relative shrink-0">
                <div className="absolute inset-0 bg-fuchsia-500/20 blur-xl rounded-full" />
                <h2 className="relative flex items-center gap-4 text-2xl font-bold tracking-tight text-fuchsia-300 whitespace-nowrap">
                  <Icon icon="lucide:database" className="h-8 w-8" />
                  Open Data & Tools
                </h2>
              </div>
              <div className="h-px flex-1 bg-gradient-to-r from-fuchsia-500/30 via-fuchsia-500/10 to-transparent" />
            </div>

            <div className="grid gap-6 lg:grid-cols-[1fr,1.5fr]">
              <div className="space-y-6 rounded-[32px] border border-white/10 bg-white/[0.02] p-8 shadow-xl shadow-black/20 backdrop-blur-sm">
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-white/90">Download the Database</h3>
                  <p className="text-sm text-white/60 leading-relaxed">
                    All data is public domain under{" "}
                    <a
                      href="https://creativecommons.org/publicdomain/zero/1.0/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-fuchsia-300 hover:text-fuchsia-200 underline decoration-fuchsia-300/30 underline-offset-2"
                    >
                      CC0 1.0
                    </a>
                    . You are free to use, modify, and distribute it without restriction.
                  </p>
                  <div className="flex flex-col gap-3 pt-2">
                    <Button onClick={handleDownload} className="w-full justify-start gap-3 h-12 rounded-xl bg-white/10 hover:bg-white/20 text-white border border-white/5">
                      <IconBadge icon="lucide:download" className="bg-fuchsia-500/20 text-fuchsia-200" />
                      <div className="flex flex-col items-start text-xs">
                        <span className="font-semibold text-sm">SubstanceIndex.json</span>
                        <span className="text-white/50">Full database export</span>
                      </div>
                    </Button>
                    <Button variant="ghost" asChild className="w-full justify-start gap-3 h-12 rounded-xl hover:bg-white/5 text-white/80 hover:text-white border border-transparent hover:border-white/10">
                      <a
                        href="https://github.com/dose-wiki/dose.wiki"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <IconBadge icon="lucide:github" className="bg-white/10 text-white/80" />
                        <div className="flex flex-col items-start text-xs">
                          <span className="font-semibold text-sm">GitHub Repository</span>
                          <span className="text-white/50">Source code & contribution</span>
                        </div>
                      </a>
                    </Button>
                  </div>
                </div>
              </div>

              <div className="flex flex-col overflow-hidden rounded-[32px] border border-white/10 bg-[#0a0612] shadow-xl shadow-black/20">
                <div className="flex items-center justify-between border-b border-white/5 px-6 py-4 bg-white/[0.02]">
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1.5">
                      <div className="h-2.5 w-2.5 rounded-full bg-rose-500/20 border border-rose-500/50" />
                      <div className="h-2.5 w-2.5 rounded-full bg-amber-500/20 border border-amber-500/50" />
                      <div className="h-2.5 w-2.5 rounded-full bg-emerald-500/20 border border-emerald-500/50" />
                    </div>
                    <span className="ml-2 text-xs font-medium text-white/40">SubstanceIndex.json</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleCopyPreview}
                      className="h-7 gap-1.5 rounded-lg px-2 text-xs text-white/40 hover:bg-white/5 hover:text-white"
                    >
                      <Icon icon={hasCopied ? "lucide:check" : "lucide:copy"} size={12} />
                      {hasCopied ? "Copied" : "Copy"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleShuffle}
                      className="h-7 gap-1.5 rounded-lg px-2 text-xs text-white/40 hover:bg-white/5 hover:text-white"
                    >
                      <Icon icon="lucide:dices" size={12} />
                      Shuffle
                    </Button>
                  </div>
                </div>
                <div className="relative flex-1 min-h-[16rem] overflow-hidden bg-[#06020c]">
                  {/* Subtle \"hacker terminal\" texture */}
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 opacity-[0.65]"
                    style={{
                      backgroundImage:
                        "radial-gradient(900px 420px at 10% -10%, rgba(217,70,239,0.16), transparent 55%), radial-gradient(700px 340px at 90% 0%, rgba(16,185,129,0.10), transparent 55%), linear-gradient(to bottom, rgba(255,255,255,0.03), transparent 18%, transparent 82%, rgba(255,255,255,0.03))",
                    }}
                  />
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0"
                    style={{
                      backgroundImage:
                        "repeating-linear-gradient(to bottom, rgba(255,255,255,0.045) 0px, rgba(255,255,255,0.045) 1px, transparent 1px, transparent 6px)",
                      opacity: 0.07,
                      mixBlendMode: "overlay",
                    }}
                  />

                  <div className="absolute inset-0 overflow-auto py-6 pr-6 pl-3 custom-scrollbar">
                    <JsonSyntaxHighlight json={previewJson} />
                  </div>
                </div>
              </div>
            </div>
          </motion.section>

          {/* Founders */}
          <motion.section
            {...cardAnimation}
            transition={{ ...cardAnimation.transition, delay: 0.3 }}
            className="space-y-6"
          >
            <div className="flex items-center gap-4">
              <div className="relative shrink-0">
                <div className="absolute inset-0 bg-fuchsia-500/20 blur-xl rounded-full" />
                <h2 className="relative flex items-center gap-4 text-2xl font-bold tracking-tight text-fuchsia-300 whitespace-nowrap">
                  <Icon icon="lucide:users" className="h-8 w-8" />
                  Founders & Contributors
                </h2>
              </div>
              <div className="h-px flex-1 bg-gradient-to-r from-fuchsia-500/30 via-fuchsia-500/10 to-transparent" />
            </div>

            {founders.length > 0 ? (
              <ul className="grid gap-4 sm:grid-cols-2">
                {founders.map((profile) => {
                  const contributorHref = `/contributors/${profile.key.toLowerCase()}`;
                  const initials = toInitials(profile.displayName || profile.key);

                  return (
                    <li key={profile.key} className="group">
                      <a
                        href={contributorHref}
                        className="relative flex items-center gap-4 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] p-4 transition-all hover:bg-white/[0.05] hover:border-fuchsia-500/20 hover:shadow-lg hover:shadow-fuchsia-500/5"
                      >
                        <div className="absolute -right-4 -top-4 h-16 w-16 rounded-full bg-fuchsia-500/5 blur-xl group-hover:bg-fuchsia-500/10 transition" />
                        
                        <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full border border-white/10 bg-white/5 text-center text-base font-semibold text-white/80 shadow-inner shadow-black/20 ring-1 ring-white/5 group-hover:ring-fuchsia-500/30 transition">
                          {profile.avatarUrl ? (
                            <img
                              src={profile.avatarUrl}
                              alt={`${profile.displayName} avatar`}
                              className="h-full w-full object-cover transition duration-500 group-hover:scale-110"
                              loading="lazy"
                            />
                          ) : (
                            <span className="flex h-full w-full items-center justify-center text-lg">{initials}</span>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-base font-semibold text-white/90 group-hover:text-white transition">
                            {profile.displayName}
                          </p>
                          <p className="mt-0.5 text-[11px] font-bold uppercase tracking-[0.15em] text-fuchsia-300/50 group-hover:text-fuchsia-300/80 transition">
                            @{profile.key.toLowerCase()}
                          </p>
                        </div>
                        <Icon icon="lucide:arrow-right" className="h-5 w-5 text-white/20 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300" />
                      </a>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-8 text-center">
                <p className="text-sm text-white/60">
                  Founder profiles have not been published yet. Pin contributors from the Dev Tools About tab to surface them here.
                </p>
              </div>
            )}
          </motion.section>
        </div>
      </div>
    </main>
  );
});
