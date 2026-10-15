"use client";
import { useEffect, useState } from "react";
import { ExpandButton } from "@/components/common/ExpandButton";
import { Icon } from "@/components/common/Icon";
import { LoadErrorState } from "@/features/dev/components";
import { cn } from "@/lib/utils";
import type { TranslationCoveragePage, TranslationCoverageResponse } from "@lib/translation/translationCoverageTypes";
import { count } from "./glossaryModel";
import { RowSkeletons } from "./workbenchParts";

const SHOWN = 12;
const CAP = 5;

export function openWork(page: TranslationCoveragePage): number {
  return page.missing + page.stale + page.rejected + page.glossaryMisses + page.repeatedPunctuation + page.leftoverLatin;
}

export function rankArticles(pages: readonly TranslationCoveragePage[]): TranslationCoveragePage[] {
  return pages.filter((page) => page.kind === "article" && openWork(page) > 0).sort((a, b) => openWork(b) - openWork(a));
}

function breakdown(page: TranslationCoveragePage): string {
  const parts: [number, string, string][] = [
    [page.rejected, "rejected", "rejected"],
    [page.stale, "outdated", "outdated"],
    [page.missing, "not translated", "not translated"],
    [page.glossaryMisses, "glossary disagreement", "glossary disagreements"],
    [page.leftoverLatin, "with English left in", "with English left in"],
    [page.repeatedPunctuation, "doubled punctuation", "doubled punctuation"],
  ];
  return parts.filter(([n]) => n > 0).map(([n, one, many]) => count(n, one, many)).join(" · ");
}

export function ArticlesToReview({ locale, disabled, onOpen }: { locale: string; disabled: boolean; onOpen: (slug: string) => void }) {
  const [pages, setPages] = useState<{ ranked: TranslationCoveragePage[]; checked: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [showAll, setShowAll] = useState(false);
  useEffect(() => {
    let live = true;
    setError(null);
    void (async () => {
      try {
        const response = await fetch(`/api/dev/translation-coverage?locale=${encodeURIComponent(locale)}`);
        const result = await response.json() as Partial<TranslationCoverageResponse> & { error?: string };
        if (!response.ok) throw new Error(result.error ?? "Unable to find articles needing review.");
        const all = Array.isArray(result.pages) ? result.pages : [];
        if (live) setPages({ ranked: rankArticles(all), checked: all.length, total: result.affectedPagesTotal ?? all.length });
      } catch (cause) {
        if (live) setError(cause instanceof Error ? cause.message : "Unable to find articles needing review.");
      }
    })();
    return () => { live = false; };
  }, [locale, attempt]);

  const heading = <h3 id={`articles-to-review-${locale}`} className="type-meta-label theme-text-muted">Articles needing review</h3>;
  if (error) return <div className="space-y-2">{heading}<LoadErrorState what="the articles needing review" message={error} onRetry={() => setAttempt((n) => n + 1)} /></div>;
  if (!pages) return <div className="space-y-2">{heading}<RowSkeletons rows={4} label="articles needing review" /></div>;
  if (pages.ranked.length === 0) {
    return (
      <div className="space-y-2">
        {heading}
        <p className="theme-text-secondary flex items-center gap-2 text-sm"><Icon icon="lucide:check-check" size={16} className="text-[color:var(--theme-success-text)]" />No article has open work in this language. Find one to read it anyway.</p>
      </div>
    );
  }
  const listed = pages.ranked.slice(0, SHOWN);
  const visible = showAll ? listed : listed.slice(0, CAP);
  return <section aria-labelledby={`articles-to-review-${locale}`} className="space-y-2">
    <div className="flex items-baseline justify-between gap-3">
      {heading}
      <span className="theme-text-muted text-xs tabular-nums">{count(pages.ranked.length, "article")}</span>
    </div>
    <ol id={`articles-to-review-list-${locale}`} aria-label="Articles needing review" className="theme-dev-link-list -mx-2.5">
      {visible.map((page, index) => <li key={page.slug}>
        <button
          type="button"
          disabled={disabled}
          aria-label={`${page.slug}, ${openWork(page)} to check`}
          onClick={() => onOpen(page.slug)}
          className={cn("theme-dev-link-row flex w-full min-w-0 items-center gap-3 rounded-control px-2.5 py-2.5 text-left transition-colors disabled:opacity-60", index === 0 && "theme-dev-link-lead")}
        >
          <span className="min-w-0 flex-1 space-y-0.5">
            <span className="theme-text-primary block text-sm font-medium">{page.slug}</span>
            <span className="theme-text-muted block text-xs">{breakdown(page)}</span>
          </span>
          <span className="theme-dev-link-count shrink-0 text-sm font-medium tabular-nums">{openWork(page)}<span className="theme-text-muted text-xs font-normal"> to check</span></span>
          <Icon icon="lucide:chevron-right" size={14} className="theme-dev-link-row-chevron shrink-0" />
        </button>
      </li>)}
    </ol>
    {listed.length > CAP ? (
      <ExpandButton variant="count" isExpanded={showAll} onToggle={() => setShowAll(!showAll)} ariaControls={`articles-to-review-list-${locale}`} label={showAll ? "Show fewer" : "Show all"} count={listed.length - CAP} />
    ) : null}
    {pages.ranked.length > SHOWN ? <p className="theme-text-faint text-xs">Showing the {SHOWN} with the most to check of {count(pages.ranked.length, "article")}.</p> : null}
    {pages.total > pages.checked ? <p className="theme-text-faint text-xs">Ranked from the first {pages.checked} of {count(pages.total, "page")} with open work.</p> : null}
  </section>;
}
