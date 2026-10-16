"use client";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { Icon } from "@/components/common/Icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Notice,
  EditorPanel,
  EditorPanelBody,
  TagToken,
  useConfirm,
  useDevShortcuts,
} from "@/features/dev/components";
import { OrderingPanel } from "@/features/dev/tools/contributors/OrderingPanel";
import { TOUCH_HALO_Y } from "@/components/ui/touchTargets";
import { cn } from "@/lib/utils";

import { IncomingTray } from "./IncomingTray";
import { ApplyPlaylistToDrugsAction } from "./ApplyPlaylistToDrugsAction";
import { KeyboardHints, REPLICATION_STUDIO_SHORTCUTS, ReplicationEditorDrawer } from "./ReplicationEditorDrawer";
import { PlaylistsPanel } from "./PlaylistsPanel";
import { ReplicationFacetRail } from "./ReplicationFacetRail";
import { ReplicationGrid, type StudioGridDensity } from "./ReplicationGrid";
import { ReplicationPlacementWorkspace } from "./ReplicationPlacementWorkspace";
import { SubstanceGalleryPanel } from "./SubstanceGalleryPanel";
import { ReplicationStudioLeaveDialogs } from "./ReplicationStudioLeaveDialogs";
import { ReplicationStudioWorkspaceNav } from "./ReplicationStudioWorkspaceNav";
import { readReplicationApiError } from "./replicationStudioApi";
import type { StudioGroupBy } from "./replicationStudioModel";
import { useFeaturedController } from "./useFeaturedController";
import { useLibraryController, useLibraryKeys, useLibraryLayout } from "./useLibraryController";
import { useReplicationCorpus } from "./useReplicationCorpus";
import { useReplicationIncoming } from "./useReplicationIncoming";
import { useReplicationSelection } from "./useReplicationSelection";
import { useShowcaseController } from "./useShowcaseController";
import { useStudioWorkspaces } from "./useStudioWorkspaces";

const FRAME_BOTTOM_GAP = 24;
const FRAME_MIN_HEIGHT = 560;

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
      className={cn("size-7 rounded-full [@media(pointer:coarse)]:size-9", TOUCH_HALO_Y)}
      onClick={onClick}
    >
      <Icon icon={icon} size={14} />
    </Button>
  );
}

export function ReplicationStudioTab({
  initialSubstanceSlug,
}: { initialSubstanceSlug?: string } = {}) {
  const corpus = useReplicationCorpus();
  useDevShortcuts(REPLICATION_STUDIO_SHORTCUTS);
  const { load, rows, effects, effectNames, artists, busy, feedback } = corpus;
  const library = useLibraryController({ rows, effectNames });
  const { query, group, visibleRows, filterCount } = library;
  const selection = useReplicationSelection({
    rows,
    visibleIds: library.visibleIds,
    setFeedback: corpus.setFeedback,
  });
  useLibraryKeys(library, selection);
  const workspaces = useStudioWorkspaces({ initialSubstanceSlug, guardDraft: selection.guardDraft });
  const activePanel = workspaces.active;
  const { confirm, dialog: confirmDialog } = useConfirm();
  const showcase = useShowcaseController({ rows, workspaces, confirm });
  const featured = useFeaturedController({
    active: activePanel === "featured",
    rows,
    visibleRows,
    setFeedback: corpus.setFeedback,
  });
  const incoming = useReplicationIncoming({
    rows,
    loadCorpus: corpus.reload,
    setFeedback: corpus.setFeedback,
    readError: readReplicationApiError,
    onUploaded: selection.reveal,
  });
  const [groupMenuOpen, setGroupMenuOpen] = useState(false);
  const isLibrary = activePanel === null;
  const hasSelection = selection.selection.size > 0;
  const layout = useLibraryLayout(hasSelection);
  const { railInColumn, drawerInColumn, inspectorColumn, railColumn } = layout;
  const [frameRef, frameHeight] = useViewportFrame(isLibrary && load.status === "ready");

  const openInLibrary = (slug: string) => {
    selection.inspectRow(slug);
    workspaces.request(null);
  };

  if (load.status === "loading") {
    return (
      <EditorPanel variant="empty" className="p-8 text-center text-sm">
        Loading the replication corpus
      </EditorPanel>
    );
  }

  if (load.status === "error") {
    return (
      <EditorPanel variant="danger">
        <EditorPanelBody className="space-y-3">
          <p className="text-sm">{load.message}</p>
          <Button type="button" onClick={() => void corpus.reload()}>
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
    onQueryChange: library.setQuery,
    group,
    facets: library.facets,
    onToggleFacet: library.toggleFacet,
    searchInputRef: library.searchRef,
  };
  const filtersPopover = (
    <Popover open={library.filtersOpen} onOpenChange={library.setFiltersOpen}>
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
          library.searchRef.current?.focus();
        }}
      >
        <ReplicationFacetRail {...railProps} layout="sheet" />
      </PopoverContent>
    </Popover>
  );

  const activeFilters = library.chips.length > 0 || query.trim() ? (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      {library.chips.map((chip) => (
        <TagToken
          key={`${chip.kind}:${chip.key}`}
          variant="compact"
          label={chip.label}
          removeLabel={`Remove filter ${chip.label}`}
          onRemove={() => library.toggleFacet(chip.kind, chip.key)}
        />
      ))}
      {query.trim() ? (
        <TagToken
          variant="compact"
          label={`“${query.trim()}”`}
          removeLabel="Clear search"
          onRemove={() => library.setQuery("")}
        />
      ) : null}
      <Button type="button" variant="ghost" size="sm" onClick={library.clearFilters}>
        Clear all
      </Button>
    </div>
  ) : null;

  const inspector = (placement: "column" | "sheet") => (
    <ReplicationEditorDrawer
      placement={placement}
      selected={selection.selectedRows}
      effects={effects}
      artists={artists}
      busy={busy}
      onSaveSingle={(row, draft) => void corpus.saveSingle(row, draft)}
      onApplyBulk={corpus.applyBulk}
      onPublish={corpus.publishRows}
      onDeselect={selection.clearSelection}
      onDirtyChange={selection.setEditorDirty}
      onOpenPlacement={(row) => showcase.openPlacement(row.id)}
    />
  );

  const incomingTray = (
    <IncomingTray
      items={incoming.incoming}
      duplicates={incoming.duplicates}
      waiting={incoming.waiting}
      effects={effects}
      artists={artists}
      busy={busy}
      onPatch={incoming.patchIncoming}
      onDiscard={incoming.discardIncoming}
      onClear={incoming.clearIncoming}
      onAdd={(item) => void incoming.addToLibrary(item)}
      onAddAll={() => void incoming.addAllToLibrary()}
      onPublish={(rows) =>
        confirm({
          title: `Publish ${rows.length} ${rows.length === 1 ? "work" : "works"}?`,
          description: "They go live on the public site: their effect galleries, permalinks and the replication collections.",
          confirmLabel: `Publish ${rows.length}`,
          affected: rows.map((row) => row.title || row.slug),
          onConfirm: async () => {
            await corpus.publishRows(rows);
          },
        })
      }
      onDismissWaiting={incoming.dismissWaiting}
    />
  );

  const libraryToolbar = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      {railColumn ? null : filtersPopover}
      <p className="theme-text-secondary shrink-0 text-xs tabular-nums" aria-live="polite">
        {visibleRows.length === rows.length
          ? `${rows.length} works`
          : `${visibleRows.length} of ${rows.length} shown`}
        {hasSelection ? (
          <span className="theme-accent-emphasis"> · {selection.selection.size} selected</span>
        ) : null}
      </p>
      {activeFilters}
      <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
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
                    library.setGroup(option.value);
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
          <ToggleIcon label="Grid view" icon="lucide:layout-grid" pressed={library.view === "grid"} onClick={() => library.setView("grid")} />
          <ToggleIcon label="List view" icon="lucide:list" pressed={library.view === "list"} onClick={() => library.setView("list")} />
        </ToggleGroup>
        {library.view === "grid" ? (
          <ToggleGroup label="Card size">
            {DENSITY_OPTIONS.map((option) => (
              <ToggleIcon
                key={option.value}
                label={option.label}
                icon={option.icon}
                pressed={library.density === option.value}
                onClick={() => library.setDensity(option.value)}
              />
            ))}
          </ToggleGroup>
        ) : null}
        {drawerInColumn ? (
          <ToggleIcon
            label="Keep the inspector open"
            icon="lucide:panel-right"
            pressed={layout.inspectorPinned}
            onClick={layout.toggleInspectorPinned}
          />
        ) : null}
        {inspectorColumn && !hasSelection ? null : (
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
        onRequestWorkspace={(next) => workspaces.request(next)}
        onReload={() => void corpus.reload()}
        onUpload={() => incoming.fileInputRef.current?.click()}
        onFiles={incoming.addFiles}
      />

      {feedback ? (
        <Notice placement="inline" tone={feedback.tone} dismiss={() => corpus.setFeedback(null)}>
          {feedback.message}
        </Notice>
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
            {incoming.incoming.length > 0 || incoming.waiting.length > 0 ? (
              <div className="max-h-[45%] shrink-0 overflow-y-auto">{incomingTray}</div>
            ) : null}
            <div className="min-h-0 flex-1">
              <ReplicationGrid
                ref={library.gridRef}
                groups={library.groups}
                selection={selection.selection}
                anchorId={selection.anchor}
                onCardActivate={selection.onCardActivate}
                view={library.view}
                density={library.density}
                hideEffect={group === "effect"}
                onClearFilters={filterCount > 0 ? library.clearFilters : undefined}
              />
            </div>
          </section>

          {inspectorColumn ? inspector("column") : null}
        </div>
      ) : (
        <div className={cn("grid gap-4", railInColumn && "grid-cols-[15rem_minmax(0,1fr)]")}>
          {railInColumn ? <ReplicationFacetRail {...railProps} layout="sticky" /> : null}

          <div className="min-w-0 space-y-4">
            {incomingTray}
            {railInColumn ? null : filtersPopover}
            {activeFilters}

            {activePanel === "featured" ? (
              featured.loaded ? (
                <OrderingPanel
                  icon="lucide:star"
                  title="Featured on the Effect Index homepage"
                  description={
                    (featured.curated
                      ? "The carousel plays these replications in this order. "
                      : "Nothing is stored yet, so these are the checked-in defaults the homepage is running on right now; saving records them. ") +
                    "Everything below the divider is not featured, and follows the studio's current search and filters."
                  }
                  items={featured.items}
                  order={featured.order}
                  savedOrder={featured.savedOrder}
                  emptyLabel="No replications match the current filters."
                  saveState={featured.saveState}
                  onOrderChange={featured.setOrder}
                  onSave={() => void featured.save()}
                  onReset={featured.reset}
                />
              ) : (
                <p className="theme-text-muted text-sm">Loading the featured selection</p>
              )
            ) : null}

            {activePanel === "playlists" ? (
              <PlaylistsPanel
                allRows={rows}
                filteredRows={visibleRows}
                onDirtyChange={workspaces.setPlaylistDirty}
                renderSavedPlaylistAction={(playlist) => (
                  <ApplyPlaylistToDrugsAction
                    playlist={playlist}
                    onReviewGallery={showcase.reviewArticle}
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
                    const active = showcase.mode === mode.value;
                    return (
                      <Button
                        key={mode.value}
                        type="button"
                        size="sm"
                        variant={active ? "pillActive" : "quiet"}
                        aria-pressed={active}
                        className={cn("rounded-full", !active && "theme-text-muted")}
                        onClick={() => showcase.requestMode(mode.value)}
                      >
                        <Icon icon={mode.icon} size={15} />
                        {mode.label}
                      </Button>
                    );
                  })}
                </ToggleGroup>

                {showcase.mode === "drug" ? (
                  <SubstanceGalleryPanel
                    substanceSlug={initialSubstanceSlug ?? null}
                    onNavigateToSubstance={showcase.openArticle}
                    corpusRows={rows}
                    visibleRows={visibleRows}
                    railNarrowed={filterCount > 0}
                    onInspectRow={openInLibrary}
                    onOpenLibrary={() => workspaces.request(null)}
                    onDirtyChange={workspaces.setShowcaseDirty}
                  />
                ) : (
                  <ReplicationPlacementWorkspace
                    row={showcase.placementRow}
                    rows={visibleRows}
                    onChooseRow={showcase.choosePlacementRow}
                    onOpenInLibrary={(id) => {
                      const row = rows.find((entry) => entry.id === id);
                      if (row) openInLibrary(row.slug);
                      else workspaces.request(null);
                    }}
                    onDirtyChange={workspaces.setShowcaseDirty}
                  />
                )}
              </>
            ) : null}
          </div>
        </div>
      )}

      {isLibrary && !railInColumn && hasSelection ? (
        <div className="theme-replication-sheet fixed inset-y-0 right-0 z-[60] w-full border-l sm:w-[26rem]">
          {inspector("sheet")}
        </div>
      ) : null}

      <ReplicationStudioLeaveDialogs
        {...workspaces.leaveDialogs}
        pendingDraftDiscard={selection.pendingDiscard}
        onCancelDraftDiscard={selection.cancelDiscard}
        onConfirmDraftDiscard={selection.confirmDiscard}
      />
      {confirmDialog}

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
            They wait in the Incoming tray. Publishing puts them live on the public site.
          </p>
        </div>
      </div>
    </div>
  );
}
