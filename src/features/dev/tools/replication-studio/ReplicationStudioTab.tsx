"use client";
import { useEffect, useState } from "react";

import { Icon } from "@/components/common/Icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { ReplicationEditorDrawer } from "./ReplicationEditorDrawer";
import { PlaylistsPanel } from "./PlaylistsPanel";
import { ReplicationFacetRail } from "./ReplicationFacetRail";
import { ReplicationGrid } from "./ReplicationGrid";
import { SubstanceGalleryPanel } from "./SubstanceGalleryPanel";
import {
  EMPTY_STUDIO_FACETS,
  activeFacetCount,
} from "./replicationStudioModel";
import { useReplicationStudioController } from "./useReplicationStudioController";

type StudioWorkspace = "featured" | "playlists" | "substances" | null;

type PendingPlaylistLeave =
  | { kind: "workspace"; next: StudioWorkspace }
  | { kind: "review"; substanceSlug: string };

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
    drawerRef,
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
  } = controller;
  const [playlistDirty, setPlaylistDirty] = useState(false);
  const [pendingPlaylistLeave, setPendingPlaylistLeave] = useState<PendingPlaylistLeave | null>(
    null,
  );

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
    setPlaylistDirty(false);
    controller.setActivePanel(next);
  };
  const requestReviewGallery = (substanceSlug: string) => {
    if (activePanel === "playlists" && playlistDirty) {
      setPendingPlaylistLeave({ kind: "review", substanceSlug });
      return;
    }
    controller.navigateToSubstance(substanceSlug);
  };

  // Under xl the editor sits below the grid box rather than beside it, so
  // opening a selection brings it into view; beside the grid it is already
  // on screen.
  const hasSelection = selection.size > 0;
  useEffect(() => {
    if (drawerInColumn || !hasSelection || activePanel !== null) return;
    drawerRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [activePanel, drawerInColumn, drawerRef, hasSelection]);

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

  return (
    <div className="space-y-4">
      <header className="space-y-3">
        <div className="flex flex-wrap items-baseline gap-3">
          <div className="flex items-baseline gap-2">
            <h2 className="theme-accent-emphasis font-display text-xl font-semibold">
              Replication Studio
            </h2>
            <span className="theme-text-faint text-xs uppercase tracking-[0.24em]">dev tool</span>
          </div>
          <p className="theme-text-faint font-mono text-xs">
            {rows.length} rows · {artists.length} artists ·{" "}
            {new Set(rows.map((row) => row.effect_slug).filter(Boolean)).size} effects
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-y border-[color:var(--editor-panel-border)] py-2">
          <nav aria-label="Replication Studio workspace" className="flex flex-wrap items-center gap-1">
            <Button
              type="button"
              variant={activePanel === null ? "accent" : "ghost"}
              size="sm"
              aria-current={activePanel === null ? "page" : undefined}
              onClick={() => requestWorkspace(null)}
            >
              <Icon icon="lucide:library" size={15} />
              Library
            </Button>
            <Button
              type="button"
              variant={activePanel === "playlists" ? "accent" : "ghost"}
              size="sm"
              aria-current={activePanel === "playlists" ? "page" : undefined}
              onClick={() => requestWorkspace("playlists")}
            >
              <Icon icon="lucide:list-music" size={15} />
              Playlists
            </Button>
            <Button
              type="button"
              variant={activePanel === "substances" ? "accent" : "ghost"}
              size="sm"
              aria-current={activePanel === "substances" ? "page" : undefined}
              onClick={() => requestWorkspace("substances")}
            >
              <Icon icon="lucide:images" size={15} />
              Drug galleries
            </Button>
          </nav>
          <div className="h-5 w-px bg-[var(--editor-panel-border)]" aria-hidden="true" />
          <Button
            type="button"
            variant={activePanel === "featured" ? "secondary" : "quiet"}
            size="sm"
            aria-current={activePanel === "featured" ? "page" : undefined}
            onClick={() => requestWorkspace("featured")}
          >
            <Icon icon="lucide:star" size={15} />
            Featured
          </Button>
          <div className="flex-1" />
          {activePanel === null ? (
            <>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => void controller.loadCorpus()}
              >
                <Icon icon="lucide:refresh-cw" size={15} />
                Reload
              </Button>
              <Button
                type="button"
                variant="accent"
                size="sm"
                onClick={() => incoming.fileInputRef.current?.click()}
              >
                <Icon icon="lucide:upload" size={15} />
                Upload
              </Button>
            </>
          ) : null}
        </div>
        <input
          ref={incoming.fileInputRef}
          type="file"
          multiple
          accept="image/*,video/*,audio/mpeg,.mp3"
          className="sr-only"
          onChange={(event) => {
            incoming.addFiles(event.target.files);
            event.target.value = "";
          }}
        />
      </header>

      {feedback ? (
        <ActionNotice tone={feedback.tone} onDismiss={() => controller.setFeedback(null)}>
          {feedback.message}
        </ActionNotice>
      ) : null}

      <div
        className={cn(
          "grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]",
          activePanel === null && "xl:grid-cols-[16rem_minmax(0,1fr)_22rem]",
        )}
      >
        {railInColumn ? (
          <ReplicationFacetRail
            rows={rows}
            effectNames={effectNames}
            query={query}
            onQueryChange={controller.setQuery}
            group={group}
            onGroupChange={controller.setGroup}
            facets={facets}
            onToggleFacet={controller.toggleFacet}
            searchInputRef={searchRef}
          />
        ) : (
          <Popover open={filtersOpen} onOpenChange={controller.setFiltersOpen}>
            <PopoverTrigger asChild>
              <Button type="button" variant="glass" size="sm" className="w-full justify-between">
                <span className="flex items-center gap-2">
                  <Icon icon="lucide:sliders-horizontal" size={15} />
                  Search &amp; filters
                </span>
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
              <ReplicationFacetRail
                rows={rows}
                effectNames={effectNames}
                query={query}
                onQueryChange={controller.setQuery}
                group={group}
                onGroupChange={controller.setGroup}
                facets={facets}
                onToggleFacet={controller.toggleFacet}
                searchInputRef={searchRef}
              />
            </PopoverContent>
          </Popover>
        )}

        <main className="min-w-0 space-y-4">
          {chips.length > 0 || query.trim() ? (
            <div className="flex flex-wrap items-center gap-1.5">
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
              {activeFacetCount(facets) > 1 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    controller.setFacets(EMPTY_STUDIO_FACETS);
                    controller.setQuery("");
                  }}
                >
                  Clear all
                </Button>
              ) : null}
            </div>
          ) : null}

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
          ) : null}

          {activePanel === null ? (
            <>
              <IncomingTray
                items={incoming.incoming}
                effects={effects}
                artists={artists}
                onPatch={incoming.patchIncoming}
                onDiscard={incoming.discardIncoming}
                onClear={incoming.clearIncoming}
                onAdd={(item) => void incoming.addToLibrary(item)}
              />

              {selection.size > 0 ? (
                <EditorPanel variant="toolbar" className="flex flex-wrap items-center gap-2 px-3 py-2">
                  <span className="theme-text-primary font-mono text-sm">{selection.size} selected</span>
                  <Badge variant="secondary">bulk</Badge>
                  <div className="flex-1" />
                  <Button
                    type="button"
                    variant="glass"
                    size="sm"
                    disabled={busy}
                    onClick={controller.markSelectionAsFigure}
                  >
                    Mark as figure
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={controller.clearSelection}>
                    Deselect
                  </Button>
                </EditorPanel>
              ) : null}

              <div className="flex items-center justify-between">
                <span className="theme-text-faint font-mono text-xs">
                  {visibleRows.length} of {rows.length} shown
                </span>
                <span className="theme-text-faint text-xs">
                  {group === "none" ? "Ungrouped" : `Grouped by ${group} · ${groups.length} groups`}
                </span>
              </div>

              <ReplicationGrid
                ref={gridRef}
                groups={groups}
                selection={selection}
                anchorId={anchor}
                onCardActivate={controller.onCardActivate}
              />

              {!drawerInColumn && hasSelection ? (
                <div ref={drawerRef} className="min-w-0">
                  <ReplicationEditorDrawer
                    placement="below"
                    selected={selectedRows}
                    effects={effects}
                    artists={artists}
                    busy={busy}
                    onSaveSingle={(row, draft) => void controller.saveSingle(row, draft)}
                    onApplyBulk={(targets, edit) => void controller.applyBulk(targets, edit)}
                    onDeselect={controller.clearSelection}
                  />
                </div>
              ) : null}
            </>
          ) : null}
        </main>

        {activePanel === null && drawerInColumn ? (
          <div ref={drawerRef} className="min-w-0">
            <ReplicationEditorDrawer
              placement="aside"
              selected={selectedRows}
              effects={effects}
              artists={artists}
              busy={busy}
              onSaveSingle={(row, draft) => void controller.saveSingle(row, draft)}
              onApplyBulk={(targets, edit) => void controller.applyBulk(targets, edit)}
              onDeselect={controller.clearSelection}
            />
          </div>
        ) : null}
      </div>
      <Dialog
        open={pendingPlaylistLeave !== null}
        onOpenChange={(open) => {
          if (!open) setPendingPlaylistLeave(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Leave Playlists with unsaved changes?</DialogTitle>
            <DialogDescription>
              The open playlist has changes that were never saved. Leaving this workspace discards
              them.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setPendingPlaylistLeave(null)}>
              Keep editing
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                const pending = pendingPlaylistLeave;
                setPendingPlaylistLeave(null);
                setPlaylistDirty(false);
                if (pending?.kind === "review") {
                  controller.navigateToSubstance(pending.substanceSlug);
                } else {
                  controller.setActivePanel(pending?.next ?? null);
                }
              }}
            >
              Discard changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={pendingLeave !== null}
        onOpenChange={(open) => {
          if (!open) controller.setPendingLeave(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Leave the showcase with unsaved changes?</DialogTitle>
            <DialogDescription>
              This board has curation that was never saved. Leaving now throws it away; the article
              keeps whatever is already stored.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => controller.setPendingLeave(null)}>
              Keep editing
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                if (pendingLeave) controller.leaveSubstances(pendingLeave.next);
              }}
            >
              Discard changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div
        aria-hidden={!incoming.dragging}
        className={cn(
          "pointer-events-none fixed inset-0 z-50 flex items-center justify-center theme-replication-overlay-scrim transition-opacity",
          incoming.dragging ? "opacity-100" : "opacity-0",
        )}
      >
        <div className="rounded-2xl theme-replication-overlay-card border px-8 py-6 text-center">
          <h3 className="theme-accent-emphasis font-display text-lg font-semibold">
            Drop images, videos, or MP3s
          </h3>
          <p className="theme-text-muted text-sm">
            They land in the Incoming tray before anything is written.
          </p>
        </div>
      </div>
    </div>
  );
}
