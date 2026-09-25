"use client";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { Icon } from "@/components/common/Icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  ActionNotice,
  EditorPanel,
  EditorPanelBody,
  TagToken,
} from "@/features/dev/components";
import { OrderingPanel } from "@/features/dev/tools/contributors/OrderingPanel";
import { cn } from "@/lib/utils";

import { IncomingTray } from "./IncomingTray";
import { ApplyPlaylistToDrugsAction } from "./ApplyPlaylistToDrugsAction";
import { KeyboardHints, ReplicationEditorDrawer } from "./ReplicationEditorDrawer";
import { PlaylistsPanel } from "./PlaylistsPanel";
import { ReplicationFacetRail } from "./ReplicationFacetRail";
import {
  ReplicationGrid,
  type StudioGridDensity,
  type StudioGridView,
} from "./ReplicationGrid";
import { ReplicationPlacementWorkspace } from "./ReplicationPlacementWorkspace";
import { SubstanceGalleryPanel } from "./SubstanceGalleryPanel";
import {
  ReplicationStudioLeaveDialogs,
  type PendingPlaylistLeave,
} from "./ReplicationStudioLeaveDialogs";
import {
  ReplicationStudioWorkspaceNav,
  type StudioWorkspace,
} from "./ReplicationStudioWorkspaceNav";
import {
  EMPTY_STUDIO_FACETS,
  type StudioGroupBy,
} from "./replicationStudioModel";
import { useReplicationStudioController } from "./useReplicationStudioController";

/** Bottom breathing room under the frame: the dev shell's own `py-6`. */
const FRAME_BOTTOM_GAP = 24;
/** Under this the frame stops shrinking and the page scrolls instead. */
const FRAME_MIN_HEIGHT = 560;

/**
 * The Library is a workspace, not a document: its frame runs from wherever
 * the shell chrome ends to the bottom of the viewport, and the rail, grid,
 * and inspector each scroll inside it. Measured rather than hard-coded
 * because the chrome above it changes height with the rail and breakpoints.
 */
function useViewportFrame(enabled: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | null>(null);
  useLayoutEffect(() => {
    if (!enabled) return;
    const node = ref.current;
    if (!node) return;
    const measure = () => {
      const top = node.getBoundingClientRect().top + window.scrollY;
      setHeight(Math.max(FRAME_MIN_HEIGHT, Math.round(window.innerHeight - top - FRAME_BOTTOM_GAP)));
    };
    measure();
    window.addEventListener("resize", measure);
    // The chrome above settles after first paint (session, rail badges, fonts).
    const observer =
      typeof ResizeObserver === "undefined" || !node.parentElement
        ? null
        : new ResizeObserver(measure);
    if (observer && node.parentElement?.parentElement) observer.observe(node.parentElement.parentElement);
    return () => {
      window.removeEventListener("resize", measure);
      observer?.disconnect();
    };
  }, [enabled]);
  return [ref, height] as const;
}

const GROUP_OPTIONS: { value: StudioGroupBy; label: string }[] = [
  { value: "none", label: "None" },
  { value: "effect", label: "Effect" },
  { value: "artist", label: "Artist" },
  { value: "type", label: "Type" },
];

const DENSITY_OPTIONS: { value: StudioGridDensity; label: string; icon: string }[] = [
  { value: "compact", label: "Small cards", icon: "lucide:grid-3x3" },
  { value: "comfortable", label: "Medium cards", icon: "lucide:grid-2x2" },
  { value: "large", label: "Large cards", icon: "lucide:square" },
];

/** A row of icon toggles sharing one rounded well. */
function ToggleGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex items-center gap-0.5 rounded-full border border-[color:var(--editor-panel-border)] bg-[var(--editor-panel-bg-subtle)] p-0.5"
    >
      {children}
    </div>
  );
}

function ToggleIcon({
  label,
  icon,
  pressed,
  onClick,
}: {
  label: string;
  icon: string;
  pressed: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      size="icon"
      variant={pressed ? "pillActive" : "quiet"}
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      className="size-7 rounded-full [@media(pointer:coarse)]:size-11"
      onClick={onClick}
    >
      <Icon icon={icon} size={14} />
    </Button>
  );
}

export function ReplicationStudioTab({
  initialSubstanceSlug,
}: { initialSubstanceSlug?: string } = {}) {
  const controller = useReplicationStudioController(initialSubstanceSlug);
  const {
    load,
    rows,
    effects,
    query,
    group,
    facets,
    selection,
    anchor,
    busy,
    feedback,
    activePanel,
    featuredOrder,
    savedFeatured,
    featuredCurated,
    featuredLoaded,
    featuredSaveState,
    pendingLeave,
    filtersOpen,
    railInColumn,
    drawerInColumn,
    searchRef,
    gridRef,
    effectNames,
    artists,
    visibleRows,
    groups,
    selectedRows,
    featuredItems,
    chips,
    filterCount,
    incoming,
    pendingDiscard,
    showcaseMode,
    placementRow,
    galleryDirty,
  } = controller;
  const [playlistDirty, setPlaylistDirty] = useState(false);
  const [pendingPlaylistLeave, setPendingPlaylistLeave] = useState<PendingPlaylistLeave | null>(
    null,
  );
  const [view, setView] = useState<StudioGridView>("grid");
  const [density, setDensity] = useState<StudioGridDensity>("comfortable");
  const [groupMenuOpen, setGroupMenuOpen] = useState(false);
  const isLibrary = activePanel === null;
  const hasSelection = selection.size > 0;
  // From lg the inspector is always a column. Between lg and xl there is room
  // for two columns beside the grid, not three, so while something is
  // selected the rail makes way (it folds into the toolbar's filter popover)
  // and comes back when the selection clears. Under lg it is a sheet.
  const inspectorColumn = drawerInColumn || (railInColumn && hasSelection);
  const railColumn = railInColumn && (drawerInColumn || !hasSelection);
  const [frameRef, frameHeight] = useViewportFrame(isLibrary && load.status === "ready");

  const requestWorkspace = (next: StudioWorkspace) => {
    if (activePanel === next) return;
    if (activePanel === "substances") {
      controller.requestLeaveSubstances(next === "playlists" || next === "featured" ? next : null);
      return;
    }
    if (activePanel === "playlists" && playlistDirty) {
      setPendingPlaylistLeave({ kind: "workspace", next });
      return;
    }
    controller.guardDraft(() => {
      setPlaylistDirty(false);
      controller.setActivePanel(next);
    });
  };
  const requestReviewGallery = (substanceSlug: string) => {
    if (activePanel === "playlists" && playlistDirty) {
      setPendingPlaylistLeave({ kind: "review", substanceSlug });
      return;
    }
    controller.navigateToSubstance(substanceSlug);
  };
  const clearFilters = () => {
    controller.setFacets(EMPTY_STUDIO_FACETS);
    controller.setQuery("");
  };

  if (load.status === "loading") {
    return (
      <EditorPanel variant="empty" className="p-8 text-center text-sm">
        Loading the replication corpus…
      </EditorPanel>
    );
  }

  if (load.status === "error") {
    return (
      <EditorPanel variant="danger">
        <EditorPanelBody className="space-y-3">
          <p className="text-sm">{load.message}</p>
          <Button type="button" onClick={() => void controller.loadCorpus()}>
            Try again
          </Button>
        </EditorPanelBody>
      </EditorPanel>
    );
  }

  const railProps = {
    rows,
    effectNames,
    query,
    onQueryChange: controller.setQuery,
    group,
    facets,
    onToggleFacet: controller.toggleFacet,
    searchInputRef: searchRef,
  };
  const filtersPopover = (
    <Popover open={filtersOpen} onOpenChange={controller.setFiltersOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="glass" size="sm" className="shrink-0">
          <Icon icon="lucide:sliders-horizontal" size={15} />
          Search &amp; filters
          {filterCount > 0 ? <Badge variant="secondary">{filterCount}</Badge> : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[min(22rem,calc(100vw-2rem))] p-0"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          searchRef.current?.focus();
        }}
      >
        <ReplicationFacetRail {...railProps} layout="sheet" />
      </PopoverContent>
    </Popover>
  );

  const activeFilters = chips.length > 0 || query.trim() ? (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      {chips.map((chip) => (
        <TagToken
          key={`${chip.kind}:${chip.key}`}
          variant="compact"
          label={chip.label}
          removeLabel={`Remove filter ${chip.label}`}
          onRemove={() => controller.toggleFacet(chip.kind, chip.key)}
        />
      ))}
      {query.trim() ? (
        <TagToken
          variant="compact"
          label={`“${query.trim()}”`}
          removeLabel="Clear search"
          onRemove={() => controller.setQuery("")}
        />
      ) : null}
      <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
        Clear all
      </Button>
    </div>
  ) : null;

  const inspector = (placement: "column" | "sheet") => (
    <ReplicationEditorDrawer
      placement={placement}
      selected={selectedRows}
      effects={effects}
      artists={artists}
      busy={busy}
      onSaveSingle={(row, draft) => void controller.saveSingle(row, draft)}
      onApplyBulk={(targets, edit) => void controller.applyBulk(targets, edit)}
      onDeselect={controller.clearSelection}
      onDirtyChange={controller.setEditorDirty}
      onOpenPlacement={(row) => controller.openPlacement(row.id)}
    />
  );

  const libraryToolbar = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      {railColumn ? null : filtersPopover}
      <p className="theme-text-secondary shrink-0 font-mono text-xs tabular-nums" aria-live="polite">
        {visibleRows.length === rows.length
          ? `${rows.length} works`
          : `${visibleRows.length} of ${rows.length} shown`}
        {selection.size > 0 ? (
          <span className="theme-accent-emphasis"> · {selection.size} selected</span>
        ) : null}
      </p>
      {activeFilters}
      <div className="ml-auto flex items-center gap-2">
        <Popover open={groupMenuOpen} onOpenChange={setGroupMenuOpen}>
          <PopoverTrigger asChild>
            <Button type="button" variant="ghost" size="sm" aria-label={`Group by ${group === "none" ? "nothing" : group}`}>
              <Icon icon="lucide:rows-3" size={15} />
              <span className="theme-text-faint">Group</span>
              {GROUP_OPTIONS.find((option) => option.value === group)?.label}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-44 p-1">
            <div role="menu" aria-label="Group by">
              {GROUP_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  role="menuitemradio"
                  aria-checked={group === option.value}
                  variant="listItem"
                  size="sm"
                  onClick={() => {
                    controller.setGroup(option.value);
                    setGroupMenuOpen(false);
                  }}
                >
                  <Icon icon="lucide:check" size={14} className={group === option.value ? undefined : "invisible"} />
                  {option.label}
                </Button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
        <ToggleGroup label="View">
          <ToggleIcon label="Grid view" icon="lucide:layout-grid" pressed={view === "grid"} onClick={() => setView("grid")} />
          <ToggleIcon label="List view" icon="lucide:list" pressed={view === "list"} onClick={() => setView("list")} />
        </ToggleGroup>
        {view === "grid" ? (
          <ToggleGroup label="Card size">
            {DENSITY_OPTIONS.map((option) => (
              <ToggleIcon
                key={option.value}
                label={option.label}
                icon={option.icon}
                pressed={density === option.value}
                onClick={() => setDensity(option.value)}
              />
            ))}
          </ToggleGroup>
        ) : null}
        {drawerInColumn ? null : (
          <Popover>
            <PopoverTrigger asChild>
              <Button type="button" variant="ghost" size="icon" className="size-8 max-md:hidden" aria-label="Keyboard shortcuts" title="Keyboard shortcuts">
                <Icon icon="lucide:keyboard" size={16} />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-64">
              <KeyboardHints />
            </PopoverContent>
          </Popover>
        )}
      </div>
    </div>
  );

  return (
    <div
      ref={frameRef}
      className="flex flex-col gap-3"
      style={isLibrary && frameHeight ? { height: frameHeight } : undefined}
    >
      <ReplicationStudioWorkspaceNav
        activePanel={activePanel}
        rowCount={rows.length}
        artistCount={artists.length}
        effectCount={new Set(rows.map((row) => row.effect_slug).filter(Boolean)).size}
        busy={busy}
        fileInputRef={incoming.fileInputRef}
        onRequestWorkspace={requestWorkspace}
        onReload={() => void controller.loadCorpus()}
        onUpload={() => incoming.fileInputRef.current?.click()}
        onFiles={incoming.addFiles}
      />

      {feedback ? (
        <ActionNotice tone={feedback.tone} onDismiss={() => controller.setFeedback(null)}>
          {feedback.message}
        </ActionNotice>
      ) : null}

      {isLibrary ? (
        <div
          className={cn(
            "grid min-h-0 flex-1 gap-4",
            railColumn && !inspectorColumn && "grid-cols-[15rem_minmax(0,1fr)]",
            railColumn && inspectorColumn && "grid-cols-[15rem_minmax(0,1fr)_24rem]",
            !railColumn && inspectorColumn && "grid-cols-[minmax(0,1fr)_24rem]",
          )}
        >
          {railColumn ? <ReplicationFacetRail {...railProps} layout="column" /> : null}

          <section aria-label="Library" className="flex min-h-0 min-w-0 flex-col gap-3">
            {libraryToolbar}
            {incoming.incoming.length > 0 ? (
              <div className="max-h-[45%] shrink-0 overflow-y-auto">
                <IncomingTray
                  items={incoming.incoming}
                  effects={effects}
                  artists={artists}
                  onPatch={incoming.patchIncoming}
                  onDiscard={incoming.discardIncoming}
                  onClear={incoming.clearIncoming}
                  onAdd={(item) => void incoming.addToLibrary(item)}
                />
              </div>
            ) : null}
            <div className="min-h-0 flex-1">
              <ReplicationGrid
                ref={gridRef}
                groups={groups}
                selection={selection}
                anchorId={anchor}
                onCardActivate={controller.onCardActivate}
                view={view}
                density={density}
                hideEffect={group === "effect"}
                onClearFilters={filterCount > 0 ? clearFilters : undefined}
              />
            </div>
          </section>

          {inspectorColumn ? inspector("column") : null}
        </div>
      ) : (
        <div className={cn("grid gap-4", railInColumn && "grid-cols-[15rem_minmax(0,1fr)]")}>
          {railInColumn ? <ReplicationFacetRail {...railProps} layout="sticky" /> : null}

          <div className="min-w-0 space-y-4">
            {railInColumn ? null : filtersPopover}
            {activeFilters}

            {activePanel === "featured" ? (
              featuredLoaded ? (
                <OrderingPanel
                  icon="lucide:star"
                  title="Featured on the Effect Index homepage"
                  description={
                    (featuredCurated
                      ? "The carousel plays these replications in this order. "
                      : "Nothing is stored yet, so these are the checked-in defaults the homepage is running on right now; saving records them. ") +
                    "Everything below the divider is not featured, and follows the studio's current search and filters."
                  }
                  items={featuredItems}
                  order={featuredOrder}
                  savedOrder={savedFeatured}
                  emptyLabel="No replications match the current filters."
                  saveState={featuredSaveState}
                  onOrderChange={(next) => {
                    controller.setFeaturedOrder(next);
                    controller.setFeaturedSaveState("idle");
                  }}
                  onSave={() => void controller.saveFeatured()}
                  onReset={() => {
                    controller.setFeaturedOrder(savedFeatured);
                    controller.setFeaturedSaveState("idle");
                  }}
                />
              ) : (
                <p className="theme-text-muted text-sm">Loading the featured selection…</p>
              )
            ) : null}

            {activePanel === "playlists" ? (
              <PlaylistsPanel
                allRows={rows}
                filteredRows={visibleRows}
                onDirtyChange={setPlaylistDirty}
                renderSavedPlaylistAction={(playlist) => (
                  <ApplyPlaylistToDrugsAction
                    playlist={playlist}
                    onReviewGallery={requestReviewGallery}
                  />
                )}
              />
            ) : null}

            {activePanel === "substances" ? (
              <>
                <ToggleGroup label="Showcase view">
                  {(
                    [
                      { value: "drug", label: "By drug article", icon: "lucide:pill" },
                      { value: "replication", label: "By replication", icon: "lucide:image" },
                    ] as const
                  ).map((mode) => {
                    const active = showcaseMode === mode.value;
                    return (
                      <Button
                        key={mode.value}
                        type="button"
                        size="sm"
                        variant={active ? "pillActive" : "quiet"}
                        aria-pressed={active}
                        disabled={!active && galleryDirty}
                        title={!active && galleryDirty ? "Save or discard your changes first" : undefined}
                        className={cn("rounded-full", !active && "theme-text-muted")}
                        onClick={() => controller.setShowcaseMode(mode.value)}
                      >
                        <Icon icon={mode.icon} size={15} />
                        {mode.label}
                      </Button>
                    );
                  })}
                </ToggleGroup>

                {showcaseMode === "drug" ? (
                  <SubstanceGalleryPanel
                    substanceSlug={initialSubstanceSlug ?? null}
                    onNavigateToSubstance={controller.navigateToSubstance}
                    corpusRows={rows}
                    visibleRows={visibleRows}
                    railNarrowed={filterCount > 0}
                    onInspectRow={(slug) => {
                      controller.inspectRow(slug);
                      controller.requestLeaveSubstances(null);
                    }}
                    onOpenLibrary={() => controller.requestLeaveSubstances(null)}
                    onDirtyChange={controller.setGalleryDirty}
                  />
                ) : (
                  <ReplicationPlacementWorkspace
                    row={placementRow}
                    rows={visibleRows}
                    onChooseRow={controller.setPlacementRowId}
                    onOpenInLibrary={(id) => {
                      const row = rows.find((entry) => entry.id === id);
                      if (row) controller.inspectRow(row.slug);
                      controller.requestLeaveSubstances(null);
                    }}
                    onDirtyChange={controller.setGalleryDirty}
                  />
                )}
              </>
            ) : null}
          </div>
        </div>
      )}

      {/* Under lg the inspector is a non-modal sheet over the grid's right
          edge (the whole screen on a phone): Esc or the close button hands
          the space back. */}
      {isLibrary && !railInColumn && hasSelection ? (
        <div className="theme-replication-sheet fixed inset-y-0 right-0 z-[60] w-full border-l sm:w-[26rem]">
          {inspector("sheet")}
        </div>
      ) : null}

      <ReplicationStudioLeaveDialogs
        pendingPlaylistLeave={pendingPlaylistLeave}
        pendingShowcaseLeave={pendingLeave}
        onCancelPlaylistLeave={() => setPendingPlaylistLeave(null)}
        onConfirmPlaylistLeave={() => {
          const pending = pendingPlaylistLeave;
          setPendingPlaylistLeave(null);
          setPlaylistDirty(false);
          if (pending?.kind === "review") {
            controller.navigateToSubstance(pending.substanceSlug);
          } else {
            controller.setActivePanel(pending?.next ?? null);
          }
        }}
        onCancelShowcaseLeave={() => controller.setPendingLeave(null)}
        onConfirmShowcaseLeave={() => {
          if (pendingLeave) controller.leaveSubstances(pendingLeave.next);
        }}
        pendingDraftDiscard={pendingDiscard !== null}
        onCancelDraftDiscard={() => controller.setPendingDiscard(null)}
        onConfirmDraftDiscard={controller.confirmDiscard}
      />

      <div
        aria-hidden={!incoming.dragging}
        className={cn(
          "pointer-events-none fixed inset-0 z-50 flex items-center justify-center theme-replication-overlay-scrim transition-opacity",
          incoming.dragging ? "opacity-100" : "opacity-0",
        )}
      >
        <div className="rounded-2xl theme-replication-overlay-card border px-8 py-6 text-center">
          <p className="theme-text-primary font-display text-lg font-semibold">
            Drop images, videos, or MP3s
          </p>
          <p className="theme-text-muted text-sm">
            They land in the Incoming tray before anything is written.
          </p>
        </div>
      </div>
    </div>
  );
}
