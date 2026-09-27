"use client";

import Link from "next/link";
import { useEffect, useState, type Dispatch, type MouseEvent, type SetStateAction } from "react";

import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { TOUCH_ICON, TOUCH_PILL } from "@/components/ui/touchTargets";
import { PublicSegmentedTabs } from "@/components/layout/PublicSegmentedTabs";
import { TagToken } from "@/features/dev/components";
import { cn } from "@/lib/utils";
import {
  CITATION_PANEL_ID,
  Kbd,
  MOLECULE_PANEL_ID,
  OpenElsewhereItems,
  ProgressStrip,
  ReviewHelpPanel,
} from "./ReviewBarChrome";
import { ReviewOverflowSheet } from "./ReviewOverflowSheet";
import { ReviewQueueSettingsPanel } from "./ReviewQueueSettingsPanel";
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
  /** The article list, controlled so `/` can open it. */
  pickerOpen?: boolean;
  setPickerOpen?: (open: boolean) => void;
  /** Leaving goes through the unsaved-edit guard; a modified click still opens a tab. */
  onLeave: (event: MouseEvent<HTMLAnchorElement>) => void;
}

/**
 * The sticky bar over the article: where the reviewer is and how to move
 * (leave, previous, the article picker, next, the position in the queue), then
 * the workbench's tools (view, molecule, citations, inline editing, open in,
 * queue settings, trophies, help). The decisions about the article (hold,
 * notes, the tick) live in the review dock at the bottom of the screen.
 *
 * One row at every width. Below `lg` the tools fold into the More sheet, so a
 * phone's bar is previous, the picker, next and More; nothing is lost.
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
  pickerOpen,
  setPickerOpen,
  onLeave,
}: ReviewCommandBarProps) {
  const {
    settings: {
      order,
      unreviewedOnly,
      changedSinceReview,
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
    visibleQueue,
    flagFilteredQueue,
    availableFlagLabels,
    queueGroups,
    pickerGroups,
    position,
    current,
    reviewedCount,
    changedSinceReviewCount,
  } = queueState;
  const { celebration } = status;

  /**
   * Publish the bar's live height so the article's sticky contents and anchor
   * offsets sit under it (see `theme-review-article-scope`). A callback ref:
   * the bar mounts after the queue resolves.
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

  // One highlight pass over the progress fill for a finished subsection, two
  // for a finished category, keyed by the celebration so repeats re-run.
  const progressFlourish = celebration
    ? { id: celebration.id, kind: celebration.level === "group" ? ("lap" as const) : ("sweep" as const) }
    : null;
  // A settings surface that holds persistent, cross-session modes admits when
  // it is holding one.
  const settingsChanged =
    order !== REVIEW_SETTINGS_DEFAULTS.order ||
    unreviewedOnly !== REVIEW_SETTINGS_DEFAULTS.unreviewedOnly ||
    changedSinceReview !== REVIEW_SETTINGS_DEFAULTS.changedSinceReview ||
    groupByCategory !== REVIEW_SETTINGS_DEFAULTS.groupByCategory ||
    inlineEdit !== REVIEW_SETTINGS_DEFAULTS.inlineEdit ||
    articleLinks !== REVIEW_SETTINGS_DEFAULTS.articleLinks ||
    flagLabels.length > 0 ||
    flagSeverity !== null ||
    flagGroupBy !== "none";
  const inlineEditActive = inlineEdit && viewMode === "webpage" && canEditArticle;
  const inlineEditReason = !canEditArticle
    ? "Editor role required"
    : viewMode !== "webpage"
      ? "Inline editing applies to the Webpage view"
      : null;

  const resetSettings = () =>
    updateSettings({
      order: REVIEW_SETTINGS_DEFAULTS.order,
      unreviewedOnly: REVIEW_SETTINGS_DEFAULTS.unreviewedOnly,
      changedSinceReview: REVIEW_SETTINGS_DEFAULTS.changedSinceReview,
      groupByCategory: REVIEW_SETTINGS_DEFAULTS.groupByCategory,
      inlineEdit: REVIEW_SETTINGS_DEFAULTS.inlineEdit,
      articleLinks: REVIEW_SETTINGS_DEFAULTS.articleLinks,
      flagLabels: [],
      flagSeverity: null,
      flagGroupBy: "none",
    });

  const settingsPanel = (
    <ReviewQueueSettingsPanel
      order={order}
      statsState={statsState}
      groupByCategory={groupByCategory}
      unreviewedOnly={unreviewedOnly}
      changedSinceReview={changedSinceReview}
      changedSinceReviewCount={changedSinceReviewCount}
      inlineEdit={inlineEdit}
      articleLinks={articleLinks}
      viewMode={viewMode}
      flagLabels={flagLabels}
      flagSeverity={flagSeverity}
      flagGroupBy={flagGroupBy}
      availableFlagLabels={availableFlagLabels}
      updateSettings={updateSettings}
      settingsChanged={settingsChanged}
      resetSettings={resetSettings}
    />
  );

  /**
   * `onAfterChange` dismisses the More sheet: switching views replaces the
   * whole page under it. `labelsFrom` keeps the bar's tabs icon-only until
   * `xl` (sr-only keeps the names); the sheet always shows labels.
   */
  const renderViewTabs = (onAfterChange?: () => void, { compact = false }: { compact?: boolean } = {}) => (
    <PublicSegmentedTabs<ReviewViewMode>
      ariaLabel="Review view"
      listClassName="flex-nowrap"
      value={viewMode}
      onValueChange={(view) => {
        changeViewMode(view);
        onAfterChange?.();
      }}
      items={[
        {
          id: "webpage",
          label: compact ? <span className="sr-only xl:not-sr-only">Webpage</span> : "Webpage",
          icon: "lucide:globe",
        },
        {
          id: "editor",
          label: compact ? <span className="sr-only xl:not-sr-only">Editor</span> : "Editor",
          icon: "lucide:file-edit",
        },
      ]}
    />
  );

  const openElsewhereItems = <OpenElsewhereItems slug={current?.slug} />;
  // Filters change what the arrows walk, so they show as removable chips
  // under the bar rather than hide behind the settings dot.
  const activeFilters: Array<{ key: string; label: string; removeLabel: string; remove: () => void }> = [
    ...(unreviewedOnly ? [{ key: "unreviewed", label: "Unreviewed only", removeLabel: "Show reviewed articles again", remove: () => updateSettings({ unreviewedOnly: false }) }] : []),
    ...(changedSinceReview ? [{ key: "changed", label: "Changed since review", removeLabel: "Stop filtering to changed articles", remove: () => updateSettings({ changedSinceReview: false }) }] : []),
    ...(flagSeverity ? [{ key: "severity", label: `${flagSeverity.charAt(0).toUpperCase()}${flagSeverity.slice(1)} flags`, removeLabel: "Show every flag severity", remove: () => updateSettings({ flagSeverity: null }) }] : []),
    ...flagLabels.map((label) => ({ key: `label:${label}`, label: `Flag: ${label}`, removeLabel: `Stop filtering by the flag ${label}`, remove: () => updateSettings({ flagLabels: flagLabels.filter((value) => value !== label) }) })),
  ];
  const clearFilters = () => updateSettings({ unreviewedOnly: false, changedSinceReview: false, flagSeverity: null, flagLabels: [] });
  const shown = visibleQueue.length;
  const filtered = shown < queue.length;

  const toolButton = "gap-1.5 whitespace-nowrap";

  return (
    <header
      ref={setBarNode}
      aria-label="Review controls"
      className="theme-review-command-bar sticky top-0 z-40 border-b"
    >
      {/* The help popover's root spans the row so `?` can open it at any width;
          it anchors to the end of the row, which every width shows. */}
      <Popover open={helpOpen} onOpenChange={setHelpOpen}>
        <div className="mx-auto flex max-w-[1500px] flex-nowrap items-center gap-x-2 px-3 py-2 sm:gap-x-3 sm:px-5">
          <Button
            asChild
            variant="ghost"
            size="sm"
            className={cn("hidden shrink-0 gap-1.5 px-2 sm:inline-flex", TOUCH_PILL)}
          >
            <Link href="/dev" onClick={onLeave} title="Leave review for the editor">
              <Icon icon="lucide:arrow-left-to-line" size={16} />
              <span className="sr-only xl:not-sr-only">Leave review</span>
            </Link>
          </Button>

          <nav aria-label="Articles in the review queue" className="flex min-w-0 flex-1 items-center gap-1 sm:flex-none">
            <Button
              variant="outline"
              size="icon"
              className={cn("shrink-0", TOUCH_ICON)}
              onClick={goPrev}
              disabled={!canGoPrev}
              aria-label="Previous article"
              aria-keyshortcuts="ArrowLeft k"
              title="Previous article (← or K)"
            >
              <Icon icon="lucide:chevron-left" size={16} />
            </Button>

            <ReviewSubstancePicker
              entries={flagFilteredQueue}
              groups={pickerGroups}
              grouped={groupByCategory || effectiveFlagGroupBy !== "none" || changedSinceReview}
              current={current}
              onSelect={navigateTo}
              open={pickerOpen}
              onOpenChange={setPickerOpen}
            />

            <Button
              variant="outline"
              size="icon"
              className={cn("shrink-0", TOUCH_ICON)}
              onClick={goNext}
              disabled={!canGoNext}
              aria-label="Next article"
              aria-keyshortcuts="ArrowRight j"
              title="Next article (→ or J)"
            >
              <Icon icon="lucide:chevron-right" size={16} />
            </Button>

            {current && position >= 0 ? (
              <p className="theme-text-muted hidden shrink-0 whitespace-nowrap pl-1 text-xs tabular-nums sm:block">
                <span className="sr-only">Article </span>
                {(position + 1).toLocaleString()} of {shown.toLocaleString()}
                {filtered ? <span className="theme-text-faint"> shown</span> : null}
              </p>
            ) : null}
          </nav>

          <div className="ml-auto hidden items-center gap-1.5 lg:flex">
            {renderViewTabs(undefined, { compact: true })}

            <span aria-hidden className="mx-1 h-6 w-px bg-[var(--theme-border-subtle)]" />

            <Button
              variant={moleculePanelOpen ? "pillActive" : "ghost"}
              size="sm"
              className={cn(toolButton, TOUCH_PILL)}
              onClick={toggleMoleculePanel}
              disabled={!current}
              aria-expanded={moleculePanelOpen}
              aria-controls={MOLECULE_PANEL_ID}
              aria-keyshortcuts="m"
              title={moleculePanelOpen ? "Hide the molecule depiction editor (M)" : "Edit the molecule depiction here (M)"}
            >
              <Icon icon="lucide:hexagon" size={15} />
              <span className="sr-only xl:not-sr-only">Molecule</span>
              <span className="sr-only"> depiction editor</span>
              <Kbd className="hidden xl:inline">M</Kbd>
            </Button>

            <Button
              variant={citationPanelOpen ? "pillActive" : "ghost"}
              size="sm"
              className={cn(toolButton, TOUCH_PILL)}
              onClick={toggleCitationPanel}
              disabled={!current}
              aria-expanded={citationPanelOpen}
              aria-controls={CITATION_PANEL_ID}
              aria-keyshortcuts="c"
              title={citationPanelOpen ? "Hide the citation palette (C)" : "Sources and citation markers (C)"}
            >
              <Icon icon="lucide:book-marked" size={15} />
              <span className="sr-only xl:not-sr-only">Citation</span>
              <span className="sr-only"> palette</span>
              <Kbd className="hidden xl:inline">C</Kbd>
            </Button>

            <Button
              variant={inlineEditActive ? "iconWarning" : "ghost"}
              size="sm"
              className={cn(toolButton, TOUCH_PILL)}
              onClick={toggleInlineEdit}
              disabled={!current || inlineEditReason !== null}
              aria-pressed={inlineEditActive}
              aria-label="Inline editing"
              aria-keyshortcuts="e"
              title={
                inlineEditReason
                  ?? (inlineEditActive ? "Inline editing is on: clicking article text edits it (E)" : "Edit article text in place (E)")
              }
            >
              <Icon icon="lucide:pencil-line" size={15} />
              <span className="hidden xl:inline">Inline editing</span>
              <Kbd className="hidden xl:inline">E</Kbd>
            </Button>

            <span aria-hidden className="mx-1 h-6 w-px bg-[var(--theme-border-subtle)]" />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="iconGhost"
                  size="auto"
                  className={TOUCH_ICON}
                  title="Open this article in another tool"
                  aria-label="Open this article in another tool"
                >
                  <Icon icon="lucide:external-link" size={16} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">{openElsewhereItems}</DropdownMenuContent>
            </DropdownMenu>

            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="iconGhost"
                  size="auto"
                  className={cn("relative", TOUCH_ICON)}
                  title={settingsChanged ? "Queue settings (some are off their defaults)" : "Queue settings"}
                  aria-label="Queue settings"
                >
                  <Icon icon="lucide:settings-2" size={16} />
                  {settingsChanged ? (
                    <>
                      <span aria-hidden className="theme-review-settings-dot absolute right-1 top-1 h-1.5 w-1.5 rounded-full" />
                      <span className="sr-only">, some are off their defaults</span>
                    </>
                  ) : null}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" collisionPadding={8} className="max-h-[min(80dvh,40rem)] w-[22rem] overflow-y-auto">
                {settingsPanel}
              </PopoverContent>
            </Popover>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="iconGhost" size="auto" className={TOUCH_ICON} title="Class trophies" aria-label="Class trophies">
                  <Icon icon="lucide:trophy" size={16} />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80">
                <ReviewTrophyShelf groups={queueGroups} />
              </PopoverContent>
            </Popover>

            <PopoverTrigger asChild>
              <Button
                variant="iconGhost"
                size="auto"
                className={TOUCH_ICON}
                title="What counts as reviewed, and the keys (?)"
                aria-label="What counts as reviewed"
                aria-keyshortcuts="?"
              >
                <Icon icon="lucide:circle-help" size={16} />
              </Button>
            </PopoverTrigger>
          </div>

          <ReviewOverflowSheet
            reviewedCount={reviewedCount}
            total={queue.length}
            progressFlourish={progressFlourish}
            hasCurrent={current !== null}
            renderViewTabs={renderViewTabs}
            moleculePanelOpen={moleculePanelOpen}
            citationPanelOpen={citationPanelOpen}
            toggleMoleculePanel={toggleMoleculePanel}
            toggleCitationPanel={toggleCitationPanel}
            inlineEditActive={inlineEditActive}
            inlineEditReason={inlineEditReason}
            toggleInlineEdit={toggleInlineEdit}
            openElsewhereItems={openElsewhereItems}
            queueGroups={queueGroups}
            settingsPanel={settingsPanel}
            settingsChanged={settingsChanged}
            onLeave={onLeave}
            recommend={status.canRecommend}
          />
          <PopoverAnchor asChild>
            <span aria-hidden className="w-0 self-end" />
          </PopoverAnchor>
          <PopoverContent align="end" collisionPadding={8} className="max-h-[min(80dvh,40rem)] w-[min(24rem,calc(100vw-1rem))] overflow-y-auto">
            <ReviewHelpPanel recommend={status.canRecommend} />
          </PopoverContent>
        </div>
      </Popover>

      {activeFilters.length > 0 ? (
        <div
          role="group"
          aria-label={`Active filters, ${activeFilters.length}`}
          className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-1.5 px-3 pb-2 sm:px-5"
        >
          <span className="theme-text-muted text-xs">
            Queue filtered: {shown.toLocaleString()} of {queue.length.toLocaleString()} shown
          </span>
          {activeFilters.map((filter) => (
            <TagToken key={filter.key} variant="compact" label={filter.label} onRemove={filter.remove} removeLabel={filter.removeLabel} />
          ))}
          <Button type="button" variant="link" size="quiet" className="h-auto p-0 text-xs" onClick={clearFilters}>
            Clear all
          </Button>
        </div>
      ) : null}

      {inlineEditActive ? (
        <p className="theme-review-inline-edit-banner flex items-center gap-1.5 px-3 pb-1.5 text-xs lg:hidden">
          <Icon icon="lucide:pencil-line" size={12} aria-hidden />
          Inline editing is on: tapping article text edits it.
        </p>
      ) : null}

      {/* The full-width track welded to the bar's bottom edge. */}
      <ProgressStrip reviewed={reviewedCount} total={queue.length} variant="hairline" flourish={progressFlourish} />
    </header>
  );
}
