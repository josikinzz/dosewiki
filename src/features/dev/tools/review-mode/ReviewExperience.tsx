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

/**
 * True when a key event starts inside a menu, list box, popover, or dialog.
 * Those widgets own their keys (ArrowRight in the Open in menu, a letter in a
 * menu's typeahead), whether or not they mark the event handled.
 */
function isWidgetTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest('[role="menu"], [role="menubar"], [role="listbox"], [role="dialog"], [role="alertdialog"]') !== null
  );
}

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

type ReviewExperienceProps = Pick<SubstanceEditorTabProps, "initialSlug">;

/**
 * The full-bleed review workbench (`/review/[slug]`).
 *
 * A sticky bar over one article (where you are, how to move, the tools) and a
 * review dock under it (where this article's review stands, hold, notes, the
 * tick and the result of the last change, with Undo). The tick persists
 * through `/api/dev/editorial-review` (never the full save flow) and stays in
 * sync with the editor form's own review fields in both directions; see
 * `ReviewStatusOverride.baseStatus` for the drift rule. Keyboard: ← / k
 * previous, → / j next, R toggle reviewed, U undo the last status change, H
 * hold, F notes and flags, M the molecule panel, C the citation palette, E
 * inline editing, ? help.
 *
 * This file only composes: settings and history live in `useReviewSettings`,
 * the queue in `useReviewQueue`, the direct writes in `useReviewWrites`, and
 * the chrome in `ReviewCommandBar`, `ReviewDock` and `ReviewArticleView`.
 */
export const ReviewExperience = memo(function ReviewExperience({
  initialSlug,
}: ReviewExperienceProps) {
  const {
    articles,
    articleHydration,
    articlesRefreshConflict,
  } = useDevMode();
  const router = useRouter();

  // The queue, picker, and chrome read only slim library rows (reference
  // counts arrive projected as `reference_count`), so the workbench renders as
  // soon as the list lands. Article bodies hydrate one slug at a time below.
  const { hydratedSlugs, failedSlugs, isArticleHydrated, requestArticle } = articleHydration;
  const { layout } = useLightweightData();
  const typedArticles = articles as SubstanceArticle[];

  // Editors can draft in context; publication is separately admin-gated.
  const session = useSession();
  const canEditArticle =
    session.status === "authenticated" &&
    canDraft(resolveSessionRole({ role: session.data?.user?.role }));
  // Completing a review is admin-only at the route; nobody else gets a tick
  // that can only fail.
  const canSignOff =
    session.status === "authenticated" &&
    canApprove(resolveSessionRole({ role: session.data?.user?.role }));
  // Editors recommend instead: R records "Recommended reviewed" for an admin
  // to approve in Change Review, and never completes the review itself.
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
  // Review Flags written from the notes panel, keyed by slug, until the
  // working set re-reads them.
  const [flagOverrides, setFlagOverrides] = useState<Record<string, ReviewFlag[]>>({});
  // Each article's current published revision, so a sign-off that an edit
  // has since overtaken reads "Changed since review".
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

  // Until the body lands, only the article area waits: the bar, the queue
  // position, and the picker read slim rows and stay interactive. A failed
  // request is its own state so the area offers a retry.
  const currentArticleHydrated = current ? isArticleHydrated(current.slug) : false;
  const currentArticleFailed =
    current !== null && !currentArticleHydrated && failedSlugs.has(current.slug);
  const retryCurrentArticle = useCallback(() => {
    requestArticle(currentSlugRef.current);
  }, [currentSlugRef, requestArticle]);
  // An article the renderer could not draw was not read, so it cannot be
  // signed off here either. Keyed by slug, so moving on forgets it.
  const [drawFailedSlug, setDrawFailedSlug] = useState<string | null>(null);
  const currentDrawFailed = current !== null && drawFailedSlug === current.slug;
  const currentReadable = currentArticleHydrated && !currentDrawFailed;
  const reportDrawFailed = useCallback((failed: boolean) => {
    setDrawFailedSlug(failed ? currentSlugRef.current : null);
  }, [currentSlugRef]);

  // Deliberately not persisted: the panel is a per-article detour, and a stored
  // "open" would make every fresh session boot the WASM editor unasked.
  const [moleculePanelOpen, setMoleculePanelOpen] = useState(false);
  const [citationPanelOpen, setCitationPanelOpen] = useState(false);
  const [notesPanelOpen, setNotesPanelOpen] = useState(false);
  // Controlled so `?` can open it.
  const [helpOpen, setHelpOpen] = useState(false);
  // Controlled so `/` can open the article list with its search focused.
  const [pickerOpen, setPickerOpen] = useState(false);
  // What the reviewer typed in the notes panel and has not added yet, per
  // article, so closing the panel or moving on never drops it.
  const [noteDrafts, setNoteDrafts] = useState<Record<string, NotesDraft>>({});
  const notesButtonRef = useRef<HTMLButtonElement | null>(null);

  // Human Reviewed status is independent of the private article draft.
  const currentOverride = current ? overlays.overrides[current.slug] : undefined;
  const articleForView = useMemo(
    () => article
      ? applyReviewArticleOverlay(article, {
          editorialReview: resolveOverriddenEditorialReview(article, currentOverride),
        })
      : article,
    [article, currentOverride],
  );

  // The public route resolves the depiction server-side; this surface is
  // client-rendered, so it reads the metadata through the editor route. A save
  // in the inline molecule panel invalidates this key, so the article image
  // re-versions without a refresh.
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

  // An editor's R asks once, with room for an optional note, before the
  // recommendation is recorded against the version on screen.
  const { confirm: confirmRecommend, dialog: recommendDialog } = useConfirm();
  const recommendNoteRef = useRef<HTMLInputElement | null>(null);
  const { currentRecommendation, recommendReviewed } = status;
  const requestRecommendation = useCallback(() => {
    if (!current || !canRecommend || !currentReadable || isTicking) return;
    // A current sign-off needs no recommendation; a stale one does.
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
  const pressReviewed = canSignOff ? toggleReviewed : requestRecommendation;

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

  // The next article in the queue still waiting for a sign-off, after the
  // one on screen and wrapping round, so a result can offer it.
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

  // Leaving for the editor asks first while article edits are unsaved; a
  // modified click still opens a new tab.
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
  // Closing the panel hands focus back to the button that opened it.
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

  // Scoped to the webpage view, the only place the mode does anything, so
  // neither the key nor the bar button can arm it invisibly from the editor.
  // Both editor and admin roles may arm local editing.
  const toggleInlineEdit = useCallback(() => {
    if (viewModeRef.current !== "webpage" || !canEditArticle) return;
    articleNavigation.guard(() => updateSettings({ inlineEdit: !inlineEdit }));
  }, [canEditArticle, inlineEdit, updateSettings, viewModeRef, articleNavigation.guard]);

  /**
   * Swallow link activations inside the rendered article while the
   * `articleLinks` setting is off. Capture phase, so it runs before both the
   * anchor's own handler and Next's client-side router; keyboard activation
   * (Enter on a focused link) arrives here as a click too. Same-page `#`
   * anchors stay live, so a contents jump never loses the reviewer's place.
   */
  const blockArticleLinks = useCallback((event: React.MouseEvent) => {
    if (!(event.target instanceof Element)) return;
    const anchor = event.target.closest("a[href]");
    if (!anchor || anchor.getAttribute("href")?.startsWith("#")) return;
    event.preventDefault();
    event.stopPropagation();
  }, []);

  // Moving on collapses the panels, so the WASM canvas never lingers over the
  // wrong molecule (and the palette never lists the wrong article's sources);
  // the next article starts from the article itself.
  useEffect(() => {
    setMoleculePanelOpen(false);
    setCitationPanelOpen(false);
    setNotesPanelOpen(false);
  }, [currentSlug]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // A key something else already handled, or one aimed at a menu or
      // popover, is not a workbench command.
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
        // Plain C, not Shift+C: inside a textarea Shift+C is how a capital C
        // is typed, and the typing guard above already keeps every bare-letter
        // shortcut out of form fields.
        event.preventDefault();
        toggleCitationPanel();
      } else if (key === "f") {
        // Notes and flags, where a held article gets its reason. The panel
        // takes focus in the note, so the next keys type rather than command.
        event.preventDefault();
        toggleNotesPanel();
      } else if (key === "e") {
        // The typing guard above keeps E out of the very inputs the mode
        // creates, so the key that turns editing on can never type into it.
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

  // The frames between mount and the landing pick: hold the shell rather than
  // paint a bar with no article under it. `current` is only ever null before
  // the landing runs; once a slug is chosen the queue filter always keeps it.
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

  // Why the tick is off, when it is, in the dock's words.
  const tickReason = !current
    ? null
    : currentDrawFailed
      ? "This article could not be drawn, so it cannot be marked reviewed here. Fix it in the Substances editor first."
      : currentArticleFailed
        ? "The article did not load, so it cannot be marked reviewed yet."
        : !currentArticleHydrated
          ? "Marking reviewed waits until the article has loaded."
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

  // The one result the dock shows: a refused write first, then the last
  // change with its Undo (and what it finished), then a recommendation.
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
        toggleReviewed={pressReviewed}
      />
    </>
  ) : null;

  return (
    <main className="theme-page-shell flex min-h-screen flex-col">
      {/* Screen-reader narration for keyboard-driven article changes. */}
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

      {/* A finished psychoactive category: confetti plus the medallion card.
          When that same tick finished the whole corpus, FinishedState is the
          headline; the confetti still flies, the card stays home. */}
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
