"use client";

import Link from "next/link";
import type { MouseEvent } from "react";

import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { EditorNotice } from "@/features/dev/components";
import { ArticleLayout } from "@/features/article/components/ArticleLayout";
import ArticleContextBridge from "@/features/article/editing/ArticleContextBridge.editor";
import type { SubstanceArticle } from "@/schema";
import { MOLECULE_PANEL_ID } from "./ReviewBarChrome";
import { ReviewMoleculePanel } from "./ReviewMoleculePanel";
import type { ReviewQueueEntry } from "./reviewQueue";
import type { ReviewViewMode } from "./reviewSettings";
import type { AppRole } from "@/lib/auth/roles";
import type { DraftNavigationGuard } from "@/features/contextual-editing/context";

/**
 * The public layout mounts here without a route loader, so it has no resolved
 * banner list (`ArticleLayoutProps.warningBanners`). Say so where the banners
 * would sit, rather than let the reviewer read their absence as a data error.
 */
const BANNERS_HIDDEN_NOTICE = (
  <EditorNotice
    notice={{
      tone: "neutral",
      icon: "lucide:eye-off",
      message: "Warning banners are hidden in review.",
    }}
  />
);


interface ReviewArticleViewProps {
  allReviewed: boolean;
  total: number;
  showAll: () => void;
  current: ReviewQueueEntry | null;
  /** The working-set article with this session's direct writes overlaid. */
  articleForView: SubstanceArticle | null;
  /** The current article's body is still being fetched; the article area waits inline. */
  articleHydrating: boolean;
  /** The current article's most recent fetch landed nothing; the area offers a retry. */
  articleFailed: boolean;
  retryArticle: () => void;
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

/** Everything under the command bar: the panels, then the article in either view. */
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
  return (
    <>
      {allReviewed ? <FinishedState total={total} showAll={showAll} /> : null}

      {moleculePanelOpen && current ? (
        <div className="mx-auto w-full max-w-[1500px] px-4 pt-4 sm:px-6">
          <ReviewMoleculePanel
            key={current.slug}
            id={MOLECULE_PANEL_ID}
            slug={current.slug}
            name={current.name}
            onClose={closeMoleculePanel}
          />
        </div>
      ) : null}


      {/* `theme-review-article-scope` re-times the article's own sticky and
          anchor offsets against the live bar height — see the rule pair in
          utilities-theme.css. */}
      <div
        className="theme-review-article-scope mx-auto w-full max-w-[1500px] px-4 pb-20 pt-6 sm:px-6"
        onClickCapture={
          viewMode === "webpage" && !articleLinks ? blockArticleLinks : undefined
        }
      >
        {/* Shown in both views: the form has nothing to seed from either, and
            the retry is the only way forward short of navigating away and
            back. The chrome above stays live, so that route stays open too. */}
        {articleFailed && current ? (
          <div className="mb-4" data-testid="review-article-failed">
            <EditorNotice
              notice={{
                tone: "danger",
                title: `Could not load ${current.name}`,
                message:
                  "The article body did not arrive. Retry, or move on and come back to it.",
                live: true,
                actions: (
                  <Button
                    variant="glass"
                    size="pill"
                    className="rounded-full"
                    onClick={retryArticle}
                  >
                    <Icon icon="lucide:refresh-cw" size={16} />
                    Retry
                  </Button>
                ),
              }}
            />
          </div>
        ) : null}

        {/* The working set stops taking live updates while it holds unapplied
            changes, so the page can be rendering — and sending as the write's
            `expected` baseline — a copy the database has already moved past.
            The inline commit guard only sees a dirty *form*, which is a
            different thing, so without this the reviewer meets a conflict with
            no visible cause. Shown in both views: it is a statement about the
            data on screen, not about the editing mode. */}
        {articlesRefreshConflict ? (
          <div className="mb-4">
            <EditorNotice
              notice={{
                tone: "warning",
                title: "Showing an older copy",
                message:
                  "This page is held on the data loaded earlier, because unapplied editor changes are keeping the working set from taking updates. The database has moved on since then, so an inline edit may be refused as stale. Apply and commit the pending editor changes, or reload the page, to catch up.",
              }}
            />
          </div>
        ) : null}

        {articleForView && current ? (
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
        ) : articleHydrating ? (
          <div aria-busy="true" data-testid="review-article-loading">
            <EditorNotice notice={{ tone: "info", message: `Loading ${current?.name ?? "the article"}…` }} />
          </div>
        ) : current && !articleFailed ? (
          <EditorNotice notice={{ tone: "warning", message: "No article data found for this substance." }} />
        ) : null}
      </div>
    </>
  );
}

/**
 * The peak-end moment: article 274 deserves better than a warning notice.
 */
function FinishedState({
  total,
  showAll,
}: {
  total: number;
  showAll: () => void;
}) {
  return (
    <div className="mx-auto max-w-2xl px-4 pt-14 text-center">
      <div className="relative mx-auto mb-6 flex h-20 w-20 items-center justify-center">
        <span
          aria-hidden
          className="theme-review-complete-ping absolute inset-0 rounded-full motion-safe:animate-ping motion-safe:[animation-iteration-count:3]"
        />
        <span className="theme-review-complete-badge relative flex h-20 w-20 items-center justify-center rounded-full border">
          <Icon
            icon="lucide:badge-check"
            size={40}
            className="theme-review-success-text"
          />
        </span>
      </div>
      <h2 className="theme-accent-heading font-display text-3xl font-bold">
        All {total.toLocaleString()} articles reviewed
      </h2>
      <p className="theme-text-secondary mt-3 text-sm">
        The entire launch corpus has been through manual review. That was the
        bottleneck — it isn&rsquo;t anymore.
      </p>
      <div className="mt-6 flex justify-center gap-3">
        <Button variant="glass" size="pill" onClick={showAll}>
          Browse the reviewed queue
        </Button>
        <Button asChild variant="pill" size="pill">
          <Link href="/about/coverage">See the coverage page</Link>
        </Button>
      </div>
    </div>
  );
}
