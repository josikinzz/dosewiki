"use client";

import { useEffect, useRef } from "react";

import { Icon } from "@/components/common/Icon";
import { SkeletonPulse } from "@/components/layout/PublicFeedbackPrimitives";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyStateSurface, InteractiveContentCard } from "@/components/ui/surface";
import { TOUCH_ICON } from "@/components/ui/touchTargets";
import {
  ActionNotice,
  DiffSurface,
  EditorActionStatus,
  EditorSection,
  EditorStatusPill,
  EditorToolbar,
  LoadErrorState,
} from "@/features/dev/components";
import { SHOWCASE_WORK_CAP } from "@/features/replications/components/showcaseWork";

import { GalleryBoardList } from "./GalleryBoardList";
import { GalleryMatchIdentity } from "./GalleryMatchIdentity";
import { GalleryLibraryAdd } from "./GalleryLibraryAdd";
import { GalleryPicker } from "./GalleryPicker";
import { ApplyPlaylistMenu } from "./ApplyPlaylistMenu";
import { GalleryStagePreview } from "./GalleryStagePreview";
import type { StudioRow } from "./replicationStudioModel";
import type {
  GalleryConflict,
  GalleryCurationState,
  GalleryMatch,
} from "./substanceGalleryPortalModel";
import { useSubstanceGalleryController } from "./useSubstanceGalleryController";

function conflictDiffText(conflict: GalleryConflict, mine: GalleryCurationState): string {
  const lines: string[] = [];
  const blocks = [
    { label: "curated_slugs", theirs: conflict.curated_slugs, ours: mine.curated },
    { label: "removed_slugs", theirs: conflict.removed_slugs, ours: mine.removed },
  ];
  for (const { label, theirs, ours } of blocks) {
    lines.push(
      `# ${label} — server, saved ${conflict.updated_at.slice(0, 19).replace("T", " ")} by ${
        conflict.updated_by ?? "unknown"
      }`,
    );
    if (theirs.length === 0) lines.push("  (empty)");
    theirs.forEach((slug, index) => {
      lines.push(`${ours[index] === slug ? " " : "-"}${String(index + 1).padStart(3)} ${slug}`);
    });
    lines.push(`# ${label} — your unsaved draft`);
    if (ours.length === 0) lines.push("  (empty)");
    ours.forEach((slug, index) => {
      lines.push(`${theirs[index] === slug ? " " : "+"}${String(index + 1).padStart(3)} ${slug}`);
    });
  }
  return lines.join("\n");
}

function BoardSkeleton() {
  return (
    <div aria-hidden className="space-y-2">
      {Array.from({ length: 6 }, (_, index) => (
        <div
          key={index}
          className="flex items-center gap-3 rounded-lg border border-[color:var(--editor-chip-border)] p-2"
        >
          <SkeletonPulse width="w-5" height="h-5" tone="strong" className="rounded-md" />
          <SkeletonPulse width="w-14" height="h-14" className="shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <SkeletonPulse width="w-1/2" height="h-3.5" tone="strong" />
            <SkeletonPulse width="w-1/3" height="h-3" />
            <SkeletonPulse width="w-2/5" height="h-3" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ExcludedRow({
  match,
  onRestore,
}: {
  match: GalleryMatch;
  onRestore: (slug: string) => void;
}) {
  return (
    <li className="list-none">
      <InteractiveContentCard variant="public" padding="sm" radius="lg" className="opacity-70">
        <div className="flex items-center gap-3">
          <GalleryMatchIdentity match={match} />
          <Button
            variant="secondary"
            size="sm"
            className="shrink-0"
            aria-label={`Restore ${match.replication.title} to the default order`}
            onClick={() => onRestore(match.replication.slug)}
          >
            <Icon icon="lucide:undo-2" size={14} />
            Restore
          </Button>
        </div>
      </InteractiveContentCard>
    </li>
  );
}

export type SubstanceGalleryPanelProps = {
  substanceSlug: string | null;
  onNavigateToSubstance: (slug: string) => void;
  visibleRows: readonly StudioRow[];
  corpusRows: readonly StudioRow[];
  railNarrowed: boolean;
  onInspectRow: (slug: string) => void;
  onOpenLibrary: () => void;
  onDirtyChange: (dirty: boolean) => void;
};

export function SubstanceGalleryPanel({
  substanceSlug,
  onNavigateToSubstance,
  corpusRows,
  visibleRows,
  railNarrowed,
  onInspectRow,
  onOpenLibrary,
  onDirtyChange,
}: SubstanceGalleryPanelProps) {
  const controller = useSubstanceGalleryController({
    substanceSlug,
    corpusRows,
    onNavigateToSubstance,
    onDirtyChange,
  });
  const {
    candidates,
    candidatesState,
    detailState,
    detail,
    curation,
    isDirty,
    expectedUpdatedAt,
    savedBy,
    conflict,
    saveState,
    feedback,
    excludedOpen,
    previewOpen,
    pendingSlug,
    focusSlug,
    announcement,
    matches,
    board,
    effectiveOrder,
    provenance,
    matchedSlugs,
    unknownRightsOnStage,
    exclusionCount,
    exclusionLimit,
    overExclusionLimit,
    shelfFocusToken,
    undoable,
    redoable,
  } = controller;

  /**
   * Excluding the last row in a band leaves no neighbour to receive focus, so
   * the controller bumps a token and the shelf toggle — the nearest thing the
   * action produced — takes it instead of the document body.
   */
  const shelfToggleRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (shelfFocusToken === 0) return;
    shelfToggleRef.current?.focus({ preventScroll: true });
  }, [shelfFocusToken]);

  return (
    <EditorSection
      headingLevel="h3"
      icon="lucide:images"
      title="Substance Replication Showcases"
      description={`Exact-drug, permitted class, and final Visual Disconnection stills appear automatically. Stored curation controls priority, direct standalone associations, and per-article exclusions. The article shows the first ${SHOWCASE_WORK_CAP} works in the effective policy order.`}
    >
      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <GalleryPicker
          candidates={candidates}
          currentSlug={substanceSlug}
          onSelect={controller.handleSelectSubstance}
          status={candidatesState.status}
        />
        {detail ? (
          <>
            <EditorStatusPill tone={board.filledSlots > 0 ? "info" : "neutral"}>
              {`${board.filledSlots} of ${board.cap} article slots filled · ${board.publishedCount} published · ${board.candidateCount} automatic`}
            </EditorStatusPill>
            <div className="min-w-0">
              <p className="theme-text-muted font-mono text-xs">
                {provenance.specificDrug} specific drug · {provenance.generalClass} general class ·{" "}
                {provenance.visualDisconnection} visual fallback · {provenance.manual} manual
              </p>
            </div>
          </>
        ) : null}
      </div>

      {candidatesState.status === "error" ? (
        <LoadErrorState message={candidatesState.message} onRetry={controller.retryCandidates} />
      ) : null}

      {detail ? (
        <EditorToolbar variant="split">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="accent"
              size="sm"
              disabled={!isDirty || saveState === "saving" || overExclusionLimit}
              onClick={() => void controller.persist(curation, expectedUpdatedAt)}
            >
              <Icon icon="lucide:save" size={15} />
              Save gallery
            </Button>
            <ApplyPlaylistMenu
              key={substanceSlug}
              corpusRows={corpusRows}
              onApply={controller.handleApplyPlaylist}
            />
            <Button
              type="button"
              variant="glass"
              size="icon"
              className={`h-8 w-8 ${TOUCH_ICON}`}
              disabled={!undoable}
              aria-label="Undo the last curation change"
              title="Undo (Cmd/Ctrl+Z)"
              onClick={controller.handleUndo}
            >
              <Icon icon="lucide:undo-2" size={15} />
            </Button>
            <Button
              type="button"
              variant="glass"
              size="icon"
              className={`h-8 w-8 ${TOUCH_ICON}`}
              disabled={!redoable}
              aria-label="Redo the last undone curation change"
              title="Redo (Cmd/Ctrl+Shift+Z)"
              onClick={controller.handleRedo}
            >
              <Icon icon="lucide:redo-2" size={15} />
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={!isDirty || saveState === "saving"}
              onClick={controller.handleDiscard}
            >
              <Icon icon="lucide:rotate-ccw" size={15} />
              Discard changes
            </Button>
            {expectedUpdatedAt ? (
              <span className="theme-text-faint text-xs">
                Last saved {expectedUpdatedAt.slice(0, 10)} by {savedBy ?? "unknown"}
              </span>
            ) : (
              <span className="theme-text-faint text-xs">
                No stored ordering or exclusion delta yet. Automatic placements still publish.
              </span>
            )}
          </div>
          {saveState === "idle" || saveState === "saved" ? (
            <EditorStatusPill tone={isDirty ? "warning" : "neutral"}>
              {isDirty ? "Unsaved changes" : "Gallery saved"}
            </EditorStatusPill>
          ) : (
            <EditorActionStatus status={saveState} />
          )}
        </EditorToolbar>
      ) : null}

      {overExclusionLimit ? (
        <ActionNotice tone="danger">
          This gallery excludes {exclusionCount} works and the limit is {exclusionLimit}, so it will
          not save. Restore some from the Excluded shelf, or use Exclude everywhere on the junk so it
          leaves every gallery at once instead of filling this one.
        </ActionNotice>
      ) : null}

      {feedback ? (
        <ActionNotice tone={feedback.tone} onDismiss={() => controller.setFeedback(null)}>
          {feedback.message}
        </ActionNotice>
      ) : null}

      {conflict ? (
        <DiffSurface
          title="This gallery changed on the server"
          diffText={conflictDiffText(conflict, curation)}
          maxHeight="18rem"
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="accent"
                size="sm"
                disabled={saveState === "saving"}
                onClick={controller.handleKeepMine}
              >
                <Icon icon="lucide:upload" size={14} />
                Keep mine
              </Button>
              <Button type="button" variant="secondary" size="sm" onClick={controller.handleTakeTheirs}>
                <Icon icon="lucide:download" size={14} />
                Take theirs
              </Button>
            </div>
          }
        />
      ) : null}

      {detail && unknownRightsOnStage > 0 ? (
        <ActionNotice tone="warning">
          {unknownRightsOnStage} of the {board.filledSlots} curated works the article will show
          {unknownRightsOnStage === 1 ? " has" : " have"} unknown reuse terms. Advisory only — check the
          rights before featuring them this prominently.
        </ActionNotice>
      ) : null}


      {!substanceSlug ? (
        <EmptyStateSurface padding="sm" radius="lg" className="theme-text-muted text-sm">
          Pick a substance to inspect its automatic Replication Showcase. The dot marks a stored
          ordering/exclusion delta; the count is the current association total.
        </EmptyStateSurface>
      ) : detailState.status === "loading" ? (
        <BoardSkeleton />
      ) : detailState.status === "error" ? (
        <EmptyStateSurface padding="sm" radius="lg" tone="danger" className="space-y-2 text-sm">
          <p className="theme-text-primary">{detailState.message}</p>
          <Button type="button" variant="secondary" size="sm" onClick={controller.retry}>
            <Icon icon="lucide:refresh-cw" size={14} />
            Retry
          </Button>
        </EmptyStateSurface>
      ) : detail && matches.length === 0 ? (
        <EmptyStateSurface padding="sm" radius="lg" className="space-y-1.5 text-sm">
          <p className="theme-text-primary font-medium">
            No automatic or manual replication is associated with {detail.substance.title} yet.
          </p>
          <p className="theme-text-muted">
            Standalone work can be associated directly from the library. Review missing or incorrect
            title taxonomy in the replication editor rather than adding an unrelated effect tag.
          </p>
          <Button type="button" variant="secondary" size="sm" onClick={onOpenLibrary}>
            <Icon icon="lucide:library" size={14} />
            Open the corpus library
          </Button>
        </EmptyStateSurface>
      ) : detail ? (
        <>
          <GalleryBoardList
            board={board}
            onMove={controller.handleMove}
            onMoveToEdge={controller.handleMoveToEdge}
            onCurate={controller.handleCurate}
            onUncurate={controller.handleUncurate}
            onExclude={controller.handleExclude}
            onExcludeEverywhere={controller.handleExcludeEverywhere}
            onDragEnd={controller.handleDragEnd}
            focusSlug={focusSlug}
            onFocusHandled={controller.clearFocus}
          />

          {board.excluded.length > 0 ? (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  ref={shelfToggleRef}
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-expanded={excludedOpen}
                  onClick={() => controller.setExcludedOpen((open) => !open)}
                >
                  <Icon icon={excludedOpen ? "lucide:chevron-down" : "lucide:chevron-right"} size={14} />
                  Excluded from this gallery ({board.excluded.length})
                </Button>
                <EditorStatusPill
                  tone={
                    overExclusionLimit
                      ? "danger"
                      : exclusionCount >= exclusionLimit * 0.8
                        ? "warning"
                        : "neutral"
                  }
                >
                  {`${exclusionCount} of ${exclusionLimit} gallery exclusions used`}
                </EditorStatusPill>
              </div>
              {excludedOpen ? (
                <ul className="space-y-2">
                  {board.excluded.map((match) => (
                    <ExcludedRow
                      key={match.replication.slug}
                      match={match}
                      onRestore={controller.handleRestore}
                    />
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          <div className="space-y-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-expanded={previewOpen}
              onClick={() => controller.setPreviewOpen((open) => !open)}
            >
              <Icon icon={previewOpen ? "lucide:chevron-down" : "lucide:chevron-right"} size={14} />
              Article preview — effective automatic and editorial order
            </Button>
            {previewOpen ? <GalleryStagePreview matches={effectiveOrder} /> : null}
          </div>

          <GalleryLibraryAdd
            rows={visibleRows}
            railNarrowed={railNarrowed}
            matchedSlugs={matchedSlugs}
            curatedSlugs={curation.curated}
            removedSlugs={curation.removed}
            onCurate={controller.handleCurate}
            onInspectRow={onInspectRow}
            onOpenLibrary={onOpenLibrary}
          />
        </>
      ) : null}

      <Dialog
        open={pendingSlug !== null}
        onOpenChange={(open) => (open ? undefined : controller.setPendingSlug(null))}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Discard unsaved curation?</DialogTitle>
            <DialogDescription>
              This gallery has changes that were never saved. Switching substances throws them away —
              the article keeps whatever the server already holds.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => controller.setPendingSlug(null)}
            >
              Keep editing
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={controller.discardAndSwitch}
            >
              Discard and switch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </EditorSection>
  );
}
