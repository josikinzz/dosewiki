"use client";

import Link from "next/link";
import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { TOUCH_ICON, TOUCH_PILL } from "@/components/ui/touchTargets";
import { PublicSegmentedTabs } from "@/components/layout/PublicSegmentedTabs";
import { EditorNotice } from "@/features/dev/components";
import { cn } from "@/lib/utils";
import {
  CITATION_PANEL_ID,
  Kbd,
  MarkReviewedControl,
  MOLECULE_PANEL_ID,
  OpenElsewhereItems,
  ProgressStrip,
  ReviewHelpPanel,
} from "./ReviewBarChrome";
import { ReviewOverflowSheet } from "./ReviewOverflowSheet";
import { ReviewQueueSettingsPanel } from "./ReviewQueueSettingsPanel";
import { REVIEW_FLAGS_UI } from "./reviewQueue";
import { REVIEW_SETTINGS_DEFAULTS, type ReviewViewMode } from "./reviewSettings";
import { ReviewSubstancePicker } from "./ReviewSubstancePicker";
import { ReviewTrophyShelf } from "./ReviewTrophyShelf";
import type { ReviewQueueState } from "./useReviewQueue";
import type { ReviewSettingsState } from "./useReviewSettings";
import type { ReviewStatusWrites } from "./useReviewWrites";

interface ReviewCommandBarProps {
  settings: ReviewSettingsState;
  queue: ReviewQueueState;
  status: ReviewStatusWrites;
  navigateTo: (slug: string) => void;
  goPrev: () => void;
  goNext: () => void;
  canGoPrev: boolean;
  canGoNext: boolean;
  moleculePanelOpen: boolean;
  citationPanelOpen: boolean;
  toggleMoleculePanel: () => void;
  toggleCitationPanel: () => void;
  toggleInlineEdit: () => void;
  /** Editor floor: inline edits update only the private local article preview. */
  canEditArticle: boolean;
  helpOpen: boolean;
  setHelpOpen: Dispatch<SetStateAction<boolean>>;
}

/**
 * The sticky command bar over the article. Three clusters rather than eleven
 * evenly-spaced children: navigate (where am I / move), judge (how am I doing
 * / what do I say about this one), configure (how is the workbench set up).
 * Tight gaps inside a cluster, a wide one between them, so the eye parses
 * three things instead of re-reading eleven.
 *
 * One row is a hard requirement at every width — a wrapped bar reads as
 * broken chrome — so the Configure cluster collapses in tiers while Navigate
 * stays intact: below `2xl` the open-in / settings / help buttons fold into
 * the overflow sheet and the view tabs go icon-only; below `lg` the tabs and
 * the M / C panel pills fold in too, leaving just the ellipsis. Below `sm` it
 * is the phone row — ← article →, the verdict, overflow — and Back to Dev
 * Tools folds into the sheet: flipping articles is the loop, leaving the
 * workbench is not. Everything a tier drops is in the overflow sheet, nothing
 * is lost.
 */
export function ReviewCommandBar({
  settings: settingsState,
  queue: queueState,
  status,
  navigateTo,
  goPrev,
  goNext,
  canGoPrev,
  canGoNext,
  moleculePanelOpen,
  citationPanelOpen,
  toggleMoleculePanel,
  toggleCitationPanel,
  toggleInlineEdit,
  canEditArticle,
  helpOpen,
  setHelpOpen,
}: ReviewCommandBarProps) {
  const {
    settings: {
      order,
      unreviewedOnly,
      viewMode,
      inlineEdit,
      groupByCategory,
      articleLinks,
      flagLabels,
      flagSeverity,
      flagGroupBy,
    },
    effectiveFlagGroupBy,
    updateSettings,
    changeViewMode,
  } = settingsState;
  const {
    statsState,
    queue,
    flagFilteredQueue,
    availableFlagLabels,
    queueGroups,
    pickerGroups,
    current,
    reviewedCount,
  } = queueState;
  const { isTicking, tickError, lastTick, celebration, toggleReviewed, toggleFlagged } =
    status;

  /**
   * Publish the bar's live height so everything calibrated against it stays
   * correct as it grows an error row or collapses to the mobile row.
   *
   * Two things downstream depend on it: the article's own `scroll-mt-6` (sized
   * for the public site, where the header does not stick, so every TOC anchor
   * would otherwise land underneath this bar) and `StickyTocLayout`'s
   * `top-24` (which the bar can overtake when a notice or mobile edit banner
   * makes it taller than the public-site header).
   *
   * A callback ref rather than `useRef`: the bar mounts after the queue
   * resolves, well past the workbench's first commit.
   */
  const [barNode, setBarNode] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (!barNode || typeof ResizeObserver === "undefined") return;
    const publish = () => {
      document.documentElement.style.setProperty(
        "--review-bar-height",
        `${Math.round(barNode.getBoundingClientRect().height)}px`,
      );
    };
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(barNode);
    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty("--review-bar-height");
    };
  }, [barNode]);

  const isCurrentReviewed = current?.status === "completed";
  const isCurrentFlagged = current?.status === "in_progress";
  // One highlight pass over the progress fill for a finished subsection, two
  // for a finished category. Keyed by the celebration id so back-to-back
  // finishes re-run the animation.
  const progressFlourish = celebration
    ? {
        id: celebration.id,
        kind: celebration.level === "group" ? ("lap" as const) : ("sweep" as const),
      }
    : null;
  // A settings surface that hides four persistent, cross-session modes has to
  // admit when it is holding one. Without this the gear looks identical whether
  // the queue is filtered or not.
  const settingsChanged =
    order !== REVIEW_SETTINGS_DEFAULTS.order ||
    unreviewedOnly !== REVIEW_SETTINGS_DEFAULTS.unreviewedOnly ||
    groupByCategory !== REVIEW_SETTINGS_DEFAULTS.groupByCategory ||
    inlineEdit !== REVIEW_SETTINGS_DEFAULTS.inlineEdit ||
    articleLinks !== REVIEW_SETTINGS_DEFAULTS.articleLinks ||
    (REVIEW_FLAGS_UI &&
      (flagLabels.length > 0 || flagSeverity !== null || flagGroupBy !== "none"));
  // Inline editing turns body text into local draft inputs, never public autosave.
  // A mode that changes what a click *does* cannot live only inside a popover,
  // so it owns a pill beside M and C whose warning tone announces it while it
  // is on. The pill stays keycap-compact in both states: a label-width toggle
  // would push the 2xl tier past the row's 1500px cap and stack the view tabs.
  const inlineEditActive = inlineEdit && viewMode === "webpage" && canEditArticle;

  const settingsPanel = (
    <ReviewQueueSettingsPanel
      order={order}
      statsState={statsState}
      groupByCategory={groupByCategory}
      unreviewedOnly={unreviewedOnly}
      inlineEdit={inlineEdit}
      articleLinks={articleLinks}
      viewMode={viewMode}
      flagLabels={flagLabels}
      flagSeverity={flagSeverity}
      flagGroupBy={flagGroupBy}
      availableFlagLabels={availableFlagLabels}
      updateSettings={updateSettings}
    />
  );

  /**
   * `onAfterChange` dismisses the mobile overflow sheet: switching Webpage /
   * Editor replaces the whole page underneath it, and leaving the sheet open
   * over the result reads as if the tap did nothing.
   */
  const renderViewTabs = (
    onAfterChange?: () => void,
    // In the bar the tabs run icon-only until `2xl` (sr-only keeps the names
    // for screen readers); the overflow sheet always shows full labels.
    // `nowrap` pins the pair to one line: the TabsList default is flex-wrap,
    // and inside the bar's nowrap row a width squeeze stacks the two pills
    // vertically — a second row by the back door.
    { labelsFrom2Xl = false, nowrap = false }: { labelsFrom2Xl?: boolean; nowrap?: boolean } = {},
  ) => (
    <PublicSegmentedTabs<ReviewViewMode>
      ariaLabel="Review view"
      listClassName={nowrap ? "flex-nowrap" : undefined}
      value={viewMode}
      onValueChange={(view) => {
        changeViewMode(view);
        onAfterChange?.();
      }}
      items={[
        {
          id: "webpage",
          label: labelsFrom2Xl ? (
            <span className="sr-only 2xl:not-sr-only">Webpage</span>
          ) : (
            "Webpage"
          ),
          icon: "lucide:globe",
        },
        {
          id: "editor",
          label: labelsFrom2Xl ? (
            <span className="sr-only 2xl:not-sr-only">Editor</span>
          ) : (
            "Editor"
          ),
          icon: "lucide:file-edit",
        },
      ]}
    />
  );

  const openElsewhereItems = <OpenElsewhereItems slug={current?.slug} />;

  const markReviewedControl = (
    <MarkReviewedControl
      isCurrentReviewed={isCurrentReviewed}
      justTicked={lastTick?.slug === current?.slug}
      hasCurrent={current !== null}
      isTicking={isTicking}
      toggleReviewed={toggleReviewed}
    />
  );

  return (
    <header
      ref={setBarNode}
      aria-label="Review controls"
      className="theme-review-command-bar sticky top-0 z-40 border-b"
    >
      {/* Cluster gaps tighten below xl: the bar gained a fixed-width picker
          and a citation button, and at laptop widths the old 1.5rem gaps
          pushed the Configure cluster onto a second line. One row is a hard
          requirement — a wrapped bar reads as broken chrome. */}
      <div className="mx-auto flex max-w-[1500px] flex-nowrap items-center gap-x-3 px-3 py-2 sm:gap-x-4 sm:px-5 xl:gap-x-6">
        {/* Navigate — ← and → flank the article they move between, so the
            pair reads as one control instead of sitting 500px apart. */}
        <div className="flex min-w-0 flex-1 items-center gap-1 sm:flex-none">
          <Button
            asChild
            variant="iconGhost"
            size="auto"
            className={cn("hidden sm:inline-flex", TOUCH_ICON)}
            title="Back to Dev Tools"
          >
            <Link href="/dev" aria-label="Back to Dev Tools">
              <Icon icon="lucide:arrow-left-to-line" size={16} />
            </Link>
          </Button>

          <Button
            variant="glass"
            size="pill"
            className={cn(
              "px-2.5 [@media(pointer:coarse)]:min-w-11 sm:ml-1 sm:px-3.5",
              TOUCH_PILL,
            )}
            onClick={goPrev}
            disabled={!canGoPrev}
            aria-label="Previous article"
            title="Previous article (←)"
          >
            <Icon icon="lucide:chevron-left" size={16} />
            <Kbd>←</Kbd>
          </Button>

          <ReviewSubstancePicker
            entries={flagFilteredQueue}
            groups={pickerGroups}
            grouped={groupByCategory || effectiveFlagGroupBy !== "none"}
            current={current}
            onSelect={navigateTo}
          />

          <Button
            variant="glass"
            size="pill"
            className={cn(
              "px-2.5 [@media(pointer:coarse)]:min-w-11 sm:px-3.5",
              TOUCH_PILL,
            )}
            onClick={goNext}
            disabled={!canGoNext}
            aria-label="Next article"
            title="Next article (→)"
          >
            <Kbd>→</Kbd>
            <Icon icon="lucide:chevron-right" size={16} />
          </Button>
        </div>

        {/* Judge — the flag and the verdict this page exists for. */}
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant={isCurrentFlagged ? "iconWarning" : "iconGhost"}
            size="auto"
            className={cn("hidden md:inline-flex", TOUCH_ICON)}
            onClick={toggleFlagged}
            disabled={!current || isTicking}
            aria-pressed={isCurrentFlagged}
            title={
              isCurrentFlagged
                ? "Flagged as in progress — click to clear (F)"
                : "Flag as in progress — can't finish it now (F)"
            }
          >
            <Icon icon="lucide:flag" size={15} />
          </Button>

          {/* Both states occupy one width, so ticking an article never
              reflows the row (or, on a phone, changes how many rows there
              are) under the reviewer's finger. */}
          <div className="flex justify-center sm:min-w-[11.5rem]">
            {markReviewedControl}
          </div>
        </div>

        {/* Configure — the workbench's own settings, kept away from the
            article controls. The open-in menu lives here rather than beside
            the picker, where its chevron read as a second article list. */}
        <div className="ml-auto hidden items-center gap-1.5 lg:flex">
          {renderViewTabs(undefined, { labelsFrom2Xl: true, nowrap: true })}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="iconGhost"
                size="auto"
                className={cn("hidden 2xl:inline-flex", TOUCH_ICON)}
                title="Open this article in…"
                aria-label="Open this article in another tool"
              >
                <Icon icon="lucide:external-link" size={15} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {openElsewhereItems}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant={moleculePanelOpen ? "pillActive" : "pill"}
            size="pill"
            className={TOUCH_PILL}
            onClick={toggleMoleculePanel}
            disabled={!current}
            aria-expanded={moleculePanelOpen}
            aria-controls={MOLECULE_PANEL_ID}
            aria-label="Molecule depiction editor"
            title={
              moleculePanelOpen
                ? "Hide the molecule depiction editor (M)"
                : "Edit the molecule depiction inline (M)"
            }
          >
            <Icon icon="lucide:hexagon" size={14} />
            <Kbd>M</Kbd>
          </Button>

          <Button
            variant={citationPanelOpen ? "pillActive" : "pill"}
            size="pill"
            className={TOUCH_PILL}
            onClick={toggleCitationPanel}
            disabled={!current}
            aria-expanded={citationPanelOpen}
            aria-controls={CITATION_PANEL_ID}
            aria-label="Citation palette"
            title={
              citationPanelOpen
                ? "Hide the citation palette (C)"
                : "Sources and citation markers (C)"
            }
          >
            <Icon icon="lucide:book-marked" size={14} />
            <Kbd>C</Kbd>
          </Button>

          <Button
            variant={inlineEditActive ? "iconWarning" : "pill"}
            size="pill"
            className={TOUCH_PILL}
            onClick={toggleInlineEdit}
            disabled={!current || viewMode !== "webpage" || !canEditArticle}
            aria-pressed={inlineEditActive}
            aria-label="Inline editing"
            title={
              !canEditArticle
                ? "Editor role required"
                : viewMode !== "webpage"
                  ? "Inline editing applies to the Webpage view"
                  : inlineEditActive
                    ? "Inline editing is on — clicking article text edits it (E)"
                    : "Edit article text inline (E)"
            }
          >
            <Icon icon="lucide:pencil-line" size={14} />
            <Kbd>E</Kbd>
          </Button>

          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="iconGhost"
                size="auto"
                className={cn("relative hidden 2xl:inline-flex", TOUCH_ICON)}
                title={
                  settingsChanged
                    ? "Queue settings — some are off their defaults"
                    : "Queue settings"
                }
                aria-label="Queue settings"
              >
                <Icon icon="lucide:settings-2" size={16} />
                {settingsChanged ? (
                  <span
                    aria-hidden
                    className="theme-review-settings-dot absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full"
                  />
                ) : null}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72">
              {settingsPanel}
            </PopoverContent>
          </Popover>

          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="iconGhost"
                size="auto"
                className={cn("hidden 2xl:inline-flex", TOUCH_ICON)}
                title="Class trophies"
                aria-label="Class trophies"
              >
                <Icon icon="lucide:trophy" size={15} />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80">
              <ReviewTrophyShelf groups={queueGroups} />
            </PopoverContent>
          </Popover>

          <Popover open={helpOpen} onOpenChange={setHelpOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="iconGhost"
                size="auto"
                className={cn("hidden 2xl:inline-flex", TOUCH_ICON)}
                title="What counts as reviewed? (?)"
                aria-label="What counts as reviewed"
              >
                <Icon icon="lucide:circle-help" size={16} />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80">
              <ReviewHelpPanel />
            </PopoverContent>
          </Popover>
        </div>

        <ReviewOverflowSheet
          reviewedCount={reviewedCount}
          total={queue.length}
          progressFlourish={progressFlourish}
          hasCurrent={current !== null}
          isCurrentFlagged={isCurrentFlagged}
          isTicking={isTicking}
          toggleFlagged={toggleFlagged}
          renderViewTabs={renderViewTabs}
          moleculePanelOpen={moleculePanelOpen}
          citationPanelOpen={citationPanelOpen}
          toggleMoleculePanel={toggleMoleculePanel}
          toggleCitationPanel={toggleCitationPanel}
          openElsewhereItems={openElsewhereItems}
          queueGroups={queueGroups}
          settingsPanel={settingsPanel}
          settingsChanged={settingsChanged}
        />
      </div>

      {inlineEditActive ? (
        <div className="theme-review-inline-edit-banner px-3 pb-1.5 text-[11px] sm:hidden">
          <Icon icon="lucide:pencil-line" size={11} className="mr-1 inline" />
          Inline editing is on — tapping article text edits it.
        </div>
      ) : null}

      {tickError ? (
        <div className="mx-auto max-w-[1500px] px-3 pb-2 sm:px-5">
          <EditorNotice
            notice={{ tone: "danger", message: tickError, live: true }}
          />
        </div>
      ) : null}

      {/* The bar's one progress presentation at every width: the full-width
          track welded to its bottom edge, at zero cost in row height. The
          labelled numbers live in the overflow sheet and, from `2xl` where
          the sheet is gone, in the track's hover title. */}
      <ProgressStrip
        reviewed={reviewedCount}
        total={queue.length}
        variant="hairline"
        flourish={progressFlourish}
      />
    </header>
  );
}
