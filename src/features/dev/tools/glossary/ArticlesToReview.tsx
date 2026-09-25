"use client";
/**
 * Where the Articles view starts: the substance articles with the most for a
 * person to check in this language, most first. Counts come from the
 * translator-readable coverage audit (missing, outdated and rejected
 * paragraphs, glossary disagreements, doubled punctuation, English left in),
 * read once when the view opens; it is never polled.
 */
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { StateCard } from "@/components/common/StateCard";
import type { TranslationCoveragePage, TranslationCoverageResponse } from "@lib/translation/translationCoverageTypes";
import { count } from "./glossaryModel";

const SHOWN = 12;

/** How much a page holds for a person to check, across every finding the audit counts. */
export function openWork(page: TranslationCoveragePage): number {
  return page.missing + page.stale + page.rejected + page.glossaryMisses + page.repeatedPunctuation + page.leftoverLatin;
}

/** Substance articles with open work, most first; ties keep the audit's order. */
export function rankArticles(pages: readonly TranslationCoveragePage[]): TranslationCoveragePage[] {
  return pages.filter((page) => page.kind === "article" && openWork(page) > 0).sort((a, b) => openWork(b) - openWork(a));
}

function breakdown(page: TranslationCoveragePage): string {
  const parts: [number, string][] = [
    [page.rejected, "rejected"],
    [page.stale, "outdated"],
    [page.missing, "not translated"],
    [page.glossaryMisses, "glossary disagreements"],
    [page.leftoverLatin, "English left in"],
    [page.repeatedPunctuation, "doubled punctuation"],
  ];
  return parts.filter(([n]) => n > 0).map(([n, label]) => `${n} ${label}`).join(" · ");
}

export function ArticlesToReview({ locale, disabled, onOpen }: { locale: string; disabled: boolean; onOpen: (slug: string) => void }) {
  const [pages, setPages] = useState<{ ranked: TranslationCoveragePage[]; checked: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
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

  if (error) return <StateCard compact tone="danger" title="Articles needing review could not be listed" description={error} actions={<Button size="sm" variant="outline" onClick={() => setAttempt((n) => n + 1)}>Retry</Button>} />;
  if (!pages) return <StateCard compact loading title="Finding articles needing review" />;
  if (pages.ranked.length === 0) return <p className="theme-text-secondary text-sm">No article has open work in this language. Find one below to read it anyway.</p>;
  return <section aria-labelledby={`articles-to-review-${locale}`} className="space-y-2">
    <h3 id={`articles-to-review-${locale}`} className="theme-text-primary font-medium">Articles needing review</h3>
    <ol aria-label="Articles needing review" className="space-y-1">
      {pages.ranked.slice(0, SHOWN).map((page) => <li key={page.slug} className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5">
        <Button type="button" size="sm" variant="quiet" disabled={disabled} onClick={() => onOpen(page.slug)}>{page.slug}</Button>
        <span className="theme-text-secondary text-sm tabular-nums">{openWork(page)} to check</span>
        <span className="theme-text-faint text-xs">{breakdown(page)}</span>
      </li>)}
    </ol>
    {pages.ranked.length > SHOWN ? <p className="theme-text-faint text-xs">Showing the {SHOWN} with the most to check of {count(pages.ranked.length, "article")}.</p> : null}
    {pages.total > pages.checked ? <p className="theme-text-faint text-xs">Ranked from the first {pages.checked} of {count(pages.total, "page")} with open work.</p> : null}
  </section>;
}
