"use client";

import Link from "next/link";
import type { MouseEvent } from "react";

import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { EditorNotice, EditorStatusPill } from "@/features/dev/components";
import { ArticleLayout } from "@/features/article/components/ArticleLayout";
import {
  ArticleEditProvider,
  type ArticleEditContextValue,
} from "@/features/article/editing";
import type { Reference, SubstanceArticle } from "@/schema";
import { ArticleDraftFormFieldsRHF } from "../../forms/ArticleDraftFormFieldsRHF";
import type { SubstanceEditorTabProps } from "../substance-editor/types";
import { CITATION_PANEL_ID, MOLECULE_PANEL_ID } from "./ReviewBarChrome";
import { ReviewCitationPanel } from "./ReviewCitationPanel";
import { ReviewMoleculePanel } from "./ReviewMoleculePanel";
import type { ReviewQueueEntry } from "./reviewQueue";
import type { ReviewViewMode } from "./reviewSettings";
import type { ReviewDraftHandle } from "./useReviewWrites";

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

/** The slice of the substance editor draft controller the editor view renders. */
interface ReviewEditorDraft extends ReviewDraftHandle {
  validationError: string | null;
  saveError: string | null;
  isSaving: boolean;
  handleFormMutate: () => void;
  handleSaveToDatabase: () => Promise<void>;
}

interface ReviewArticleViewProps
  extends Pick<SubstanceEditorTabProps, "renderCommitPanel"> {
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
  rememberSavedReference: (slug: string, reference: Reference) => void;
  rememberRemovedReference: (slug: string, referenceId: string) => void;
  viewMode: ReviewViewMode;
  articleLinks: boolean;
  blockArticleLinks: (event: MouseEvent) => void;
  articlesRefreshConflict: boolean;
  inlineEdit: boolean;
  /** Admin: inline field edits and source add/remove write production directly, so only an admin arms them. */
  canApprove: boolean;
  articleEditContext: ArticleEditContextValue;
  draft: ReviewEditorDraft;
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
  rememberSavedReference,
  rememberRemovedReference,
  viewMode,
  articleLinks,
  blockArticleLinks,
  articlesRefreshConflict,
  inlineEdit,
  canApprove,
  articleEditContext,
  draft,
  renderCommitPanel,
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

      {/* Fed the overlaid article, so a marker pasted through an inline edit
          moves its reference from "uncited" to numbered without a refresh. */}
      {citationPanelOpen && current && articleForView ? (
        <div className="mx-auto w-full max-w-[1500px] px-4 pt-4 sm:px-6">
          <ReviewCitationPanel
            key={current.slug}
            id={CITATION_PANEL_ID}
            article={articleForView}
            name={current.name}
            // Explicit, not read off the article: the SubstanceArticle contract
            // has no slug, and the panel's add-source write needs an address
            // that survives any future projection of the stored doc.
            slug={current.slug}
            canApprove={canApprove}
            onClose={closeCitationPanel}
            onReferenceSaved={(reference) =>
              rememberSavedReference(current.slug, reference)
            }
            onReferenceRemoved={(referenceId) =>
              rememberRemovedReference(current.slug, referenceId)
            }
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

        {viewMode === "webpage" ? (
          articleForView ? (
            /* Only this branch is edit-enabled: the editor tab already owns a
               full draft of the article, and two live writers over one document
               is how an edit quietly disappears. A null value reaches every
               EditableValue as "no editing surface", so the toggle costs the
               rendered page nothing when it is off. The inline write lands on
               the published article, so a non-admin never gets a surface even
               with the setting persisted on. */
            <ArticleEditProvider value={inlineEdit && canApprove ? articleEditContext : null}>
              <ArticleLayout
                article={articleForView}
                moleculeOverrideUrl={moleculeOverrideUrl}
                warningBannerNotice={BANNERS_HIDDEN_NOTICE}
              />
            </ArticleEditProvider>
          ) : articleHydrating ? (
            /* Per-slug hydration in flight: the bar, queue position, and
               picker stay live; only the article area waits. */
            <div aria-busy="true" data-testid="review-article-loading">
              <EditorNotice
                notice={{
                  tone: "info",
                  message: `Loading ${current?.name ?? "the article"}…`,
                }}
              />
            </div>
          ) : current && !articleFailed ? (
            <EditorNotice
              notice={{
                tone: "warning",
                message: "No article data found for this substance.",
              }}
            />
          ) : null
        ) : (
          <div className="space-y-6">
            {draft.formDirty ? (
              <EditorStatusPill tone="warning" icon="lucide:circle-dot" live>
                Unapplied form edits
              </EditorStatusPill>
            ) : null}
            {draft.validationError ? (
              <EditorNotice
                notice={{
                  tone: "danger",
                  title: "Draft not applied",
                  message: draft.validationError,
                  live: true,
                }}
              />
            ) : null}
            {draft.saveError ? (
              <EditorNotice
                notice={{ tone: "danger", message: draft.saveError, live: true }}
              />
            ) : null}
            {!articleHydrating && draft.formArticleOverride ? (
              <ArticleDraftFormFieldsRHF
                key={current?.slug ?? "review-form"}
                idPrefix="review-form"
                article={draft.formArticleOverride}
                onMutate={draft.handleFormMutate}
                formRef={draft.formRef}
              />
            ) : current && !articleFailed ? (
              <EditorNotice
                notice={{
                  tone: "info",
                  message: "Loading the article into the editor form…",
                }}
              />
            ) : null}
            {renderCommitPanel ? (
              <div>
                {renderCommitPanel(
                  <Button
                    variant="glass"
                    size="pill"
                    className="rounded-full"
                    onClick={() => {
                      void draft.handleSaveToDatabase();
                    }}
                    disabled={draft.isSaving || !draft.formDirty}
                  >
                    Apply to draft
                  </Button>,
                  "Form edits stay in your draft until you commit them. The review tick saves on its own and needs no commit.",
                )}
              </div>
            ) : null}
          </div>
        )}
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
