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

import {
  Fragment,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
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
import { columnsIn } from "./gridColumns";

/** Candidate rows drawn at once. Bounded on purpose: a big substance matches
 * hundreds of works, and mounting them all is what made the pool unreadable. */
const LIST_PAGE_SIZE = 12;
const TRIAGE_PAGE_SIZE = 24;

type CandidateView = "list" | "triage";

const CANDIDATE_VIEW_KEY = "dosewiki.replicationStudio.candidateView";

/** Marks a candidate tile/row so the band's keyboard verbs can find its slug. */
const CANDIDATE_ATTR = "data-candidate-slug";
const CANDIDATE_SELECTOR = `[${CANDIDATE_ATTR}]`;

/**
 * Drop target that takes a curated row off the article: `applyBoardDrag`
 * un-curates on any `over` id that is not a curated slug, so the zone needs no
 * special case — and neither does a candidate row, which is not a drop target
 * at all.
 */
export const UNCURATE_ZONE_ID = "substance-gallery-uncurate-zone";

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
const CURATED_WASH = "theme-replication-curated-wash";

/**
 * The owning-effect chip with its match provenance behind a click/Enter
 * popover rather than a hover title, so the explanation is reachable from a
 * keyboard — the chip is the only place the slug-vs-tag distinction surfaces.
 */
export function ProvenanceChip({ match }: { match: GalleryMatch }) {
  const { provenance } = match;
  const viaTags = provenance.matchedVia === "effect_tags";
  const viaTitle = provenance.matchedVia === "title";
  const directlyCurated = provenance.matchedVia === "curated";
  const label = viaTitle ? "name match" : provenance.effectName;
  const icon = viaTitle
    ? "lucide:case-sensitive"
    : viaTags
      ? "lucide:tags"
      : "lucide:link";
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="auto"
          aria-label={`${label}: matched via ${provenance.matchedVia}`}
          className="inline-flex max-w-full items-center gap-1 rounded-md border border-[color:var(--editor-chip-border)] bg-[var(--editor-chip-bg)] px-1.5 py-0.5 text-xs font-medium text-[var(--editor-chip-text)]"
        >
          <Icon icon={icon} size={11} className="shrink-0" />
          <span className="min-w-0 truncate">{label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3 text-xs" align="start">
        <p className="theme-text-primary font-medium">
          {viaTitle ? "Matched by name" : `Matched via ${provenance.matchedVia}`}
        </p>
        <p className="theme-text-muted mt-1">
          {directlyCurated
            ? `This row was pinned directly for this substance; its owning effect is ${match.replication.effect_name ?? "none"}.`
            : viaTitle
            ? "The title names this substance, so it is proposed even though its effects do not match."
            : viaTags
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
 * The published position. Only a curated row has one, and it answers the
 * editor's only real question, so it outweighs every other non-media element
 * in the row.
 */
function PositionNumber({ position, onStage }: { position: number; onStage: boolean }) {
  return (
    <span
      aria-hidden
      data-testid="board-position"
      className={cn(
        "font-display w-8 shrink-0 text-right text-lg font-semibold leading-none tabular-nums",
        onStage ? "theme-text-primary" : "theme-text-faint",
      )}
    >
      {position}
    </span>
  );
}

/** Exclusion is available from both bands, so it lives in one place. */
function ExcludeButton({ title, slug, onExclude }: { title: string; slug: string; onExclude: (slug: string) => void }) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-8 w-8"
      aria-label={`Exclude ${title} from this gallery`}
      onClick={() => onExclude(slug)}
    >
      <Icon icon="lucide:eye-off" size={14} />
    </Button>
  );
}

/**
 * Moves focus to a row's primary action after it changes band, then reports back.
 * Focus must never scroll on its own: an uncurated row lands far down the
 * candidate pool, and letting the browser chase it throws the viewport away from
 * the button the editor just clicked. We pull the row into view only when it is
 * genuinely offscreen, and then by the shortest distance — an unmeasurable box
 * is not evidence of anything, so it stays put.
 */
function useBandFocus(focused: boolean, onFocusHandled: () => void) {
  const ref = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (!focused) return;
    const node = ref.current;
    if (node) {
      node.focus({ preventScroll: true });
      const box = node.getBoundingClientRect();
      const measurable = box.height > 0 || box.width > 0;
      const offscreen = box.bottom <= 0 || box.top >= window.innerHeight;
      if (measurable && offscreen) node.scrollIntoView({ block: "nearest" });
    }
    onFocusHandled();
  }, [focused, onFocusHandled]);
  return ref;
}

/**
 * A published row: numbered, draggable, and reorderable by keyboard. Dragging
 * it onto another curated row takes that row's index; dragging it anywhere else
 * takes it off the article.
 */
function CuratedRow({
  row,
  curatedCount,
  focused,
  onMove,
  onMoveToEdge,
  onUncurate,
  onExclude,
  onFocusHandled,
}: {
  row: GalleryBoardRow;
  curatedCount: number;
  focused: boolean;
  onMove: (slug: string, direction: "up" | "down") => void;
  onMoveToEdge: (slug: string, edge: "top" | "bottom") => void;
  onUncurate: (slug: string) => void;
  onExclude: (slug: string) => void;
  onFocusHandled: () => void;
}) {
  const { match, position, onStage } = row;
  const { title, slug } = match.replication;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: slug });
  const primaryActionRef = useBandFocus(focused, onFocusHandled);
  const index = (position ?? 1) - 1;

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
          <PositionNumber position={position ?? 1} onStage={onStage} />
          <Button
            variant="glass"
            size="icon"
            className="h-8 w-8 shrink-0 cursor-grab active:cursor-grabbing"
            aria-label={`Drag ${title} to reorder it`}
            {...attributes}
            {...listeners}
          >
            <Icon icon="lucide:grip-vertical" size={14} />
          </Button>
          <GalleryMatchIdentity match={match} />
          <div className="flex shrink-0 items-center gap-1">
            <Button
              ref={primaryActionRef}
              variant="glass"
              size="icon"
              className="h-8 w-8"
              disabled={index === 0}
              aria-label={`Move ${title} up`}
              onClick={() => onMove(slug, "up")}
            >
              <Icon icon="lucide:arrow-up" size={14} />
            </Button>
            <Button
              variant="glass"
              size="icon"
              className="h-8 w-8"
              disabled={index === curatedCount - 1}
              aria-label={`Move ${title} down`}
              onClick={() => onMove(slug, "down")}
            >
              <Icon icon="lucide:arrow-down" size={14} />
            </Button>
            <Button
              variant="glass"
              size="icon"
              className="h-8 w-8"
              disabled={index === 0}
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
            <ExcludeButton title={title} slug={slug} onExclude={onExclude} />
          </div>
        </div>
      </InteractiveContentCard>
    </li>
  );
}

/** Retires a work from every substance's candidate pool at once. */
function ExcludeEverywhereButton({
  title,
  slug,
  onExcludeEverywhere,
}: {
  title: string;
  slug: string;
  onExcludeEverywhere: (slug: string) => void;
}) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-8 w-8"
      aria-label={`Exclude ${title} from every gallery`}
      title="Exclude everywhere — junk on every article, not just this one"
      onClick={() => onExcludeEverywhere(slug)}
    >
      <Icon icon="lucide:trash-2" size={14} />
    </Button>
  );
}

/**
 * A pool row: no number and no grip, because it is not on the article and the
 * pool has no order to rearrange. Curate is the only way onto the stage.
 */
function CandidateRow({
  row,
  focused,
  onCurate,
  onExclude,
  onExcludeEverywhere,
  onFocusHandled,
}: {
  row: GalleryBoardRow;
  focused: boolean;
  onCurate: (slug: string) => void;
  onExclude: (slug: string) => void;
  onExcludeEverywhere: (slug: string) => void;
  onFocusHandled: () => void;
}) {
  const { match } = row;
  const { title, slug } = match.replication;
  const primaryActionRef = useBandFocus(focused, onFocusHandled);

  return (
    <li className="list-none" {...{ [CANDIDATE_ATTR]: slug }}>
      <InteractiveContentCard variant="public" padding="sm" radius="lg" className={cn(MOTION, "opacity-80")}>
        <div className="flex items-center gap-3">
          <GalleryMatchIdentity match={match} />
          <div className="flex shrink-0 items-center gap-1">
            <Button
              ref={primaryActionRef}
              variant="secondary"
              size="sm"
              data-candidate-primary
              aria-label={`Curate ${title}`}
              onClick={() => onCurate(slug)}
            >
              <Icon icon="lucide:pin" size={14} />
              Curate
            </Button>
            <ExcludeButton title={title} slug={slug} onExclude={onExclude} />
            <ExcludeEverywhereButton
              title={title}
              slug={slug}
              onExcludeEverywhere={onExcludeEverywhere}
            />
          </div>
        </div>
      </InteractiveContentCard>
    </li>
  );
}

/**
 * The triage face of the same row. The junk-or-keeper call is made by looking
 * at the picture, so the picture is the row: a big thumb, the title under it,
 * and verbs that stay out of the way until the tile is hovered or focused.
 */
function TriageTile({
  row,
  focused,
  onCurate,
  onExclude,
  onExcludeEverywhere,
  onFocusHandled,
}: {
  row: GalleryBoardRow;
  focused: boolean;
  onCurate: (slug: string) => void;
  onExclude: (slug: string) => void;
  onExcludeEverywhere: (slug: string) => void;
  onFocusHandled: () => void;
}) {
  const { match } = row;
  const { title, slug, artist } = match.replication;
  const primaryActionRef = useBandFocus(focused, onFocusHandled);

  return (
    <li className="list-none" {...{ [CANDIDATE_ATTR]: slug }}>
      <div className="group relative overflow-hidden rounded-lg border border-[color:var(--editor-chip-border)]">
        <ReplicationThumb row={match.replication} className="aspect-square w-full" />
        <div
          className={cn(
            "absolute inset-x-0 bottom-0 flex items-center justify-end gap-1 bg-[var(--editor-panel-bg-subtle)] px-1 py-1",
            "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
            MOTION,
          )}
        >
          <Button
            ref={primaryActionRef}
            variant="secondary"
            size="sm"
            data-candidate-primary
            aria-label={`Curate ${title}`}
            onClick={() => onCurate(slug)}
          >
            <Icon icon="lucide:pin" size={14} />
            Curate
          </Button>
          <ExcludeButton title={title} slug={slug} onExclude={onExclude} />
          <ExcludeEverywhereButton
            title={title}
            slug={slug}
            onExcludeEverywhere={onExcludeEverywhere}
          />
        </div>
      </div>
      <p className="theme-text-primary mt-1 truncate text-xs font-medium" title={`${title} · ${artist}`}>
        {title}
      </p>
    </li>
  );
}

/**
 * The cut line, drawn inside the curated list once it is longer than the
 * article's cap. It carries no transition by design: the fold is a fact about
 * the article, not a flourish.
 */
function Fold({ cap }: { cap: number }) {
  return (
    <li className="list-none py-2">
      <div className="theme-replication-fold flex items-center gap-3 border-y px-3 py-2">
        <Icon icon="lucide:scissors" size={14} className="theme-accent-emphasis shrink-0" />
        <p className="theme-accent-emphasis text-[11px] font-semibold uppercase tracking-[0.24em]">
          The article stops here — positions {cap + 1}+ reach /replications only
        </p>
      </div>
    </li>
  );
}

/** An unfilled article slot, carrying the position it would occupy. */
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

/**
 * The candidate pool.
 *
 * Two things make a pool of several hundred works reviewable. It is paged, so
 * the DOM holds one screenful rather than the whole corpus. And it offers a
 * triage face — thumbnails with `c`/`x` verbs — because the keep-or-junk
 * decision is made by looking at pictures, and reading a list to click a small
 * button is the slowest possible way to express it.
 */
function CandidateBand({
  headingId,
  rows,
  focusSlug,
  onCurate,
  onExclude,
  onExcludeEverywhere,
  onFocusHandled,
}: {
  headingId: string;
  rows: GalleryBoardRow[];
  focusSlug: string | null;
  onCurate: (slug: string) => void;
  onExclude: (slug: string) => void;
  onExcludeEverywhere: (slug: string) => void;
  onFocusHandled: () => void;
}) {
  const [view, setView] = useState<CandidateView>("list");
  const [page, setPage] = useState(0);
  const gridRef = useRef<HTMLUListElement | null>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem(CANDIDATE_VIEW_KEY);
    if (stored === "list" || stored === "triage") setView(stored);
  }, []);

  const chooseView = useCallback((next: CandidateView) => {
    setView(next);
    setPage(0);
    window.localStorage.setItem(CANDIDATE_VIEW_KEY, next);
  }, []);

  const triage = view === "triage";
  const pageSize = triage ? TRIAGE_PAGE_SIZE : LIST_PAGE_SIZE;
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.min(page, pageCount - 1);
  const start = current * pageSize;
  const visible = rows.slice(start, start + pageSize);

  /**
   * Band-level verbs. `c` curates and `x` excludes whatever tile holds focus,
   * `Shift+X` retires it everywhere, and the arrows walk the tiles — measured,
   * never assumed, because the grid is responsive.
   */
  const onKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLElement>) => {
      const target = event.target as HTMLElement | null;
      if (!target || event.metaKey || event.ctrlKey || event.altKey) return;
      if (target.closest("input, textarea, [contenteditable='true']")) return;
      const tile = target.closest<HTMLElement>(CANDIDATE_SELECTOR);
      const slug = tile?.dataset.candidateSlug;
      if (!tile || !slug) return;

      const key = event.key.toLowerCase();
      if (key === "c") {
        event.preventDefault();
        onCurate(slug);
        return;
      }
      if (key === "x") {
        event.preventDefault();
        if (event.shiftKey) onExcludeEverywhere(slug);
        else onExclude(slug);
        return;
      }
      if (!["arrowleft", "arrowright", "arrowup", "arrowdown"].includes(key)) return;

      const tiles = Array.from(
        (gridRef.current?.querySelectorAll<HTMLElement>(CANDIDATE_SELECTOR) ?? []),
      );
      const index = tiles.indexOf(tile);
      if (index === -1) return;
      event.preventDefault();
      const columns = triage ? columnsIn(gridRef.current, CANDIDATE_SELECTOR) : 1;
      const step =
        key === "arrowright" ? 1 : key === "arrowleft" ? -1 : key === "arrowdown" ? columns : -columns;
      const next = tiles[Math.max(0, Math.min(tiles.length - 1, index + step))];
      next?.querySelector<HTMLElement>("[data-candidate-primary]")?.focus({ preventScroll: true });
      next?.scrollIntoView?.({ block: "nearest" });
    },
    [onCurate, onExclude, onExcludeEverywhere, triage],
  );

  return (
    // The band is a container, not a control: this catches keydown bubbling from the tiles
    // inside it. Every verb it accelerates (`c`, `x`, arrows) is also a labelled button on
    // each tile.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <section aria-labelledby={headingId} className="space-y-2" onKeyDown={onKeyDown}>
      <BandHeading
        id={headingId}
        icon="lucide:inbox"
        aside={
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant={triage ? "ghost" : "secondary"}
              size="sm"
              aria-pressed={!triage}
              onClick={() => chooseView("list")}
            >
              <Icon icon="lucide:list" size={14} />
              List
            </Button>
            <Button
              type="button"
              variant={triage ? "secondary" : "ghost"}
              size="sm"
              aria-pressed={triage}
              onClick={() => chooseView("triage")}
            >
              <Icon icon="lucide:layout-grid" size={14} />
              Triage
            </Button>
          </div>
        }
      >
        Candidate pool ({rows.length})
      </BandHeading>
      {rows.length > 0 ? (
        <p className="theme-text-faint text-xs">
          None of these are on the article. They matched this substance, and stay here — unordered —
          until you curate one. With a tile focused: <kbd>c</kbd> curates, <kbd>x</kbd> excludes it
          here, <kbd>Shift</kbd>+<kbd>X</kbd> excludes it everywhere, arrows move.
        </p>
      ) : (
        <p className="theme-text-faint text-xs">Every match is curated or excluded.</p>
      )}
      <ul
        ref={gridRef}
        className={cn(
          triage ? "grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4" : "space-y-2",
        )}
      >
        {visible.map((row) =>
          triage ? (
            <TriageTile
              key={row.match.replication.slug}
              row={row}
              focused={focusSlug === row.match.replication.slug}
              onCurate={onCurate}
              onExclude={onExclude}
              onExcludeEverywhere={onExcludeEverywhere}
              onFocusHandled={onFocusHandled}
            />
          ) : (
            <CandidateRow
              key={row.match.replication.slug}
              row={row}
              focused={focusSlug === row.match.replication.slug}
              onCurate={onCurate}
              onExclude={onExclude}
              onExcludeEverywhere={onExcludeEverywhere}
              onFocusHandled={onFocusHandled}
            />
          ),
        )}
      </ul>
      {pageCount > 1 ? (
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={current === 0}
            onClick={() => setPage(current - 1)}
          >
            <Icon icon="lucide:chevron-left" size={14} />
            Previous
          </Button>
          <span className="theme-text-faint text-xs tabular-nums">
            {start + 1}–{start + visible.length} of {rows.length}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={current >= pageCount - 1}
            onClick={() => setPage(current + 1)}
          >
            Next
            <Icon icon="lucide:chevron-right" size={14} />
          </Button>
        </div>
      ) : null}
    </section>
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
  onExcludeEverywhere,
  onDragEnd,
  focusSlug,
  onFocusHandled,
}: GalleryBoardListProps) {
  const headingBase = useId();
  const curatedHeadingId = `${headingBase}-curated`;
  const candidateHeadingId = `${headingBase}-candidates`;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );
  const { setNodeRef: setUncurateZoneRef, isOver: isOverUncurateZone } = useDroppable({
    id: UNCURATE_ZONE_ID,
  });

  const curatedRows = board.rows.filter((row) => row.band === "curated");
  const candidateRows = board.rows.filter((row) => row.band === "auto");
  const nothingCurated = board.curatedCount === 0;

  /**
   * The fold and the ghost slots are mutually exclusive: the curated list is
   * either longer than the cap or shorter than it. Both are now facts about
   * that list alone, since it is the only thing the article publishes.
   */
  const foldAfterPosition = board.curatedCount > board.cap ? board.cap : null;

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <div className="space-y-3">
        <section aria-labelledby={curatedHeadingId} className="space-y-2">
          <BandHeading
            id={curatedHeadingId}
            icon="lucide:pin"
            aside={
              <EditorStatusPill tone={board.filledSlots > 0 ? "info" : "neutral"}>
                {`${board.filledSlots} of ${board.cap} article slots filled`}
              </EditorStatusPill>
            }
          >
            On the article ({board.curatedCount})
          </BandHeading>
          <SortableContext
            items={curatedRows.map((row) => row.match.replication.slug)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="space-y-2">
              {curatedRows.map((row) => (
                <Fragment key={row.match.replication.slug}>
                  <CuratedRow
                    row={row}
                    curatedCount={board.curatedCount}
                    focused={focusSlug === row.match.replication.slug}
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
              Nothing is curated, so this article shows no replication showcase at all. Curate a work
              from the pool below to put it on the article.
            </p>
          ) : null}
          {board.emptySlots > 0 ? (
            <>
              <ul className="space-y-2">
                {Array.from({ length: board.emptySlots }, (_, index) => (
                  <GhostSlot
                    key={board.curatedCount + index + 1}
                    position={board.curatedCount + index + 1}
                  />
                ))}
              </ul>
              <p className="theme-text-faint text-xs">
                {board.emptySlots} of the article's {board.cap} slots are empty — {board.filledSlots}{" "}
                filled.
              </p>
            </>
          ) : board.curatedCount === board.cap ? (
            <p className="theme-text-faint text-xs">
              All {board.cap} article slots are filled exactly; nothing spills past the fold.
            </p>
          ) : null}
        </section>

        <div
          ref={setUncurateZoneRef}
          role="group"
          aria-label="Drop a curated row here to take it off the article"
          className={cn(
            "flex items-center gap-3 rounded-lg px-1 py-2",
            MOTION,
            isOverUncurateZone && "bg-[var(--editor-panel-bg-subtle)]",
          )}
        >
          <div className="theme-gradient-divider h-px flex-1" />
          <span className="theme-text-faint text-[11px] uppercase tracking-[0.3em]">
            Drop here to un-curate
          </span>
          <div className="theme-gradient-divider h-px flex-1" />
        </div>

        <CandidateBand
          headingId={candidateHeadingId}
          rows={candidateRows}
          focusSlug={focusSlug}
          onCurate={onCurate}
          onExclude={onExclude}
          onExcludeEverywhere={onExcludeEverywhere}
          onFocusHandled={onFocusHandled}
        />
      </div>
    </DndContext>
  );
}
