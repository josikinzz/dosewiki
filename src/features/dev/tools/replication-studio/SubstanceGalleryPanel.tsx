"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { Icon } from "@/components/common/Icon";
import { SkeletonPulse } from "@/components/layout/PublicFeedbackPrimitives";
import { Button } from "@/components/ui/button";
import { EmptyStateSurface, InteractiveContentCard } from "@/components/ui/surface";
import { TOUCH_ICON } from "@/components/ui/touchTargets";
import {
  Notice,
  ConfirmDialog,
  EditorActionStatus,
  EditorSection,
  EditorStatusPill,
  EditorToolbar,
  LoadErrorState,
  useUnsavedWork,
} from "@/features/dev/components";
import { SHOWCASE_WORK_CAP } from "@/features/replications/components/showcaseWork";

import { GalleryBoardList } from "./GalleryBoardList";
import { GalleryConflictView, type ConflictWork } from "./GalleryConflictView";
import { GalleryMatchIdentity } from "./GalleryMatchIdentity";
import { GalleryLibraryAdd } from "./GalleryLibraryAdd";
import { GalleryPicker } from "./GalleryPicker";
import { ApplyPlaylistMenu } from "./ApplyPlaylistMenu";
import { GalleryStagePreview } from "./GalleryStagePreview";
import type { StudioRow } from "./replicationStudioModel";
import type { GalleryMatch } from "./substanceGalleryPortalModel";
import { useSubstanceGalleryController } from "./useSubstanceGalleryController";

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
    picker,
    detailState,
    detail,
    curation,
    save,
    conflict,
    feedback,
    matches,
    board,
    effectiveOrder,
    provenance,
    matchedSlugs,
    unknownRightsOnStage,
    exclusions,
    undo,
    edit,
    focus,
  } = controller;
  // The Excluded shelf starts closed on every substance.
  const [excludedOpenFor, setExcludedOpenFor] = useState<string | null>(null);
  const excludedOpen = excludedOpenFor !== null && excludedOpenFor === substanceSlug;
  /** A slug as a work the conflict view can draw: the board's own rows first, then the corpus. */
  const workOf = useMemo(() => {
    const works = new Map<string, ConflictWork>();
    for (const row of corpusRows) works.set(row.slug, row);
    for (const match of matches) works.set(match.replication.slug, match.replication);
    return (slug: string) => works.get(slug) ?? null;
  }, [corpusRows, matches]);
  // A showcase save changes a live article gallery, so the shell only discards.
  useUnsavedWork({
    id: "replications:showcase",
    tab: "replications",
    label: `Replications: ${substanceSlug ?? "drug"} showcase`,
    dirty: save.isDirty,
    publishesLive: true,
    discard: save.discard,
  });

  /**
   * Excluding the last row in a band leaves no neighbour to receive focus, so
   * the controller bumps a token and the shelf toggle — the nearest thing the
   * action produced — takes it instead of the document body.
   */
  const shelfToggleRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (focus.shelfToken === 0) return;
    shelfToggleRef.current?.focus({ preventScroll: true });
  }, [focus.shelfToken]);

  return (
    <EditorSection
      headingLevel="h3"
      icon="lucide:images"
      title="Substance Replication Showcases"
      description={`Exact-drug, permitted class, and final Visual Disconnection stills appear automatically. Stored curation controls priority, direct standalone associations, and per-article exclusions. The article shows the first ${SHOWCASE_WORK_CAP} works in the effective policy order.`}
    >
      <div aria-live="polite" className="sr-only">
        {focus.announcement}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <GalleryPicker
          candidates={picker.candidates}
          currentSlug={substanceSlug}
          onSelect={picker.select}
          status={picker.state.status}
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

      {picker.state.status === "error" ? (
        <LoadErrorState message={picker.state.message} onRetry={picker.retry} />
      ) : null}

      {detail ? (
        <EditorToolbar variant="split">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="accent"
              size="sm"
              disabled={!save.isDirty || save.state === "saving" || exclusions.over}
              onClick={() => void save.persist(curation, save.expectedUpdatedAt)}
            >
              <Icon icon="lucide:save" size={15} />
              Save gallery
            </Button>
            <ApplyPlaylistMenu
              key={substanceSlug}
              corpusRows={corpusRows}
              onApply={edit.applyPlaylist}
            />
            <Button
              type="button"
              variant="glass"
              size="icon"
              className={`h-8 w-8 ${TOUCH_ICON}`}
              disabled={!undo.canUndo}
              aria-label="Undo the last curation change"
              title="Undo (Cmd/Ctrl+Z)"
              onClick={undo.undo}
            >
              <Icon icon="lucide:undo-2" size={15} />
            </Button>
            <Button
              type="button"
              variant="glass"
              size="icon"
              className={`h-8 w-8 ${TOUCH_ICON}`}
              disabled={!undo.canRedo}
              aria-label="Redo the last undone curation change"
              title="Redo (Cmd/Ctrl+Shift+Z)"
              onClick={undo.redo}
            >
              <Icon icon="lucide:redo-2" size={15} />
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={!save.isDirty || save.state === "saving"}
              onClick={save.discard}
            >
              <Icon icon="lucide:rotate-ccw" size={15} />
              Discard changes
            </Button>
            {save.expectedUpdatedAt ? (
              <span className="theme-text-faint text-xs">
                Last saved {save.expectedUpdatedAt.slice(0, 10)} by {save.savedBy ?? "unknown"}
              </span>
            ) : (
              <span className="theme-text-faint text-xs">
                No stored ordering or exclusion delta yet. Automatic placements still publish.
              </span>
            )}
          </div>
          {save.state === "idle" || save.state === "saved" ? (
            <EditorStatusPill tone={save.isDirty ? "warning" : "neutral"}>
              {save.isDirty ? "Unsaved changes" : "Gallery saved"}
            </EditorStatusPill>
          ) : (
            <EditorActionStatus status={save.state} />
          )}
        </EditorToolbar>
      ) : null}

      {exclusions.over ? (
        <Notice placement="inline" tone="danger">
          This gallery excludes {exclusions.count} works and the limit is {exclusions.limit}, so it will
          not save. Restore some from the Excluded shelf, or use Exclude everywhere on the junk so it
          leaves every gallery at once instead of filling this one.
        </Notice>
      ) : null}

      {feedback ? (
        <Notice placement="inline" tone={feedback.tone} dismiss={() => controller.setFeedback(null)}>
          {feedback.message}
        </Notice>
      ) : null}

      {conflict ? (
        <GalleryConflictView
          conflict={conflict}
          mine={curation}
          workOf={workOf}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="accent"
                size="sm"
                disabled={save.state === "saving"}
                onClick={controller.resolveConflict.keepMine}
              >
                <Icon icon="lucide:upload" size={14} />
                Keep mine
              </Button>
              <Button type="button" variant="secondary" size="sm" onClick={controller.resolveConflict.takeTheirs}>
                <Icon icon="lucide:download" size={14} />
                Take theirs
              </Button>
            </div>
          }
        />
      ) : null}

      {detail && unknownRightsOnStage > 0 ? (
        <Notice placement="inline" tone="warning">
          {unknownRightsOnStage} of the {board.filledSlots} curated works the article will show
          {unknownRightsOnStage === 1 ? " has" : " have"} unknown reuse terms. Advisory only: check the
          rights before featuring them this prominently.
        </Notice>
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
            onMove={edit.move}
            onMoveToEdge={edit.moveToEdge}
            onCurate={edit.curate}
            onUncurate={edit.uncurate}
            onExclude={edit.exclude}
            onExcludeEverywhere={edit.excludeEverywhere}
            onDragEnd={edit.dragEnd}
            focusSlug={focus.slug}
            onFocusHandled={focus.clear}
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
                  onClick={() => setExcludedOpenFor(excludedOpen ? null : substanceSlug)}
                >
                  <Icon icon={excludedOpen ? "lucide:chevron-down" : "lucide:chevron-right"} size={14} />
                  Excluded from this gallery ({board.excluded.length})
                </Button>
                <EditorStatusPill
                  tone={
                    exclusions.over
                      ? "danger"
                      : exclusions.count >= exclusions.limit * 0.8
                        ? "warning"
                        : "neutral"
                  }
                >
                  {`${exclusions.count} of ${exclusions.limit} gallery exclusions used`}
                </EditorStatusPill>
              </div>
              {excludedOpen ? (
                <ul className="space-y-2">
                  {board.excluded.map((match) => (
                    <ExcludedRow
                      key={match.replication.slug}
                      match={match}
                      onRestore={edit.restore}
                    />
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          <GalleryStagePreview matches={effectiveOrder} substanceSlug={substanceSlug} />

          <GalleryLibraryAdd
            rows={visibleRows}
            railNarrowed={railNarrowed}
            matchedSlugs={matchedSlugs}
            curatedSlugs={curation.curated}
            removedSlugs={curation.removed}
            onCurate={edit.curate}
            onInspectRow={onInspectRow}
            onOpenLibrary={onOpenLibrary}
          />
        </>
      ) : null}

      <ConfirmDialog
        request={
          picker.pendingSlug !== null
            ? {
                title: "Discard unsaved curation?",
                description:
                  "This gallery has changes that were never saved. Switching substances throws them away; the article keeps whatever the server already holds.",
                cancelLabel: "Keep editing",
                confirmLabel: "Discard and switch",
                destructive: true,
                onConfirm: picker.discardAndSwitch,
              }
            : null
        }
        onClose={picker.cancelSwitch}
      />
    </EditorSection>
  );
}
