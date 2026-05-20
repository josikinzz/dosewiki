"use client";

import { memo, useCallback, useMemo, useState, type ReactNode } from "react";

import { Icon } from "../common/Icon";
import { IconBadge } from "../common/IconBadge";
import { AppImage } from "../common/AppImage";
import { Button } from "@/components/ui/button";
import type { NormalizedUserProfile } from "../../data/userProfiles";
import type { SubstanceArticle } from "../../schema";
import { toInitials } from "@/lib/text";
import { publicHref } from "@/utils/publicHref";

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
      } else if (/[-\d]/.test(escaped[i]) && (i === 0 || /[\s,:[{]/.test(escaped[i - 1]))) {
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
          className="grid grid-cols-[2.5rem_1fr] items-start gap-3"
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

interface AboutPageProps {
  founderProfiles: NormalizedUserProfile[];
  previewArticles: SubstanceArticle[];
  missionContent?: ReactNode;
}

export const AboutPage = memo(function AboutPage({
  founderProfiles,
  previewArticles,
  missionContent,
}: AboutPageProps) {
  const [previewIndex, setPreviewIndex] = useState(() => (previewArticles.length > 0 ? 0 : -1));

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
    if (previewArticles.length === 0) return;
    if (previewArticles.length === 1) {
      setPreviewIndex(0);
      return;
    }

    let next = previewIndex;
    for (let i = 0; i < 6; i++) {
      const candidate = Math.floor(Math.random() * previewArticles.length);
      if (candidate !== previewIndex) {
        next = candidate;
        break;
      }
    }
    setPreviewIndex(next);
  }, [previewArticles.length, previewIndex]);

  const previewArticle = useMemo(() => {
    if (previewIndex < 0 || !previewArticles[previewIndex]) {
      return null;
    }

    return reorderArticleFields(previewArticles[previewIndex]);
  }, [previewArticles, previewIndex]);

  const previewJson = useMemo(() => {
    if (previewArticle === null) return JSON.stringify("No preview available.", null, 2);
    return JSON.stringify(previewArticle, null, 2);
  }, [previewArticle]);

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

  const founders = founderProfiles;

  const logoSrc = "/dosewiki-logo.png";

  return (
    <main id="main-content" tabIndex={-1} className="theme-page-shell min-h-screen focus:outline-none">
      <div className="mx-auto w-full max-w-4xl px-4 pb-24 pt-12 md:px-8">
        <div className="space-y-12">
          
          {/* Hero Section */}
          <div className="mb-10">
            <div className="relative flex flex-col gap-6">
              {/* Decorative background glow */}
              <div className="pointer-events-none absolute -left-12 -top-12 h-64 w-64 rounded-full bg-fuchsia-500/10 blur-[80px]" aria-hidden="true" />
              
              <div className="flex flex-col gap-6">
                {/* Title with icon */}
                <div className="flex flex-wrap items-center gap-6">
                  <AppImage
                    src={logoSrc}
                    alt="dose.wiki logo"
                    width={96}
                    height={96}
                    className="h-24 w-24"
                    draggable={false}
                  />
                  <div>
                    <h1 className="font-display break-words text-[2.5rem] font-bold leading-tight tracking-tight text-fuchsia-300 sm:text-[3.2rem]">
                      About dose.wiki
                    </h1>
                    <p className="mt-2 text-lg text-white/60 font-medium">
                      The open-source encyclopedia of psychoactive substances
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Main Content */}
          <section className="space-y-6">
            <div className="flex flex-wrap items-center gap-4">
              <div className="relative shrink-0">
                <h2 className="relative flex flex-wrap items-center gap-x-4 gap-y-2 text-2xl font-bold tracking-tight text-fuchsia-300">
                  <Icon icon="lucide:book-open" className="h-8 w-8" />
                  Project Mission
                </h2>
              </div>
              <div className="h-px flex-1 bg-gradient-to-r from-fuchsia-500/30 via-fuchsia-500/10 to-transparent" />
            </div>
            
            <div className="relative px-4 py-2">
              {missionContent}
            </div>
          </section>

          {/* Data & Tools */}
          <section className="space-y-6">
            <div className="flex flex-wrap items-center gap-4">
              <div className="relative shrink-0">
                <h2 className="relative flex flex-wrap items-center gap-x-4 gap-y-2 text-2xl font-bold tracking-tight text-fuchsia-300">
                  <Icon icon="lucide:database" className="h-8 w-8" />
                  Open Data & Tools
                </h2>
              </div>
              <div className="h-px flex-1 bg-gradient-to-r from-fuchsia-500/30 via-fuchsia-500/10 to-transparent" />
            </div>

            <div className="grid gap-6 lg:grid-cols-[1fr_1.5fr]">
              <div className="space-y-6 rounded-[32px] border border-white/10 bg-white/[0.02] p-8 shadow-xl shadow-black/20 backdrop-blur-sm">
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-white/90">Download the Database</h3>
                  <p className="text-sm text-white/60 leading-relaxed">
                    All content is licensed under{" "}
                    <a
                      href="https://creativecommons.org/licenses/by-sa/4.0/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-fuchsia-300 hover:text-fuchsia-200 underline decoration-fuchsia-300/30 underline-offset-2"
                    >
                      CC BY-SA 4.0
                    </a>
                    . You are free to share and adapt with attribution.
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

              <div className="theme-about-json-preview flex flex-col overflow-hidden rounded-[32px] border shadow-xl shadow-black/20">
                <div className="theme-about-json-preview-header flex items-center justify-between border-b border-white/5 px-6 py-4 bg-white/[0.02]">
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1.5">
                      <div className="h-2.5 w-2.5 rounded-full bg-rose-500/20 border border-rose-500/50" />
                      <div className="h-2.5 w-2.5 rounded-full bg-amber-500/20 border border-amber-500/50" />
                      <div className="h-2.5 w-2.5 rounded-full bg-emerald-500/20 border border-emerald-500/50" />
                    </div>
                    <span className="ml-2 text-xs font-medium text-white/60">SubstanceIndex.json</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleCopyPreview}
                      className="min-h-11 gap-1.5 rounded-lg px-3 text-sm text-white/60 hover:bg-white/5 hover:text-white"
                    >
                      <Icon icon={hasCopied ? "lucide:check" : "lucide:copy"} size={12} />
                      {hasCopied ? "Copied" : "Copy"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleShuffle}
                      className="min-h-11 gap-1.5 rounded-lg px-3 text-sm text-white/60 hover:bg-white/5 hover:text-white"
                    >
                      <Icon icon="lucide:dices" size={12} />
                      Shuffle
                    </Button>
                  </div>
                </div>
                <div className="theme-about-json-preview-body relative flex-1 min-h-[16rem] overflow-hidden">
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
          </section>

          {/* Founders */}
          <section className="space-y-6">
            <div className="flex flex-wrap items-center gap-4">
              <div className="relative shrink-0">
                <h2 className="relative flex flex-wrap items-center gap-x-4 gap-y-2 text-2xl font-bold tracking-tight text-fuchsia-300">
                  <Icon icon="lucide:users" className="h-8 w-8" />
                  Founders & Contributors
                </h2>
              </div>
              <div className="h-px flex-1 bg-gradient-to-r from-fuchsia-500/30 via-fuchsia-500/10 to-transparent" />
            </div>

            {founders.length > 0 ? (
              <ul className="grid gap-4 sm:grid-cols-2">
                {founders.map((profile) => {
                  const contributorHref = publicHref.contributor(profile.key);
                  const initials = toInitials(profile.displayName || profile.key);

                  return (
                    <li key={profile.key} className="group">
                      <a
                        href={contributorHref}
                        className="relative flex items-center gap-4 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] p-4 transition-[background-color,border-color,box-shadow] hover:bg-white/[0.05] hover:border-fuchsia-500/15 hover:shadow-lg hover:shadow-fuchsia-500/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400"
                      >
                        <div className="absolute -right-4 -top-4 h-16 w-16 rounded-full bg-fuchsia-500/5 blur-lg group-hover:bg-fuchsia-500/10 transition-colors" />
                        
                        <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full border border-white/10 bg-white/5 text-center text-base font-semibold text-white/80 shadow-inner shadow-black/20 ring-1 ring-white/5 group-hover:ring-fuchsia-500/30 transition">
                          {profile.avatarUrl ? (
                            <AppImage
                              src={profile.avatarUrl}
                              alt={`${profile.displayName} avatar`}
                              width={56}
                              height={56}
                              className="h-full w-full object-cover transition duration-500 group-hover:scale-110"
                            />
                          ) : (
                            <span className="flex h-full w-full items-center justify-center text-lg">{initials}</span>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-base font-semibold text-white/90 group-hover:text-white transition">
                            {profile.displayName}
                          </p>
                          <p className="mt-0.5 text-xs font-bold uppercase tracking-[0.15em] text-fuchsia-300/60 group-hover:text-fuchsia-300/80 transition-colors">
                            @{profile.key.toLowerCase()}
                          </p>
                        </div>
                        <Icon icon="lucide:arrow-right" className="h-5 w-5 text-white/30 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-[opacity,translate,color] duration-300" />
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
          </section>
        </div>
      </div>
    </main>
  );
});
