"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

import { useEditorRead } from "@/hooks/useEditorRead";

import { Icon } from "@/components/common/Icon";
import { StateCard } from "@/components/common/StateCard";
import { Button } from "@/components/ui/button";
import { TOUCH_PILL } from "@/components/ui/touchTargets";
import { useLightweightData } from "@/data/LightweightDataProvider";
import { moleculeOverrideImageUrl } from "@/data/mappings/moleculeOverrideUrl";
import { EditorField, EditorStatusPill, Notice, useConfirm, useDirtyGuard, useWriteFreeze } from "@/features/dev/components";
import { RelativeDay } from "@/features/dev/tools/home/homeParts";
import { Input } from "@/components/ui/input";
import type { DraftNavigationGuard } from "@/features/contextual-editing/context";
import { canApprove, canDraft, resolveSessionRole, roleMeetsFloor } from "@/lib/auth/roles";
import { cn } from "@/lib/utils";
import type { ReviewFlag, SubstanceArticle } from "@/schema";
import { useDevMode } from "../../context/DevModeContext";
import type { SubstanceEditorTabProps } from "../substance-editor/types";
import { applyReviewArticleOverlay } from "./reviewArticleOverlay";
import { ReviewArticleView } from "./ReviewArticleView";
import { ReviewChangesSinceReview } from "./ReviewChangesSinceReview";
import { Kbd, MarkReviewedControl } from "./ReviewBarChrome";
import { ReviewClassCelebration } from "./ReviewClassCelebration";
import { ReviewCommandBar } from "./ReviewCommandBar";
import { ReviewDock } from "./ReviewDock";
import { describeReviewRole, describeStatusChange } from "./reviewDockModel";
import { isEmptyNotesDraft, NOTES_PANEL_ID, ReviewNotesPanel, type NotesDraft } from "./ReviewNotesPanel";
import { resolveOverriddenEditorialReview, signOffCredit } from "./reviewQueue";
import { STATUS_DOT } from "./ReviewSubstancePicker";
import { useReviewQueue } from "./useReviewQueue";
import { usePublishedRevisions } from "./useReviewRevisions";
import { useReviewNavigation, useReviewSettings } from "./useReviewSettings";
import {
  useReviewOverlays,
  useReviewStatusWrites,
} from "./useReviewWrites";

function isWidgetTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest('[role="menu"], [role="menubar"], [role="listbox"], [role="dialog"], [role="alertdialog"]') !== null
  );
}

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

type ReviewExperienceProps = Pick<SubstanceEditorTabProps, "initialSlug">;

export const ReviewExperience = memo(function ReviewExperience({
  initialSlug,
}: ReviewExperienceProps) {
  const {
    articles,
    articleHydration,
    articlesRefreshConflict,
  } = useDevMode();
  const router = useRouter();

  const { hydratedSlugs, failedSlugs, isArticleHydrated, requestArticle } = articleHydration;
  const { layout } = useLightweightData();
  const typedArticles = articles as SubstanceArticle[];

  const session = useSession();
  const canEditArticle =
    session.status === "authenticated" &&
    canDraft(resolveSessionRole({ role: session.data?.user?.role }));
  const canSignOff =
    session.status === "authenticated" &&
    canApprove(resolveSessionRole({ role: session.data?.user?.role }));
  const canRecommend =
    !canSignOff &&
    session.status === "authenticated" &&
    roleMeetsFloor(resolveSessionRole({ role: session.data?.user?.role }), "editor");

  const settings = useReviewSettings({ initialSlug });
  const {
    settings: { viewMode, inlineEdit, articleLinks },
    currentSlug,
    currentSlugRef,
    viewModeRef,
    updateSettings,
  } = settings;

  const overlays = useReviewOverlays();
  const [flagOverrides, setFlagOverrides] = useState<Record<string, ReviewFlag[]>>({});
  const publishedRevisions = usePublishedRevisions();
  const queueState = useReviewQueue({
    typedArticles,
    layout,
    overrides: overlays.overrides,
    flagOverrides,
    publishedRevisions,
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
  } = queueState;

  useEffect(() => {
    requestArticle(currentSlug);
  }, [currentSlug, requestArticle]);

  useEffect(() => {
    if (!current || !isArticleHydrated(current.slug)) return;
    for (const index of [position - 1, position + 1, position + 2]) {
      requestArticle(visibleQueue[index]?.slug);
    }
  }, [current, hydratedSlugs, isArticleHydrated, position, requestArticle, visibleQueue]);

  const currentArticleHydrated = current ? isArticleHydrated(current.slug) : false;
  const currentArticleFailed =
    current !== null && !currentArticleHydrated && failedSlugs.has(current.slug);
  const retryCurrentArticle = useCallback(() => {
    requestArticle(currentSlugRef.current);
  }, [currentSlugRef, requestArticle]);
  const [drawFailedSlug, setDrawFailedSlug] = useState<string | null>(null);
  const currentDrawFailed = current !== null && drawFailedSlug === current.slug;
  const currentReadable = currentArticleHydrated && !currentDrawFailed;
  const reportDrawFailed = useCallback((failed: boolean) => {
    setDrawFailedSlug(failed ? currentSlugRef.current : null);
  }, [currentSlugRef]);

  const [moleculePanelOpen, setMoleculePanelOpen] = useState(false);
  const [citationPanelOpen, setCitationPanelOpen] = useState(false);
  const [notesPanelOpen, setNotesPanelOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, NotesDraft>>({});
  const notesButtonRef = useRef<HTMLButtonElement | null>(null);

  const currentOverride = current ? overlays.overrides[current.slug] : undefined;
  const articleForView = useMemo(
    () => article
      ? applyReviewArticleOverlay(article, {
          editorialReview: resolveOverriddenEditorialReview(article, currentOverride),
        })
      : article,
    [article, currentOverride],
  );

  const moleculeMeta = useEditorRead(
    "moleculeOverrides:getMetadataBySlug",
    current ? { slug: current.slug } : "skip",
    "document",
  );
  const moleculeOverrideUrl =
    current && moleculeMeta ? moleculeOverrideImageUrl(current.slug, moleculeMeta.updatedAt) : null;

  const status = useReviewStatusWrites({
    current,
    typedArticles,
    queueGroups,
    reviewedCount,
    setOverrides: overlays.setOverrides,
    canSignOff,
    canRecommend,
    currentHydrated: currentReadable,
    publishedRevisions,
  });
  const { lastTick, lastRecommended, milestone, celebration, toggleReviewed, toggleFlagged, undoLastTick, isTicking } =
    status;
  const { frozen } = useWriteFreeze();

  const { confirm: confirmRecommend, dialog: recommendDialog } = useConfirm();
  const recommendNoteRef = useRef<HTMLInputElement | null>(null);
  const { currentRecommendation, recommendReviewed } = status;
  const requestRecommendation = useCallback(() => {
    if (!current || !canRecommend || !currentReadable || isTicking) return;
    if (current.status === "completed") return;
    if (currentRecommendation && !currentRecommendation.stale) return;
    confirmRecommend({
      title: `Recommend ${current.name} as reviewed?`,
      description:
        "An admin approves recommendations in Change Review. Yours covers the version you are reading; if the article is published again first, it needs another review.",
      body: (
        <EditorField label="Note for the admin (optional)" htmlFor="review-recommendation-note" description="What you checked, or anything the admin should look at first.">
          <Input id="review-recommendation-note" ref={recommendNoteRef} maxLength={1000} autoComplete="off" className="text-[16px] md:text-sm" />
        </EditorField>
      ),
      confirmLabel: "Recommend reviewed",
      onConfirm: () => recommendReviewed(recommendNoteRef.current?.value ?? ""),
    });
  }, [canRecommend, confirmRecommend, current, currentReadable, currentRecommendation, isTicking, recommendReviewed]);
  const [changesSeenSlug, setChangesSeenSlug] = useState<string | null>(null);
  const [changesOpenSignal, setChangesOpenSignal] = useState(0);
  const staleGateApplies =
    (canSignOff || canRecommend) && current !== null && current.status === "stale" && Boolean(current.reviewedRevision);
  const staleGateClosed = staleGateApplies && changesSeenSlug !== current?.slug;
  const staleChangesShown = staleGateApplies && changesSeenSlug === current?.slug;
  const recommendationWaiting = Boolean(currentRecommendation && !currentRecommendation.stale);
  const markChangesSeen = useCallback(() => {
    setChangesSeenSlug(currentSlugRef.current);
  }, [currentSlugRef]);
  const openChangesFirst = useCallback(() => {
    if (!currentReadable || isTicking) return;
    setChangesOpenSignal((value) => value + 1);
  }, [currentReadable, isTicking]);
  const signOff = useCallback(() => {
    if (staleGateClosed) return openChangesFirst();
    toggleReviewed();
  }, [openChangesFirst, staleGateClosed, toggleReviewed]);
  const recommend = useCallback(() => {
    if (staleGateClosed && !recommendationWaiting) return openChangesFirst();
    requestRecommendation();
  }, [openChangesFirst, recommendationWaiting, requestRecommendation, staleGateClosed]);
  const pressReviewed = canSignOff ? signOff : recommend;

  const [articleDirty, setArticleDirty] = useState(false);
  const [operationLocked, setOperationLocked] = useState(false);
  const articleDraftGuard = useRef<DraftNavigationGuard | null>(null);
  const articleNavigation = useDirtyGuard(articleDirty, {
    title: "Keep your article edits?",
    description: "Save a private draft, discard local edits, or stay with this article.",
    onSave: operationLocked ? undefined : async () => {
      if (!articleDraftGuard.current?.save) throw new Error("The article draft is unavailable.");
      await articleDraftGuard.current.save();
    },
    onDiscard: () => articleDraftGuard.current?.discard(),
    canDiscard: !operationLocked,
  });
  const { navigateTo, goNext, goPrev, canGoPrev, canGoNext } = useReviewNavigation({
    settings,
    visibleQueue,
    position,
    formDirty: articleDirty,
    clearTickError: status.clearTickError,
    guardNavigation: articleNavigation.guard,
  });

  const nextWaiting = useMemo(() => {
    if (visibleQueue.length === 0) return null;
    for (let step = 1; step < visibleQueue.length; step += 1) {
      const entry = visibleQueue[(Math.max(position, 0) + step) % visibleQueue.length];
      if (entry.status !== "completed") return entry;
    }
    return null;
  }, [position, visibleQueue]);
  const goNextWaiting = useCallback(() => {
    if (nextWaiting) navigateTo(nextWaiting.slug);
  }, [navigateTo, nextWaiting]);

  const leaveWorkbench = useCallback((event: MouseEvent<HTMLAnchorElement>) => {
    if (!articleDirty || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    articleNavigation.guard(() => router.push("/dev"));
  }, [articleDirty, articleNavigation, router]);

  const toggleMoleculePanel = useCallback(() => {
    if (!currentSlugRef.current) return;
    setMoleculePanelOpen((open) => !open);
  }, [currentSlugRef]);

  const toggleNotesPanel = useCallback(() => {
    if (!currentSlugRef.current) return;
    setNotesPanelOpen((open) => !open);
  }, [currentSlugRef]);
  const closeNotesPanel = useCallback(() => {
    setNotesPanelOpen(false);
    window.requestAnimationFrame(() => notesButtonRef.current?.focus({ preventScroll: true }));
  }, []);
  const recordNoteDraft = useCallback((slug: string, draft: NotesDraft) => {
    setNoteDrafts((previous) => {
      if (isEmptyNotesDraft(draft)) {
        if (!(slug in previous)) return previous;
        const next = { ...previous };
        delete next[slug];
        return next;
      }
      return { ...previous, [slug]: draft };
    });
  }, []);

  const recordFlags = useCallback((slug: string, flags: ReviewFlag[]) => {
    setFlagOverrides((previous) => ({ ...previous, [slug]: flags }));
  }, []);

  const toggleCitationPanel = useCallback(() => {
    if (!currentSlugRef.current) return;
    if (!citationPanelOpen) updateSettings({ inlineEdit: true });
    setCitationPanelOpen((open) => !open);
  }, [currentSlugRef, citationPanelOpen, updateSettings]);

  const toggleInlineEdit = useCallback(() => {
    if (viewModeRef.current !== "webpage" || !canEditArticle) return;
    articleNavigation.guard(() => updateSettings({ inlineEdit: !inlineEdit }));
  }, [canEditArticle, inlineEdit, updateSettings, viewModeRef, articleNavigation.guard]);

  const blockArticleLinks = useCallback((event: React.MouseEvent) => {
    if (!(event.target instanceof Element)) return;
    const anchor = event.target.closest("a[href]");
    if (!anchor || anchor.getAttribute("href")?.startsWith("#")) return;
    event.preventDefault();
    event.stopPropagation();
  }, []);

  useEffect(() => {
    setMoleculePanelOpen(false);
    setCitationPanelOpen(false);
    setNotesPanelOpen(false);
    setChangesSeenSlug(null);
  }, [currentSlug]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (isTypingTarget(event.target) || isWidgetTarget(event.target)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      if (key === "ArrowLeft" || key === "k") {
        event.preventDefault();
        goPrev();
      } else if (key === "ArrowRight" || key === "j") {
        event.preventDefault();
        goNext();
      } else if (key === "r") {
        event.preventDefault();
        pressReviewed();
      } else if (key === "u") {
        event.preventDefault();
        undoLastTick();
      } else if (key === "h") {
        event.preventDefault();
        toggleFlagged();
      } else if (key === "m") {
        event.preventDefault();
        toggleMoleculePanel();
      } else if (key === "c") {
        event.preventDefault();
        toggleCitationPanel();
      } else if (key === "f") {
        event.preventDefault();
        toggleNotesPanel();
      } else if (key === "e") {
        event.preventDefault();
        toggleInlineEdit();
      } else if (key === "n") {
        event.preventDefault();
        goNextWaiting();
      } else if (key === "/") {
        event.preventDefault();
        setPickerOpen(true);
      } else if (key === "?") {
        event.preventDefault();
        setHelpOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    goNext,
    goNextWaiting,
    goPrev,
    pressReviewed,
    toggleCitationPanel,
    toggleFlagged,
    toggleInlineEdit,
    toggleMoleculePanel,
    toggleNotesPanel,
    undoLastTick,
  ]);

  if (queue.length === 0) {
    return (
      <main className="theme-page-shell flex min-h-screen items-center justify-center p-6">
        <StateCard
          className="max-w-lg"
          icon="lucide:list-checks"
          title="Nothing to review yet"
          description="No public articles are available to review yet. Articles join the queue as soon as they are published."
          actions={(
            <div className="flex flex-wrap justify-center gap-2">
              <Button asChild variant="outline" className={TOUCH_PILL}>
                <Link href="/dev/articles">Open Substances</Link>
              </Button>
              <Button asChild variant="ghost" className={TOUCH_PILL}>
                <Link href="/dev">Back to the editor</Link>
              </Button>
            </div>
          )}
        />
      </main>
    );
  }

  if (!current && !currentSlug) {
    return <main className="theme-page-shell min-h-screen" aria-busy="true" />;
  }

  const dot = current ? STATUS_DOT[current.status] : null;
  const recommendationState = canRecommend
    ? (currentRecommendation ? (currentRecommendation.stale ? "stale" : "pending") : "none") as "none" | "pending" | "stale"
    : null;
  const credit = current?.status === "completed" ? signOffCredit(current) : null;
  const flagCount = (current ? flagOverrides[current.slug] ?? article?.editorial_review?.flags ?? [] : []).length;
  const isHeld = current?.status === "in_progress";

  const tickReason = !current
    ? null
    : currentDrawFailed
      ? "This article could not be drawn, so it cannot be marked reviewed here. Fix it in the Substances editor first."
      : currentArticleFailed
        ? "The article did not load, so it cannot be marked reviewed yet."
        : !currentArticleHydrated
          ? "Marking reviewed waits until the article has loaded."
          : staleChangesShown && !(canRecommend && recommendationWaiting)
            ? "Changes since the last review are shown above."
            : staleGateClosed && !(canRecommend && recommendationWaiting)
              ? `It changed since its last review, so ${
                  canSignOff ? "Mark as reviewed" : recommendationState === "stale" ? "Recommend again" : "Recommend as reviewed"
                } first opens the changes.`
              : null;
  const roleSentence = describeReviewRole({ canSignOff, canRecommend, recommendation: recommendationState });
  const roleLine = roleSentence || tickReason || (isHeld && flagCount === 0) ? (
    <>
      {roleSentence}
      {tickReason ? <>{roleSentence ? " " : null}{tickReason}</> : null}
      {isHeld && flagCount === 0 ? <>{roleSentence || tickReason ? " " : null}Nothing says why it is on hold yet; add a flag under Notes.</> : null}
      {recommendationState === "pending" ? (
        <>
          {" "}
          <Link href="/dev/queue#recommendations" className="text-dose-accent-strong theme-accent-underline underline-offset-4 hover:underline">
            Open Change Review
          </Link>
        </>
      ) : null}
    </>
  ) : null;

  const tickResultTitle = lastTick && lastTick.status === "completed"
    ? celebration && celebration.level === "section"
      ? `${celebration.groupLabel ? `${celebration.groupLabel}, ${celebration.label}` : celebration.label} complete, all ${celebration.total.toLocaleString()} reviewed`
      : celebration && celebration.level === "group"
        ? `${celebration.label} complete: every article in the class is reviewed`
        : milestone !== null
          ? `${milestone.toLocaleString()} reviewed. Keep rolling.`
          : undefined
    : undefined;
  const result = status.tickError ? (
    <Notice
      tone={status.tickRefusal === "frozen" ? "warning" : "danger"}
      message={status.tickError}
      className="text-sm"
      dismiss={status.clearTickError}
      actions={status.tickRefusal === "expired" ? (
        <Button asChild variant="outline" size="sm">
          <a href={`/sign-in?callbackUrl=${encodeURIComponent(current ? `/review/${current.slug}` : "/review")}`} target="_blank" rel="noopener noreferrer">
            Sign in in a new tab
          </a>
        </Button>
      ) : undefined}
    />
  ) : lastTick ? (
    <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
      <EditorStatusPill inline tone="success" icon={lastTick.status === "completed" ? "lucide:badge-check" : lastTick.status === "in_progress" ? "lucide:hand" : "lucide:rotate-ccw"} className="max-w-full whitespace-normal text-left">
        <span className="min-w-0">
          {tickResultTitle ? <span className="font-semibold">{tickResultTitle}. </span> : null}
          {describeStatusChange(lastTick.status, lastTick.name)}
        </span>
      </EditorStatusPill>
      <Button type="button" variant="outline" size="sm" onClick={undoLastTick} disabled={isTicking} aria-keyshortcuts="u" className="gap-2">
        Undo
        <Kbd>U</Kbd>
      </Button>
      {lastTick.status === "completed" && nextWaiting && lastTick.slug === current?.slug ? (
        <Button type="button" variant="link" size="quiet" className="h-auto gap-2 p-0" onClick={goNextWaiting} aria-keyshortcuts="n">
          <span className="max-sm:hidden">Next waiting:</span><span className="sm:hidden">Next:</span> {nextWaiting.name}
          <Kbd>N</Kbd>
        </Button>
      ) : null}
    </div>
  ) : lastRecommended ? (
    <Notice
      placement="inline"
      tone="success"
      icon="lucide:send"
      message={`Recommended ${lastRecommended} as reviewed. An admin approves it in Change Review.`}
      className="text-sm"
      autoClearMs={null}
    />
  ) : null;

  const actions = current ? (
    <>
      <Button
        type="button"
        variant={isHeld ? "iconWarning" : "outline"}
        className={cn("gap-2 max-sm:px-3", TOUCH_PILL)}
        onClick={toggleFlagged}
        disabled={isTicking}
        aria-pressed={isHeld}
        aria-label="Hold"
        aria-keyshortcuts="h"
        title={isHeld ? "On hold. Press to release it (H)" : "Hold this article if you cannot finish it now (H)"}
      >
        <Icon icon="lucide:hand" size={15} />
        Hold
        <Kbd className="max-sm:hidden">H</Kbd>
      </Button>
      <Button
        ref={notesButtonRef}
        type="button"
        variant={notesPanelOpen ? "pillActive" : "outline"}
        className={cn("gap-2 max-sm:px-3", TOUCH_PILL)}
        onClick={toggleNotesPanel}
        aria-expanded={notesPanelOpen}
        aria-controls={NOTES_PANEL_ID}
        aria-keyshortcuts="f"
      >
        <Icon icon="lucide:notebook-pen" size={15} />
        <span className="max-sm:sr-only">Notes and flags</span>
        {flagCount > 0 ? (
          <span className="theme-review-count rounded-chip px-1.5 text-xs tabular-nums">
            <span className="sr-only">, </span>{flagCount}<span className="sr-only"> {flagCount === 1 ? "flag" : "flags"}</span>
          </span>
        ) : null}
        {noteDrafts[current.slug] && !notesPanelOpen ? (
          <>
            <span aria-hidden className="theme-dev-unsaved-dot size-1.5 rounded-full" />
            <span className="sr-only">, a note not added yet</span>
          </>
        ) : null}
        <Kbd className="max-sm:hidden">F</Kbd>
      </Button>
      <MarkReviewedControl
        isCurrentReviewed={current.status === "completed"}
        justTicked={lastTick?.status === "completed" && lastTick.slug === current.slug}
        hasCurrent={currentReadable}
        isTicking={isTicking}
        canSignOff={canSignOff}
        recommendation={recommendationState}
        confirm={canSignOff && staleChangesShown}
        toggleReviewed={pressReviewed}
      />
    </>
  ) : null;

  return (
    <main className="theme-page-shell flex min-h-screen flex-col">
      <p aria-live="polite" className="sr-only">
        {current
          ? `${current.name}, ${dot?.label ?? ""}. ${reviewedCount} of ${queue.length} reviewed.`
          : ""}
      </p>

      <ReviewCommandBar
        settings={{ ...settings, changeViewMode: (view) => articleNavigation.guard(() => settings.changeViewMode(view)) }}
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
        canEditArticle={canEditArticle}
        helpOpen={helpOpen}
        setHelpOpen={setHelpOpen}
        pickerOpen={pickerOpen}
        setPickerOpen={setPickerOpen}
        onLeave={leaveWorkbench}
      />

      {articleNavigation.dialog}
      {recommendDialog}
      <div className="flex-1">
        {current?.status === "stale" && current.reviewedRevision ? (
          <div className="mx-auto w-full max-w-[1500px] px-4 pt-4 sm:px-6">
            <ReviewChangesSinceReview
              key={`${current.slug}:${current.reviewedRevision}`}
              slug={current.slug}
              name={current.name}
              reviewedRevision={current.reviewedRevision}
              reviewedBy={current.reviewedBy}
              reviewedAt={current.reviewedAt}
              recommendedBy={current.recommendedBy}
              openSignal={changesOpenSignal}
              onOpened={markChangesSeen}
            />
          </div>
        ) : null}
        <ReviewArticleView
          allReviewed={allReviewed}
          total={queue.length}
          showAll={() => updateSettings({ unreviewedOnly: false })}
          current={current}
          articleForView={currentArticleHydrated ? articleForView : null}
          articleHydrating={current !== null && !currentArticleHydrated && !currentArticleFailed}
          articleFailed={currentArticleFailed}
          retryArticle={retryCurrentArticle}
          goNext={canGoNext ? goNext : undefined}
          onDrawFailedChange={reportDrawFailed}
          moleculeOverrideUrl={moleculeOverrideUrl}
          moleculePanelOpen={moleculePanelOpen}
          closeMoleculePanel={() => setMoleculePanelOpen(false)}
          citationPanelOpen={citationPanelOpen}
          closeCitationPanel={() => setCitationPanelOpen(false)}
          viewMode={viewMode}
          articleLinks={articleLinks}
          blockArticleLinks={blockArticleLinks}
          articlesRefreshConflict={articlesRefreshConflict !== null}
          inlineEdit={inlineEdit}
          workbenchRole={resolveSessionRole(session.data?.user ?? {})}
          workbenchEmail={session.data?.user?.email ?? null}
          onDirtyChange={setArticleDirty}
          draftGuardRef={articleDraftGuard}
          onOperationLockChange={setOperationLocked}
        />
      </div>

      <ReviewDock
        state={current?.status ?? null}
        credit={credit ? (
          <span className={cn("theme-text-secondary", result ? "max-sm:hidden" : undefined)}>
            <span data-testid="review-signoff-credit">{credit}.</span>
            {current?.reviewedAt ? <span className="theme-text-muted"> <RelativeDay iso={current.reviewedAt} prefix="Signed off" />.</span> : null}
          </span>
        ) : null}
        roleLine={roleLine}
        reviewed={reviewedCount}
        total={queue.length}
        result={result}
        frozen={frozen && !status.tickError}
        notes={notesPanelOpen && current ? (
          <ReviewNotesPanel
            key={current.slug}
            slug={current.slug}
            name={current.name}
            flags={flagOverrides[current.slug] ?? article?.editorial_review?.flags ?? []}
            onFlagsChange={recordFlags}
            onClose={closeNotesPanel}
            draft={noteDrafts[current.slug]}
            onDraftChange={recordNoteDraft}
          />
        ) : null}
        actions={actions}
      />

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
    </main>
  );
});
