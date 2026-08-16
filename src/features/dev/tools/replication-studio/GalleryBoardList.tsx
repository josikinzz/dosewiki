"use client";

/**
 * The contact sheet: one continuous numbered board across the curated head and
 * the default tail, cut by a single unmissable fold at the article's slot cap.
 *
 * The design premise is that the only question an editor actually has is "will
 * this appear on the article, and where" — so the absolute position number is
 * the loudest non-media element in every row, and the fold is a fact drawn
 * across the board rather than a boundary between the two bands. The cut floats:
 * it lands inside the curated head when the head is longer than the cap, and
 * down in the default tail when it is shorter. Below it, rows dim.
 *
 * Both bands sit in their own `SortableContext`, so promotion and demotion are
 * the same gesture in both directions; the divider between them is a droppable
 * whose only job is to un-curate, which `applyBoardDrag` already treats as the
 * default for any `over` id that is not a curated slug.
 */

import { Fragment, useEffect, useId, useRef, type ReactNode } from "react";
import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { InteractiveContentCard } from "@/components/ui/surface";
import { EditorStatusPill } from "@/features/dev/components";
import { cn } from "@/lib/utils";

import { ReplicationThumb } from "./ReplicationThumb";
import type { GalleryBoard, GalleryBoardRow, GalleryMatch } from "./substanceGalleryPortalModel";

/**
 * Drop target for the default-order band: `applyBoardDrag` un-curates on any
 * `over` id that is not a curated slug, so the divider needs no special case.
 */
export const AUTO_ZONE_ID = "substance-gallery-auto-zone";

/** Short token labels; the sentence-length copy stays in the public credit block. */
const RIGHTS_TOKEN_LABELS: Record<string, string> = {
  "creator-retained": "creator retained",
  "explicit-license": "licensed",
  "permission-granted": "permission granted",
  "public-domain": "public domain",
  unknown: "rights unknown",
};

/** dnd-kit transform timing, matched to the public showcase's slide/fade. */
const MOTION = "transition-[background-color,opacity,box-shadow] duration-[240ms] ease-[cubic-bezier(0.25,1,0.5,1)] motion-reduce:transition-none";

/** The curated band's wash. A tint, never a side stripe — those are banned. */
const CURATED_WASH = "bg-[color:color-mix(in_srgb,var(--theme-accent-soft)_9%,transparent)]";

/**
 * The owning-effect chip with its match provenance behind a click/Enter
 * popover rather than a hover title, so the explanation is reachable from a
 * keyboard — the chip is the only place the slug-vs-tag distinction surfaces.
 */
export function ProvenanceChip({ match }: { match: GalleryMatch }) {
  const { provenance } = match;
  const viaTags = provenance.matchedVia === "effect_tags";
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="auto"
          aria-label={`${provenance.effectName}: matched via ${provenance.matchedVia}`}
          className="inline-flex max-w-full items-center gap-1 rounded-md border border-[color:var(--editor-chip-border)] bg-[var(--editor-chip-bg)] px-1.5 py-0.5 text-xs font-medium text-[var(--editor-chip-text)]"
        >
          <Icon icon={viaTags ? "lucide:tags" : "lucide:link"} size={11} className="shrink-0" />
          <span className="min-w-0 truncate">{provenance.effectName}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3 text-xs" align="start">
        <p className="theme-text-primary font-medium">Matched via {provenance.matchedVia}</p>
        <p className="theme-text-muted mt-1">
          {viaTags
            ? `This row is tagged with ${provenance.effectSlug} (effect_tags); its owning effect is ${match.replication.effect_name ?? "none"}.`
            : `This row's owning effect (effect_slug) is ${provenance.effectSlug}, one of this substance's visual effects.`}
        </p>
      </PopoverContent>
    </Popover>
  );
}

export function RightsToken({ match }: { match: GalleryMatch }) {
  const status = match.replication.rights_status ?? "creator-retained";
  const unknown = status === "unknown";
  return (
    <EditorStatusPill
      tone={unknown ? "warning" : "neutral"}
      className="shrink-0"
      title={unknown ? "Reuse terms are unknown; check before featuring this prominently." : undefined}
    >
      {RIGHTS_TOKEN_LABELS[status] ?? status}
    </EditorStatusPill>
  );
}

/** Thumb + title + artist + provenance + rights: the identity block of every row. */
export function GalleryMatchIdentity({ match }: { match: GalleryMatch }) {
  const { replication } = match;
  return (
    <>
      <ReplicationThumb row={replication} className="h-14 w-14 shrink-0" />
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="theme-text-primary truncate text-sm font-medium">{replication.title}</p>
        <p className="theme-text-faint truncate text-xs">
          {replication.artist} · {replication.type}
        </p>
        <div className="flex flex-wrap items-center gap-1">
          <ProvenanceChip match={match} />
          <RightsToken match={match} />
        </div>
      </div>
    </>
  );
}

/**
 * The absolute position in the effective public order. It answers the editor's
 * only real question, so it outweighs every other non-media element in the row.
 */
function PositionNumber({ position, onStage }: { position: number; onStage: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "font-display w-8 shrink-0 text-right text-lg font-semibold leading-none tabular-nums",
        onStage ? "theme-text-primary" : "theme-text-faint",
      )}
    >
      {position}
    </span>
  );
}

/**
 * One row of the board. Curated and default rows differ only in their band
 * tint and their action set — both are sortable, which is what lets a default
 * row be dragged up into the head.
 */
function BoardRow({
  row,
  curatedCount,
  provisional,
  focused,
  onMove,
  onMoveToEdge,
  onCurate,
  onUncurate,
  onExclude,
  onFocusHandled,
}: {
  row: GalleryBoardRow;
  curatedCount: number;
  /** True in the nothing-pinned state: an on-stage default row is a ghost slot. */
  provisional: boolean;
  focused: boolean;
  onMove: (slug: string, direction: "up" | "down") => void;
  onMoveToEdge: (slug: string, edge: "top" | "bottom") => void;
  onCurate: (slug: string) => void;
  onUncurate: (slug: string) => void;
  onExclude: (slug: string) => void;
  onFocusHandled: () => void;
}) {
  const { match, position, onStage, band } = row;
  const { title, slug } = match.replication;
  const curated = band === "curated";
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: slug });
  const primaryActionRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (focused) {
      primaryActionRef.current?.focus();
      onFocusHandled();
    }
  }, [focused, onFocusHandled]);

  const curatedIndex = curated ? position - 1 : -1;

  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className="list-none">
      <InteractiveContentCard
        variant="public"
        padding="sm"
        radius="lg"
        className={cn(
          MOTION,
          curated && CURATED_WASH,
          provisional && "border-dashed opacity-80",
          !onStage && "opacity-55",
          isDragging && "opacity-60 ring-1 ring-dose-accent-strong",
        )}
      >
        <div className="flex items-center gap-3">
          <PositionNumber position={position} onStage={onStage} />
          <Button
            variant="glass"
            size="icon"
            className="h-8 w-8 shrink-0 cursor-grab active:cursor-grabbing"
            aria-label={
              curated
                ? `Drag ${title} to reorder it in the curated head`
                : `Drag ${title} onto a curated row to pin it`
            }
            {...attributes}
            {...listeners}
          >
            <Icon icon="lucide:grip-vertical" size={14} />
          </Button>
          <GalleryMatchIdentity match={match} />
          <div className="flex shrink-0 items-center gap-1">
            {curated ? (
              <>
                <Button
                  ref={primaryActionRef}
                  variant="glass"
                  size="icon"
                  className="h-8 w-8"
                  disabled={curatedIndex === 0}
                  aria-label={`Move ${title} up`}
                  onClick={() => onMove(slug, "up")}
                >
                  <Icon icon="lucide:arrow-up" size={14} />
                </Button>
                <Button
                  variant="glass"
                  size="icon"
                  className="h-8 w-8"
                  disabled={curatedIndex === curatedCount - 1}
                  aria-label={`Move ${title} down`}
                  onClick={() => onMove(slug, "down")}
                >
                  <Icon icon="lucide:arrow-down" size={14} />
                </Button>
                <Button
                  variant="glass"
                  size="icon"
                  className="h-8 w-8"
                  disabled={curatedIndex === 0}
                  aria-label={`Move ${title} to position 1`}
                  onClick={() => onMoveToEdge(slug, "top")}
                >
                  <Icon icon="lucide:chevrons-up" size={14} />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Un-curate ${title}`}
                  onClick={() => onUncurate(slug)}
                >
                  <Icon icon="lucide:pin-off" size={14} />
                  Un-curate
                </Button>
              </>
            ) : (
              <Button
                ref={primaryActionRef}
                variant="secondary"
                size="sm"
                aria-label={`Curate ${title}`}
                onClick={() => onCurate(slug)}
              >
                <Icon icon="lucide:pin" size={14} />
                Curate
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label={`Exclude ${title} from this gallery`}
              onClick={() => onExclude(slug)}
            >
              <Icon icon="lucide:eye-off" size={14} />
            </Button>
          </div>
        </div>
      </InteractiveContentCard>
    </li>
  );
}

/**
 * The cut line. One rule across the whole board, drawn after the last public
 * position wherever that lands. It carries no transition by design: the fold is
 * a fact about the article, not a flourish.
 */
function Fold({ cap }: { cap: number }) {
  return (
    <li className="list-none py-2">
      <div className="flex items-center gap-3 border-y border-[color:var(--theme-accent-strong)] bg-[color:color-mix(in_srgb,var(--theme-accent-strong)_14%,transparent)] px-3 py-2">
        <Icon icon="lucide:scissors" size={14} className="theme-accent-emphasis shrink-0" />
        <p className="theme-accent-emphasis text-[11px] font-semibold uppercase tracking-[0.24em]">
          The article stops here — positions {cap + 1}+ reach /replications only
        </p>
      </div>
    </li>
  );
}

/** An unfilled public slot, carrying the position it would occupy. */
function GhostSlot({ position }: { position: number }) {
  return (
    <li className="list-none">
      <div className="flex h-[4.75rem] items-center gap-3 rounded-lg border border-dashed border-[color:var(--editor-chip-border)] px-3">
        <PositionNumber position={position} onStage />
        <span className="theme-text-faint text-xs">Empty slot — nothing will fill this position.</span>
      </div>
    </li>
  );
}

function BandHeading({
  id,
  icon,
  children,
  aside,
}: {
  id: string;
  icon: string;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <h4 id={id} className="theme-text-muted flex items-center gap-1.5 text-[11px] uppercase tracking-[0.3em]">
        <Icon icon={icon} size={12} className="shrink-0" />
        {children}
      </h4>
      {aside}
    </div>
  );
}

export type GalleryBoardListProps = {
  board: GalleryBoard;
  onMove: (slug: string, direction: "up" | "down") => void;
  onMoveToEdge: (slug: string, edge: "top" | "bottom") => void;
  onCurate: (slug: string) => void;
  onUncurate: (slug: string) => void;
  onExclude: (slug: string) => void;
  onDragEnd: (event: DragEndEvent) => void;
  /** The row that just changed band; the board moves focus to it, then clears. */
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
  onDragEnd,
  focusSlug,
  onFocusHandled,
}: GalleryBoardListProps) {
  const headingBase = useId();
  const curatedHeadingId = `${headingBase}-curated`;
  const autoHeadingId = `${headingBase}-auto`;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );
  const { setNodeRef: setAutoZoneRef, isOver: isOverAutoZone } = useDroppable({ id: AUTO_ZONE_ID });

  const curatedRows = board.rows.filter((row) => row.band === "curated");
  const autoRows = board.rows.filter((row) => row.band === "auto");
  const nothingPinned = board.curatedCount === 0;

  /**
   * The fold only exists once the board overflows the cap, and ghost slots only
   * exist while it is short of the cap — the two are mutually exclusive, which
   * is why the ghosts can sit after the last row unconditionally.
   */
  const foldAfterPosition = board.rows.length > board.cap ? board.cap : null;

  /**
   * One band's rows, with the fold spliced in directly after the last public
   * position. Both bands go through this so the cut renders wherever it lands.
   */
  const renderBand = (rows: readonly GalleryBoardRow[]) =>
    rows.map((row) => (
      <Fragment key={row.match.replication.slug}>
        <BoardRow
          row={row}
          curatedCount={board.curatedCount}
          provisional={nothingPinned && row.band === "auto" && row.onStage}
          focused={focusSlug === row.match.replication.slug}
          onMove={onMove}
          onMoveToEdge={onMoveToEdge}
          onCurate={onCurate}
          onUncurate={onUncurate}
          onExclude={onExclude}
          onFocusHandled={onFocusHandled}
        />
        {row.position === foldAfterPosition ? <Fold cap={board.cap} /> : null}
      </Fragment>
    ));

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <div className="space-y-3">
        <section aria-labelledby={curatedHeadingId} className="space-y-2">
          <BandHeading
            id={curatedHeadingId}
            icon="lucide:pin"
            aside={
              <EditorStatusPill tone={board.filledSlots > 0 ? "info" : "neutral"}>
                {`${board.filledSlots} of ${board.cap} slots filled`}
              </EditorStatusPill>
            }
          >
            Curated head ({board.curatedCount})
          </BandHeading>
          <SortableContext
            items={curatedRows.map((row) => row.match.replication.slug)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="space-y-2">{renderBand(curatedRows)}</ul>
          </SortableContext>
          {nothingPinned ? (
            <p className="theme-text-faint text-xs">
              Default order — nothing pinned. The dashed rows below are what the article shows today;
              pin one to take control of the order.
            </p>
          ) : null}
        </section>

        <div
          ref={setAutoZoneRef}
          role="group"
          aria-label="Drop a curated row here to return it to the default order"
          className={cn(
            "flex items-center gap-3 rounded-lg px-1 py-2",
            MOTION,
            isOverAutoZone && "bg-[var(--editor-panel-bg-subtle)]",
          )}
        >
          <div className="theme-gradient-divider h-px flex-1" />
          <span className="theme-text-faint text-[11px] uppercase tracking-[0.3em]">
            Drop here to un-curate
          </span>
          <div className="theme-gradient-divider h-px flex-1" />
        </div>

        <section aria-labelledby={autoHeadingId} className="space-y-2">
          <BandHeading id={autoHeadingId} icon="lucide:list-ordered">
            Default order ({autoRows.length})
          </BandHeading>
          <SortableContext
            items={autoRows.map((row) => row.match.replication.slug)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="space-y-2">{renderBand(autoRows)}</ul>
          </SortableContext>
          {autoRows.length === 0 ? (
            <p className="theme-text-faint text-xs">Every match is curated or excluded.</p>
          ) : null}
        </section>

        {board.emptySlots > 0 ? (
          <div className="space-y-2">
            <ul className="space-y-2">
              {Array.from({ length: board.emptySlots }, (_, index) => (
                <GhostSlot key={board.rows.length + index + 1} position={board.rows.length + index + 1} />
              ))}
            </ul>
            <p className="theme-text-faint text-xs">
              {board.emptySlots} of the article's {board.cap} slots are empty — {board.filledSlots} filled.
            </p>
          </div>
        ) : board.rows.length === board.cap ? (
          <p className="theme-text-faint text-xs">
            All {board.cap} article slots are filled exactly; nothing spills past the fold.
          </p>
        ) : null}
      </div>
    </DndContext>
  );
}
