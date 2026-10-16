"use client";

import Link from "next/link";
import { useEffect, useRef, type MouseEvent } from "react";

import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { LoadErrorState, Notice } from "@/features/dev/components";
import { ArticleLayout } from "@/features/article/components/ArticleLayout";
import ArticleContextBridge from "@/features/article/editing/ArticleContextBridge.editor";
import type { SubstanceArticle } from "@/schema";
import { MOLECULE_PANEL_ID } from "./ReviewBarChrome";
import { ReviewMoleculePanel } from "./ReviewMoleculePanel";
import type { ReviewQueueEntry } from "./reviewQueue";
import type { ReviewViewMode } from "./reviewSettings";
import type { AppRole } from "@/lib/auth/roles";
import type { DraftNavigationGuard } from "@/features/contextual-editing/context";

const BANNERS_HIDDEN_NOTICE = (
  <Notice
    tone="neutral" icon="lucide:eye-off" message="Warning banners are hidden in review."
  />
);

interface ReviewArticleViewProps {
  allReviewed: boolean;
  total: number;
  showAll: () => void;
  current: ReviewQueueEntry | null;
  articleForView: SubstanceArticle | null;
  articleHydrating: boolean;
  articleFailed: boolean;
  retryArticle: () => void;
  goNext?: () => void;
  onDrawFailedChange?: (failed: boolean) => void;
  moleculeOverrideUrl: string | null;
  moleculePanelOpen: boolean;
  closeMoleculePanel: () => void;
  citationPanelOpen: boolean;
  closeCitationPanel: () => void;
  viewMode: ReviewViewMode;
  articleLinks: boolean;
  blockArticleLinks: (event: MouseEvent) => void;
  articlesRefreshConflict: boolean;
  inlineEdit: boolean;
  workbenchRole: AppRole | null;
  workbenchEmail: string | null;
  onDirtyChange: (dirty: boolean) => void;
  draftGuardRef: React.MutableRefObject<DraftNavigationGuard | null>;
  onOperationLockChange: (locked: boolean) => void;
}

function DrawFailure({ name, slug, reset, onChange, goNext }: { name: string; slug: string; reset: () => void; onChange?: (failed: boolean) => void; goNext?: () => void }) {
  useEffect(() => {
    onChange?.(true);
    return () => onChange?.(false);
  }, [onChange]);
  return (
    <div role="alert" className="mx-auto max-w-3xl py-8">
      <Notice
        tone="danger"
        title={`${name} could not be drawn`}
        message="Something in this article stops the page from rendering, so it cannot be read or marked reviewed here. Fix it in the Substances editor, or move on and come back to it."
        actions={(
          <span className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={reset}>Try again</Button>
            {goNext ? <Button type="button" variant="outline" size="sm" onClick={goNext}>Next article</Button> : null}
            <Button asChild variant="outline" size="sm">
              <a href={`/dev/articles/${slug}`} target="_blank" rel="noreferrer">
                Open in Substances<span className="sr-only"> (opens in a new tab)</span>
              </a>
            </Button>
          </span>
        )}
      />
    </div>
  );
}

function ArticleSkeleton({ name }: { name: string }) {
  return (
    <div aria-busy="true" data-testid="review-article-loading" className="mx-auto max-w-5xl space-y-6 py-4">
      <p className="sr-only">Loading {name}</p>
      <div aria-hidden className="theme-skeleton-pulse h-10 w-1/3 rounded-control" />
      <div className="space-y-2.5">
        <div aria-hidden className="theme-skeleton-pulse h-4 w-full rounded-control" />
        <div aria-hidden className="theme-skeleton-pulse h-4 w-11/12 rounded-control" />
        <div aria-hidden className="theme-skeleton-pulse h-4 w-4/5 rounded-control" />
      </div>
      <div aria-hidden className="theme-skeleton-pulse h-48 w-full rounded-card" />
    </div>
  );
}

export function ReviewArticleView({
  allReviewed,
  total,
  showAll,
  current,
  articleForView,
  moleculeOverrideUrl,
  articleHydrating,
  articleFailed,
  retryArticle,
  goNext,
  onDrawFailedChange,
  moleculePanelOpen,
  closeMoleculePanel,
  citationPanelOpen,
  closeCitationPanel,
  viewMode,
  articleLinks,
  blockArticleLinks,
  articlesRefreshConflict,
  inlineEdit,
  workbenchRole, workbenchEmail, onDirtyChange, draftGuardRef, onOperationLockChange,
}: ReviewArticleViewProps) {
  const moleculeRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!moleculePanelOpen) return;
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    moleculeRef.current?.scrollIntoView?.({ block: "start", behavior: reduce ? "auto" : "smooth" });
  }, [moleculePanelOpen]);

  const drawFallback = ({ reset }: { reset: () => void }) =>
    current ? <DrawFailure name={current.name} slug={current.slug} reset={reset} onChange={onDrawFailedChange} goNext={goNext} /> : null;

  return (
    <>
      {allReviewed ? <FinishedState total={total} showAll={showAll} /> : null}

      {moleculePanelOpen && current ? (
        <div ref={moleculeRef} className="mx-auto w-full max-w-[1500px] scroll-mt-[calc(var(--review-bar-height,3.5rem)+1rem)] px-4 pt-4 sm:px-6">
          <ReviewMoleculePanel
            key={current.slug}
            id={MOLECULE_PANEL_ID}
            slug={current.slug}
            name={current.name}
            onClose={closeMoleculePanel}
          />
        </div>
      ) : null}

      <div
        className="theme-review-article-scope mx-auto w-full max-w-[1500px] px-4 pb-10 pt-6 sm:px-6"
        onClickCapture={
          viewMode === "webpage" && !articleLinks ? blockArticleLinks : undefined
        }
      >
        {articleFailed && current ? (
          <div className="mx-auto mb-4 max-w-3xl" data-testid="review-article-failed">
            <LoadErrorState
              what={current.name}
              message="The article body did not arrive. Try again, or move on and come back to it."
              onRetry={retryArticle}
              secondary={goNext ? <Button type="button" variant="outline" size="sm" onClick={goNext}>Next article</Button> : undefined}
            />
          </div>
        ) : null}

        {articlesRefreshConflict ? (
          <div className="mb-4">
            <Notice
              tone="warning" title="Showing an older copy" message="This page shows the articles as they were loaded earlier, because your uncommitted working changes are holding it. Articles have changed since then, so an inline edit may be refused as out of date. Commit or discard the working changes, or reload the page, to catch up."
            />
          </div>
        ) : null}

        {articleForView && current ? (
          <ErrorBoundary name="review-article" resetKeys={[current.slug, articleForView]} fallback={drawFallback}>
            <ArticleContextBridge
              key={current.slug}
              slug={current.slug}
              article={articleForView}
              workbench={inlineEdit || viewMode !== "webpage" || citationPanelOpen}
              workbenchRole={workbenchRole}
              workbenchEmail={workbenchEmail}
              onDirtyChange={onDirtyChange}
              draftGuardRef={draftGuardRef}
              onOperationLockChange={onOperationLockChange}
              requestedSection={citationPanelOpen ? "references" : null}
              onSectionClose={closeCitationPanel}
              layoutProps={{ moleculeOverrideUrl, warningBannerNotice: BANNERS_HIDDEN_NOTICE }}
            >
              <ArticleLayout article={articleForView} moleculeOverrideUrl={moleculeOverrideUrl} warningBannerNotice={BANNERS_HIDDEN_NOTICE} />
            </ArticleContextBridge>
          </ErrorBoundary>
        ) : articleHydrating && current ? (
          <ArticleSkeleton name={current.name} />
        ) : current && !articleFailed ? (
          <div className="mx-auto max-w-3xl">
            <Notice tone="warning" title={`No article data for ${current.name}`} message="The library lists this substance but holds no article for it. Open it in Substances to check." />
          </div>
        ) : null}
      </div>
    </>
  );
}

function FinishedState({
  total,
  showAll,
}: {
  total: number;
  showAll: () => void;
}) {
  return (
    <section aria-labelledby="review-finished-heading" className="mx-auto max-w-2xl px-4 pt-14 text-center">
      <div className="relative mx-auto mb-6 flex h-20 w-20 items-center justify-center">
        <span
          aria-hidden
          className="theme-review-complete-ping absolute inset-0 rounded-full motion-safe:animate-ping motion-safe:[animation-iteration-count:3]"
        />
        <span className="theme-review-complete-badge relative flex h-20 w-20 items-center justify-center rounded-full border">
          <Icon icon="lucide:badge-check" size={40} className="theme-review-success-text" />
        </span>
      </div>
      <h2 id="review-finished-heading" className="theme-accent-heading font-display text-3xl font-bold text-balance">
        All {total.toLocaleString()} articles reviewed
      </h2>
      <p className="theme-text-secondary mx-auto mt-3 max-w-prose text-sm">
        Every public article has a human sign-off. An article published after
        its sign-off comes back here as Changed since review.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Button variant="outline" onClick={showAll}>
          Browse the reviewed queue
        </Button>
        <Button asChild variant="ghost">
          <Link href="/about/coverage">See the coverage page</Link>
        </Button>
      </div>
    </section>
  );
}
