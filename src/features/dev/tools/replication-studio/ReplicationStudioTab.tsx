"use client";

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
  EditorSegmentedControl,
  TagToken,
} from "@/features/dev/components";
import { OrderingPanel } from "@/features/dev/tools/contributors/OrderingPanel";
import { cn } from "@/lib/utils";

import { IncomingTray } from "./IncomingTray";
import { ReplicationEditorDrawer } from "./ReplicationEditorDrawer";
import { PlaylistsPanel } from "./PlaylistsPanel";
import { ReplicationFacetRail } from "./ReplicationFacetRail";
import { ReplicationGrid } from "./ReplicationGrid";
import { SubstanceGalleryPanel } from "./SubstanceGalleryPanel";
import {
  EMPTY_STUDIO_FACETS,
  activeFacetCount,
} from "./replicationStudioModel";
import {
  useReplicationStudioController,
  type ReplicationCentreView,
} from "./useReplicationStudioController";

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
    busy,
    feedback,
    activePanel,
    featuredOrder,
    savedFeatured,
    featuredCurated,
    featuredLoaded,
    featuredSaveState,
    centreView,
    pendingLeave,
    filtersOpen,
    railInColumn,
    searchRef,
    drawerRef,
    effectNames,
    artists,
    visibleRows,
    groups,
    selectedRows,
    featuredItems,
    chips,
    showcaseVisible,
    filterCount,
    incoming,
  } = controller;

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
      <header className="flex flex-wrap items-center gap-3">
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
        <div className="flex-1" />
        <Button
          type="button"
          variant={activePanel === "featured" ? "accent" : "ghost"}
          size="sm"
          aria-expanded={activePanel === "featured"}
          onClick={() => {
            if (activePanel === "featured") {
              controller.setActivePanel(null);
              return;
            }
            if (activePanel === "substances") {
              controller.requestLeaveSubstances("featured");
              return;
            }
            controller.setActivePanel("featured");
          }}
        >
          <Icon icon="lucide:star" size={15} />
          Featured
        </Button>
        <Button
          type="button"
          variant={activePanel === "playlists" ? "accent" : "ghost"}
          size="sm"
          aria-expanded={activePanel === "playlists"}
          onClick={() => {
            if (activePanel === "playlists") {
              controller.setActivePanel(null);
              return;
            }
            if (activePanel === "substances") {
              controller.requestLeaveSubstances("playlists");
              return;
            }
            controller.setActivePanel("playlists");
          }}
        >
          <Icon icon="lucide:list-music" size={15} />
          Playlists
        </Button>
        <Button
          type="button"
          variant={activePanel === "substances" ? "accent" : "ghost"}
          size="sm"
          aria-expanded={activePanel === "substances"}
          onClick={() => {
            if (activePanel === "substances") {
              controller.requestLeaveSubstances(null);
              return;
            }
            controller.setActivePanel("substances");
          }}
        >
          <Icon icon="lucide:images" size={15} />
          Substances
        </Button>
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

      {activePanel === "featured" ? (
        <EditorPanel>
          <EditorPanelBody>
            {featuredLoaded ? (
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
            )}
          </EditorPanelBody>
        </EditorPanel>
      ) : null}

      {activePanel === "playlists" ? (
        <EditorPanel>
          <EditorPanelBody>
            <PlaylistsPanel items={featuredItems} />
          </EditorPanelBody>
        </EditorPanel>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)] xl:grid-cols-[16rem_minmax(0,1fr)_22rem]">
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
          {activePanel === "substances" ? (
            <>
              <EditorSegmentedControl
                label="Substances portal view"
                options={[
                  { value: "showcase", label: "Showcase", icon: "lucide:images" },
                  { value: "library", label: "Library", icon: "lucide:library" },
                ]}
                value={centreView}
                onChange={(value) => controller.setCentreView(value as ReplicationCentreView)}
              />
              <div className={cn(showcaseVisible ? "space-y-4" : "hidden")}>
                <SubstanceGalleryPanel
                  substanceSlug={initialSubstanceSlug ?? null}
                  onNavigateToSubstance={controller.navigateToSubstance}
                  visibleRows={visibleRows}
                  railNarrowed={filterCount > 0}
                  onInspectRow={controller.inspectRow}
                  onOpenLibrary={controller.openLibrary}
                  onDirtyChange={controller.setGalleryDirty}
                />
              </div>
            </>
          ) : null}

          <div className={cn("space-y-4", showcaseVisible && "hidden")}>
            <IncomingTray
              items={incoming.incoming}
              effects={effects}
              artists={artists}
              onPatch={incoming.patchIncoming}
              onDiscard={incoming.discardIncoming}
              onClear={incoming.clearIncoming}
              onAdd={(item) => void incoming.addToLibrary(item)}
            />

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
              groups={groups}
              selection={selection}
              onCardActivate={controller.onCardActivate}
            />
          </div>
        </main>

        <div ref={drawerRef} className="min-w-0">
          <ReplicationEditorDrawer
            selected={selectedRows}
            effects={effects}
            artists={artists}
            busy={busy}
            onSaveSingle={(row, draft) => void controller.saveSingle(row, draft)}
            onApplyBulk={(targets, edit) => void controller.applyBulk(targets, edit)}
            onDeselect={controller.clearSelection}
          />
        </div>
      </div>

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
              This board has curation that was never saved. Leaving now throws it away — the article
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
