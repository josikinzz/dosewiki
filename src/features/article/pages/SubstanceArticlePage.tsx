/**
 * Public-facing substance article page using the unified ArticleLayout.
 *
 * This component displays a substance article using the Preview* section
 * components for a consistent, modern layout.
 *
 * Supports two modes:
 * 1. Slug-based (new): Fetches article from Convex by slug
 * 2. Article prop (legacy): Uses pre-loaded article directly
 */

import { memo } from "react";
import type { SubstanceArticle } from "@/schema";
import { ArticleLayout } from "../components/ArticleLayout";
import { useSubstanceArticle } from "@/hooks/useSubstanceArticle";

/** Loading fallback for lazy-loaded pages */
function PageLoadingFallback() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-fuchsia-500 border-t-transparent" />
        <p className="text-sm text-white/60">Loading article...</p>
      </div>
    </div>
  );
}

/** Not found message */
function NotFoundMessage({ slug }: { slug: string }) {
  return (
    <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-4xl px-4 pb-20 pt-12 focus:outline-none">
      <div className="rounded-2xl border border-dashed border-white/20 bg-white/5 p-10 text-center shadow-[0_18px_45px_-20px_rgba(0,0,0,0.6)]">
        <p className="text-lg font-semibold text-white">Substance not found</p>
        <p className="mt-2 text-sm text-white/70">
          No article found for "{slug}". Try searching for a different substance.
        </p>
      </div>
    </main>
  );
}

interface SubstanceArticlePageProps {
  /** Slug to fetch article by (new mode) */
  slug?: string;
  /** Pre-loaded article (legacy mode, takes precedence if provided) */
  article?: SubstanceArticle;
  onSelectCategory: (categoryKey: string) => void;
  onSelectEffect: (effect: string) => void;
  onSelectMechanism: (mechanismSlug: string, qualifierSlug?: string) => void;
  onSelectClassification: (type: "psychoactive" | "chemical", label: string) => void;
  onSelectInteraction?: (substance: string) => void;
  onSelectReport?: (slug: string) => void;
}

export const SubstanceArticlePage = memo(function SubstanceArticlePage({
  slug,
  article: providedArticle,
  onSelectCategory,
  onSelectEffect,
  onSelectMechanism,
  onSelectClassification,
  onSelectInteraction,
  onSelectReport,
}: SubstanceArticlePageProps) {
  // Fetch article by slug if not provided directly
  const { article: fetchedArticle, isLoading, notFound } = useSubstanceArticle(
    providedArticle ? null : (slug ?? null)
  );

  // Use provided article or fetched article
  const article = providedArticle ?? fetchedArticle;

  // Handle interaction click - navigate to interactions page with this substance
  const handleInteractionClick = (substance: string) => {
    if (onSelectInteraction) {
      onSelectInteraction(substance);
    }
  };

  // Loading state (only when fetching by slug)
  if (!providedArticle && isLoading) {
    return <PageLoadingFallback />;
  }

  // Not found state
  if (!providedArticle && notFound && slug) {
    return <NotFoundMessage slug={slug} />;
  }

  // No article available
  if (!article) {
    return <NotFoundMessage slug={slug ?? "unknown"} />;
  }

  return (
    <main id="main-content" tabIndex={-1} className="theme-page-shell min-h-screen focus:outline-none">
      <ArticleLayout
        article={article}
        onSelectCategory={onSelectCategory}
        onSelectEffect={onSelectEffect}
        onSelectMechanism={onSelectMechanism}
        onSelectClassification={onSelectClassification}
        onSelectInteraction={handleInteractionClick}
        onSelectReport={onSelectReport}
      />
    </main>
  );
});

export default SubstanceArticlePage;
