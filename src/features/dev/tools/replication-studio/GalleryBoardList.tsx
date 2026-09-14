"use client";

/**
 * The curation board: the curated list that *is* the article, and beneath it a
 * pool of matched works that are not on the article at all.
 *
 * The article publishes curated rows only, so the board draws exactly two
 * things. Above the un-curate zone sits the published list — numbered from 1,
 * cut by the fold if it overruns the article's slot cap, padded with ghost
 * frames while it is short of it. Below sits the candidate pool: deliberately
 * unnumbered and undraggable, because an unpublished work has no position, a
 * number would be a lie, and an intra-pool drag would change nothing an editor
 * could ever see. Promotion is the Curate button; demotion is the row's own
 * button or a drag onto the un-curate zone.
 */

import { Fragment, useId } from "react";
import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { InteractiveContentCard } from "@/components/ui/surface";
import { DesktopOnlyNotice, EditorStatusPill } from "@/features/dev/components";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { cn } from "@/lib/utils";

import {
  BandHeading,
  CandidateBand,
  ExcludeButton,
  Fold,
  MOTION,
  PositionNumber,
  useBandFocus,
} from "./GalleryCandidateBand";
import { GalleryMatchIdentity } from "./GalleryMatchIdentity";
import type { GalleryBoard, GalleryBoardRow } from "./substanceGalleryPortalModel";


/**
 * Drop target that takes a curated row off the article: `applyBoardDrag`
 * un-curates on any `over` id that is not a curated slug, so the zone needs no
 * special case — and neither does a candidate row, which is not a drop target
 * at all.
 */
const UNCURATE_ZONE_ID = "substance-gallery-uncurate-zone"


/** dnd-kit transform timing, matched to the public showcase's slide/fade. */

/** The curated band's wash. A tint, never a side stripe — those are banned. */
const CURATED_WASH = "theme-replication-curated-wash";



/**
 * A stored-priority row: reorderable within its placement tier. Removing the
 * priority leaves automatic placements on the article in their default tier.
 */
function CuratedRow({
  row,
  priorityIndex,
  curatedCount,
  focused,
  readOnly,
  onMove,
  onMoveToEdge,
  onUncurate,
  onExclude,
  onFocusHandled,
}: {
  row: GalleryBoardRow;
  priorityIndex: number;
  curatedCount: number;
  focused: boolean;
  readOnly: boolean;
  onMove: (slug: string, direction: "up" | "down") => void;
  onMoveToEdge: (slug: string, edge: "top" | "bottom") => void;
  onUncurate: (slug: string) => void;
  onExclude: (slug: string) => void;
  onFocusHandled: () => void;
}) {
  const { match, position, onStage } = row;
  const { title, slug } = match.replication;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: slug,
    disabled: readOnly,
  });
  const primaryActionRef = useBandFocus(focused, onFocusHandled);

  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className="list-none">
      <InteractiveContentCard
        variant="public"
        padding="sm"
        radius="lg"
        className={cn(
          MOTION,
          CURATED_WASH,
          !onStage && "opacity-55",
          isDragging && "opacity-60 ring-1 ring-dose-accent-strong",
        )}
      >
        <div className="flex items-center gap-3">
          <PositionNumber position={position} onStage={onStage} />
          {readOnly ? null : (
            <Button
              variant="glass"
              size="icon"
              className="h-8 w-8 shrink-0 cursor-grab touch-none active:cursor-grabbing"
              aria-label={`Drag ${title} to reorder its priority`}
              {...attributes}
              {...listeners}
            >
              <Icon icon="lucide:grip-vertical" size={14} />
            </Button>
          )}
          <GalleryMatchIdentity match={match} />
          {readOnly ? null : (
            <div className="flex shrink-0 items-center gap-1">
              <Button
                ref={primaryActionRef}
                variant="glass"
                size="icon"
                className="h-8 w-8"
                disabled={priorityIndex === 0}
                aria-label={`Move ${title} up in priority`}
                onClick={() => onMove(slug, "up")}
              >
                <Icon icon="lucide:arrow-up" size={14} />
              </Button>
              <Button
                variant="glass"
                size="icon"
                className="h-8 w-8"
                disabled={priorityIndex === curatedCount - 1}
                aria-label={`Move ${title} down in priority`}
                onClick={() => onMove(slug, "down")}
              >
                <Icon icon="lucide:arrow-down" size={14} />
              </Button>
              <Button
                variant="glass"
                size="icon"
                className="h-8 w-8"
                disabled={priorityIndex === 0}
                aria-label={`Move ${title} to first priority`}
                onClick={() => onMoveToEdge(slug, "top")}
              >
                <Icon icon="lucide:chevrons-up" size={14} />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Remove priority from ${title}`}
                onClick={() => onUncurate(slug)}
              >
                <Icon icon="lucide:pin-off" size={14} />
                Remove priority
              </Button>
              <ExcludeButton title={title} slug={slug} onExclude={onExclude} />
            </div>
          )}
        </div>
      </InteractiveContentCard>
    </li>
  );
}
/** An unfilled article slot, carrying the position it would occupy. */
function GhostSlot({ position }: { position: number }) {
  return (
    <li className="list-none">
      <div className="flex h-[4.75rem] items-center gap-3 rounded-lg border border-dashed border-[color:var(--editor-chip-border)] px-3">
        <PositionNumber position={position} onStage />
        <span className="theme-text-faint text-xs">Empty slot: nothing will fill this position.</span>
      </div>
    </li>
  );
}


export type GalleryBoardListProps = {
  board: GalleryBoard;
  onMove: (slug: string, direction: "up" | "down") => void;
  onMoveToEdge: (slug: string, edge: "top" | "bottom") => void;
  onCurate: (slug: string) => void;
  onUncurate: (slug: string) => void;
  onExclude: (slug: string) => void;
  onExcludeEverywhere: (slug: string) => void;
  onDragEnd: (event: DragEndEvent) => void;
  /** The row that just changed priority band; the board moves focus to it, then clears. */
  focusSlug: string | null;
  onFocusHandled: () => void;
};

export function GalleryBoardList({
  board,
  onMove,
  onMoveToEdge,
  onCurate,
  onUncurate,
  onExclude,
  onExcludeEverywhere,
  onDragEnd,
  focusSlug,
  onFocusHandled,
}: GalleryBoardListProps) {
  const headingBase = useId();
  const curatedHeadingId = `${headingBase}-curated`;
  const candidateHeadingId = `${headingBase}-candidates`;
  // Curation is desktop-only: the hover triage verbs, modifier-key exclusions,
  // and six-button rows have no touch grammar. Under a coarse pointer the board
  // renders read-only behind the notice; Library, Playlists, and Featured keep
  // working on a phone.
  const readOnly = useMediaQuery("(pointer: coarse)");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );
  const { setNodeRef: setUncurateZoneRef, isOver: isOverUncurateZone } = useDroppable({
    id: UNCURATE_ZONE_ID,
    disabled: readOnly,
  });

  const curatedRows = board.rows.filter((row) => row.band === "curated");
  const candidateRows = board.rows.filter((row) => row.band === "auto");
  const nothingCurated = board.curatedCount === 0;

  const foldAfterPosition = board.publishedCount > board.cap ? board.cap : null;

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <div className="space-y-3">
        {readOnly ? (
          <DesktopOnlyNotice />
        ) : null}
        <section aria-labelledby={curatedHeadingId} className="space-y-2">
          <BandHeading
            id={curatedHeadingId}
            icon="lucide:pin"
            aside={
              <EditorStatusPill tone={board.filledSlots > 0 ? "info" : "neutral"}>
                {`${board.filledSlots} of ${board.cap} article slots filled · ${board.publishedCount} published`}
              </EditorStatusPill>
            }
          >
            Priority overrides ({board.curatedCount})
          </BandHeading>
          <SortableContext
            items={curatedRows.map((row) => row.match.replication.slug)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="space-y-2">
              {curatedRows.map((row, priorityIndex) => (
                <Fragment key={row.match.replication.slug}>
                  <CuratedRow
                    row={row}
                    priorityIndex={priorityIndex}
                    curatedCount={board.curatedCount}
                    focused={focusSlug === row.match.replication.slug}
                    readOnly={readOnly}
                    onMove={onMove}
                    onMoveToEdge={onMoveToEdge}
                    onUncurate={onUncurate}
                    onExclude={onExclude}
                    onFocusHandled={onFocusHandled}
                  />
                  {row.position === foldAfterPosition ? <Fold cap={board.cap} /> : null}
                </Fragment>
              ))}
            </ul>
          </SortableContext>
          {nothingCurated ? (
            <p className="theme-text-faint text-xs">
              No stored priority overrides. The article still publishes every automatic placement below.
            </p>
          ) : null}
          {board.emptySlots > 0 ? (
            <>
              <ul className="space-y-2">
                {Array.from({ length: board.emptySlots }, (_, index) => (
                  <GhostSlot
                    key={board.publishedCount + index + 1}
                    position={board.publishedCount + index + 1}
                  />
                ))}
              </ul>
              <p className="theme-text-faint text-xs">
                {board.emptySlots} of the article's {board.cap} slots are empty, {board.filledSlots}{" "}
                filled.
              </p>
            </>
          ) : board.publishedCount === board.cap ? (
            <p className="theme-text-faint text-xs">
              All {board.cap} article slots are filled exactly; nothing spills past the fold.
            </p>
          ) : null}
        </section>

        {readOnly ? (
          <div className="theme-gradient-divider h-px" />
        ) : (
          <div
            ref={setUncurateZoneRef}
            role="group"
            aria-label="Drop a priority row here to restore automatic ordering"
            className={cn(
              "flex items-center gap-3 rounded-lg px-1 py-2",
              MOTION,
              isOverUncurateZone && "bg-[var(--editor-panel-bg-subtle)]",
            )}
          >
            <div className="theme-gradient-divider h-px flex-1" />
            <span className="theme-text-faint text-[11px] uppercase tracking-[0.3em]">
              Drop here to remove priority
            </span>
            <div className="theme-gradient-divider h-px flex-1" />
          </div>
        )}

        <CandidateBand
          headingId={candidateHeadingId}
          cap={board.cap}
          rows={candidateRows}
          focusSlug={focusSlug}
          readOnly={readOnly}
          onCurate={onCurate}
          onExclude={onExclude}
          onExcludeEverywhere={onExcludeEverywhere}
          onFocusHandled={onFocusHandled}
        />
      </div>
    </DndContext>
  );
}
