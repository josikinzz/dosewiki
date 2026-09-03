"use client";

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "convex/react";

import { api } from "../../../../../convex/_generated/api";

import { Icon } from "@/components/common/Icon";
import { useLightweightData } from "@/data/LightweightDataProvider";
import { moleculeOverrideImageUrl } from "@/data/mappings/moleculeOverrideUrl";
import { EditorNotice } from "@/features/dev/components";
import type { SubstanceArticle } from "@/schema";
import { useDevMode } from "../../context/DevModeContext";
import { useSubstanceEditorDraftController } from "../substance-editor/useSubstanceEditorDraftController";
import type { SubstanceEditorTabProps } from "../substance-editor/types";
import { applyReviewArticleOverlay } from "./reviewArticleOverlay";
import { ReviewArticleView } from "./ReviewArticleView";
import { Kbd, ReviewToast } from "./ReviewBarChrome";
import { ReviewClassCelebration } from "./ReviewClassCelebration";
import { ReviewCommandBar } from "./ReviewCommandBar";
import { resolveOverriddenEditorialReview } from "./reviewQueue";
import { STATUS_DOT } from "./ReviewSubstancePicker";
import { useReviewQueue } from "./useReviewQueue";
import { useReviewNavigation, useReviewSettings } from "./useReviewSettings";
import {
  useReviewFieldWrites,
  useReviewOverlays,
  useReviewStatusWrites,
} from "./useReviewWrites";

/** True when a key event originates inside a form control the user is typing in. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  );
}

type ReviewExperienceProps = Pick<SubstanceEditorTabProps, "renderCommitPanel"> & {
  initialSlug?: string;
};

/**
 * The full-bleed review workbench (`/review/[slug]`).
 *
 * One sticky command bar over one article. The tick persists through
 * `/api/dev/editorial-review` (never the full save flow) and stays in sync
 * with the editor form's own review fields in both directions — see
 * `ReviewStatusOverride.baseStatus` for the drift rule. Keyboard: ← previous,
 * → next, R toggle reviewed, U undo the last tick, M the molecule panel,
 * C the citation palette, E inline editing.
 *
 * This file only composes: settings and history live in `useReviewSettings`,
 * the queue in `useReviewQueue`, the direct writes in `useReviewWrites`, and
 * the chrome in `ReviewCommandBar` and `ReviewArticleView`.
 */
export const ReviewExperience = memo(function ReviewExperience({
  renderCommitPanel,
  initialSlug,
}: ReviewExperienceProps) {
  const {
    articles,
    applyArticlesTransform,
    articleHydration,
    sourceArticles,
    articlesRefreshConflict,
  } = useDevMode();

  // The queue, picker, and chrome read only slim library rows (reference
  // counts arrive projected as `reference_count`), so the workbench renders as
  // soon as the list lands. Article bodies hydrate one slug at a time below.
  const { hydratedSlugs, failedSlugs, isArticleHydrated, requestArticle } = articleHydration;
  const { layout } = useLightweightData();
  const typedArticles = articles as SubstanceArticle[];

  const settings = useReviewSettings({ initialSlug });
  const {
    settings: { viewMode, inlineEdit, articleLinks },
    currentSlug,
    currentSlugRef,
    viewModeRef,
    updateSettings,
  } = settings;

  const overlays = useReviewOverlays();
  const queueState = useReviewQueue({
    typedArticles,
    layout,
    overrides: overlays.overrides,
    settings,
  });
  const {
    queue,
    visibleQueue,
    queueGroups,
    position,
    current,
    article,
    reviewedCount,
    allReviewed,
    substances,
  } = queueState;

  // Hydrate the selected article's body; its slim library row has none.
  // `requestArticle` no-ops on slugs already requested or hydrated and
  // unlatches on failure, so navigating away and back re-attempts a miss.
  useEffect(() => {
    requestArticle(currentSlug);
  }, [currentSlug, requestArticle]);

  // Once the current body has landed, warm the flip-through's next two and
  // previous one so arrowing through the queue rarely waits on the network.
  useEffect(() => {
    if (!current || !isArticleHydrated(current.slug)) return;
    for (const index of [position - 1, position + 1, position + 2]) {
      requestArticle(visibleQueue[index]?.slug);
    }
  }, [current, hydratedSlugs, isArticleHydrated, position, requestArticle, visibleQueue]);

  // Until the body lands, only the article area waits: the command bar, queue
  // position, and picker all read slim rows and stay interactive. A failed
  // request is its own state so the area offers a retry instead of a spinner
  // that never resolves.
  const currentArticleHydrated = current ? isArticleHydrated(current.slug) : false;
  const currentArticleFailed =
    current !== null && !currentArticleHydrated && failedSlugs.has(current.slug);
  const retryCurrentArticle = useCallback(() => {
    requestArticle(currentSlugRef.current);
  }, [currentSlugRef, requestArticle]);

  // Deliberately not persisted: the panel is a per-article detour, and a stored
  // "open" would make every fresh session boot the WASM editor unasked.
  const [moleculePanelOpen, setMoleculePanelOpen] = useState(false);
  const [citationPanelOpen, setCitationPanelOpen] = useState(false);
  // Controlled so `?` can open it; the mobile sheet needs the same treatment
  // because selecting anything inside it should close it.
  const [helpOpen, setHelpOpen] = useState(false);

  // Direct review writes land in Convex without dirtying the shared editor
  // working set. Rebuild their combined post-write article here so the public
  // preview, citation diagnostics, and editor form all see the same state.
  const currentFieldEdits = current ? overlays.fieldEdits[current.slug] : undefined;
  const currentSavedReferences = current ? overlays.savedReferences[current.slug] : undefined;
  const currentRemovedReferenceIds = current ? overlays.removedReferenceIds[current.slug] : undefined;
  const currentOverride = current ? overlays.overrides[current.slug] : undefined;
  const articleForView = useMemo(
    () => article
      ? applyReviewArticleOverlay(article, {
          fieldEdits: currentFieldEdits,
          savedReferences: currentSavedReferences,
          removedReferenceIds: currentRemovedReferenceIds,
          editorialReview: resolveOverriddenEditorialReview(article, currentOverride),
        })
      : article,
    [article, currentFieldEdits, currentOverride, currentSavedReferences, currentRemovedReferenceIds],
  );

  // The public route resolves the Convex depiction server-side; this surface is
  // client-rendered, so it asks Convex directly. Reactivity means a save in the
  // inline molecule panel re-versions the article image without a refresh.
  const moleculeMeta = useQuery(
    api.moleculeOverrides.getMetadataBySlug,
    current ? { slug: current.slug } : "skip",
  );
  const moleculeOverrideUrl =
    current && moleculeMeta ? moleculeOverrideImageUrl(current.slug, moleculeMeta.updatedAt) : null;

  // The editor form hydrates from the working set, which never receives the
  // inline edit. Handing it the overlaid article instead is what stops an
  // "Apply to draft" from writing the pre-edit value back over Convex.
  const articlesForDraft = useMemo(() => {
    if (!article || !articleForView || articleForView === article) {
      return typedArticles;
    }
    const overlaid = articleForView;
    return typedArticles.map((candidate) =>
      candidate === article ? overlaid : candidate,
    );
  }, [article, articleForView, typedArticles]);

  const applyDraftArticlesTransform = useCallback(
    (transform: (previous: SubstanceArticle[]) => SubstanceArticle[]) => {
      applyArticlesTransform((previous) =>
        transform(previous as SubstanceArticle[]),
      );
    },
    [applyArticlesTransform],
  );
  // The slim row is a SubstanceArticle-shaped shell, so handing the controller
  // the slug before the body lands would seed the form from it and mount a
  // blank editor for the render in which hydration flips. Held at null until
  // then: the controller resets on the slug change and seeds once, from the
  // whole article.
  const draft = useSubstanceEditorDraftController({
    articles: articlesForDraft,
    applyArticlesTransform: applyDraftArticlesTransform,
    selectedSubstanceSlug: currentArticleHydrated ? (current?.slug ?? null) : null,
    substances,
  });

  const articleEditContext = useReviewFieldWrites({
    viewSlug: current?.slug ?? null,
    article,
    sourceArticles,
    draft,
    setFieldEdits: overlays.setFieldEdits,
  });

  const status = useReviewStatusWrites({
    current,
    viewSlug: current?.slug ?? null,
    typedArticles,
    draft,
    queueGroups,
    reviewedCount,
    setOverrides: overlays.setOverrides,
  });
  const { lastTick, milestone, celebration, toggleReviewed, toggleFlagged, undoLastTick } =
    status;

  const { navigateTo, goNext, goPrev, canGoPrev, canGoNext } = useReviewNavigation({
    settings,
    visibleQueue,
    position,
    formDirty: draft.formDirty,
    clearTickError: status.clearTickError,
  });

  const toggleMoleculePanel = useCallback(() => {
    if (!currentSlugRef.current) return;
    setMoleculePanelOpen((open) => !open);
  }, [currentSlugRef]);

  const toggleCitationPanel = useCallback(() => {
    if (!currentSlugRef.current) return;
    setCitationPanelOpen((open) => !open);
  }, [currentSlugRef]);

  // Scoped to the webpage view — the only place the mode does anything — so
  // neither the key nor the bar button can arm it invisibly from the editor.
  const toggleInlineEdit = useCallback(() => {
    if (viewModeRef.current !== "webpage") return;
    updateSettings({ inlineEdit: !inlineEdit });
  }, [inlineEdit, updateSettings, viewModeRef]);

  /**
   * Swallow link activations inside the rendered article while the
   * `articleLinks` setting is off. Capture phase, so it runs before both the
   * anchor's own handler and Next's client-side router; keyboard activation
   * (Enter on a focused link) arrives here as a click too. Same-page `#`
   * anchors stay live — a TOC jump never loses the reviewer's place.
   */
  const blockArticleLinks = useCallback((event: React.MouseEvent) => {
    if (!(event.target instanceof Element)) return;
    const anchor = event.target.closest("a[href]");
    if (!anchor || anchor.getAttribute("href")?.startsWith("#")) return;
    event.preventDefault();
    event.stopPropagation();
  }, []);

  // Moving on collapses the panels, so the WASM canvas never lingers over the
  // wrong molecule (and the palette never lists the wrong article's sources) —
  // the next article starts from the article itself.
  useEffect(() => {
    setMoleculePanelOpen(false);
    setCitationPanelOpen(false);
  }, [currentSlug]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        goPrev();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        goNext();
      } else if (event.key === "r" || event.key === "R") {
        event.preventDefault();
        toggleReviewed();
      } else if (event.key === "u" || event.key === "U") {
        event.preventDefault();
        undoLastTick();
      } else if (event.key === "m" || event.key === "M") {
        event.preventDefault();
        toggleMoleculePanel();
      } else if (event.key === "c" || event.key === "C") {
        // Plain C, not Shift+C: inside a textarea Shift+C is how a capital C
        // is typed, and the typing guard above already keeps every bare-letter
        // shortcut out of form fields.
        event.preventDefault();
        toggleCitationPanel();
      } else if (event.key === "f" || event.key === "F") {
        // The one status action that had no shortcut, on the surface that asks
        // for it most: "I can't finish this" is the second-most-repeated
        // gesture in a 274-article pass.
        event.preventDefault();
        toggleFlagged();
      } else if (event.key === "e" || event.key === "E") {
        // The typing guard above keeps E out of the very inputs the mode
        // creates, so the key that turns editing on can never type into it.
        event.preventDefault();
        toggleInlineEdit();
      } else if (event.key === "?") {
        event.preventDefault();
        setHelpOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    goNext,
    goPrev,
    toggleCitationPanel,
    toggleFlagged,
    toggleInlineEdit,
    toggleMoleculePanel,
    toggleReviewed,
    undoLastTick,
  ]);

  if (queue.length === 0) {
    return (
      <main className="theme-page-shell min-h-screen p-8">
        <div className="mx-auto max-w-xl pt-16">
          <EditorNotice
            notice={{
              tone: "info",
              message:
                "No publicly listed articles are available to review yet.",
            }}
          />
        </div>
      </main>
    );
  }

  // The frames between mount and the landing pick: hold the shell rather than
  // paint a command bar with no article and a "no article data" warning under
  // it. `current` is only ever null before the landing runs — once a slug is
  // chosen the queue filter always keeps it.
  if (!current && !currentSlug) {
    return <main className="theme-page-shell min-h-screen" aria-busy="true" />;
  }

  const dot = current ? STATUS_DOT[current.status] : null;

  return (
    <main className="theme-page-shell min-h-screen">
      {/* Screen-reader narration for keyboard-driven article changes. */}
      <p aria-live="polite" className="sr-only">
        {current
          ? `${current.name}, ${dot?.label ?? ""}. ${reviewedCount} of ${queue.length} reviewed.`
          : ""}
      </p>

      <ReviewCommandBar
        settings={settings}
        queue={queueState}
        status={status}
        navigateTo={navigateTo}
        goPrev={goPrev}
        goNext={goNext}
        canGoPrev={canGoPrev}
        canGoNext={canGoNext}
        moleculePanelOpen={moleculePanelOpen}
        citationPanelOpen={citationPanelOpen}
        toggleMoleculePanel={toggleMoleculePanel}
        toggleCitationPanel={toggleCitationPanel}
        toggleInlineEdit={toggleInlineEdit}
        helpOpen={helpOpen}
        setHelpOpen={setHelpOpen}
      />

      <ReviewArticleView
        allReviewed={allReviewed}
        total={queue.length}
        showAll={() => updateSettings({ unreviewedOnly: false })}
        current={current}
        articleForView={currentArticleHydrated ? articleForView : null}
        articleHydrating={current !== null && !currentArticleHydrated && !currentArticleFailed}
        articleFailed={currentArticleFailed}
        retryArticle={retryCurrentArticle}
        moleculeOverrideUrl={moleculeOverrideUrl}
        moleculePanelOpen={moleculePanelOpen}
        closeMoleculePanel={() => setMoleculePanelOpen(false)}
        citationPanelOpen={citationPanelOpen}
        closeCitationPanel={() => setCitationPanelOpen(false)}
        rememberSavedReference={overlays.rememberSavedReference}
        rememberRemovedReference={overlays.rememberRemovedReference}
        viewMode={viewMode}
        articleLinks={articleLinks}
        blockArticleLinks={blockArticleLinks}
        articlesRefreshConflict={articlesRefreshConflict !== null}
        inlineEdit={inlineEdit}
        articleEditContext={articleEditContext}
        draft={draft}
        renderCommitPanel={renderCommitPanel}
      />

      {/* A finished psychoactive category: confetti plus the medallion card.
          When that same tick finished the whole corpus, FinishedState is the
          headline — the confetti still flies, the card stays home. */}
      {celebration?.level === "group" ? (
        <ReviewClassCelebration
          key={celebration.id}
          label={celebration.label}
          total={celebration.total}
          iconKey={celebration.iconKey}
          showCard={!allReviewed}
          onDismiss={status.dismissCelebration}
        />
      ) : null}

      {celebration?.level === "section" ? (
        <ReviewToast tone="success">
          <Icon icon="lucide:sparkles" size={16} />
          <span>
            <span className="font-semibold">{celebration.label}</span> complete —
            all {celebration.total} reviewed
          </span>
        </ReviewToast>
      ) : milestone !== null ? (
        <ReviewToast tone="milestone">
          <Icon icon="lucide:party-popper" size={16} />
          <span className="font-semibold">{milestone} reviewed!</span>
          <span className="theme-text-faint">Keep rolling.</span>
        </ReviewToast>
      ) : lastTick ? (
        <ReviewToast tone="success">
          <Icon icon="lucide:badge-check" size={16} />
          <span>
            Marked <span className="font-semibold">{lastTick.name}</span>{" "}
            reviewed
          </span>
          <button
            type="button"
            onClick={undoLastTick}
            className="font-semibold underline underline-offset-2 hover:opacity-80"
          >
            Undo
          </button>
          <Kbd>U</Kbd>
        </ReviewToast>
      ) : null}
    </main>
  );
});
