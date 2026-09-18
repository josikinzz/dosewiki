"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";

import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { InteractiveContentCard } from "@/components/ui/surface";
import { cn } from "@/lib/utils";

import { columnsIn } from "./gridColumns";
import { GalleryMatchIdentity } from "./GalleryMatchIdentity";
import { ReplicationThumb } from "./ReplicationThumb";
import type { GalleryBoardRow } from "./substanceGalleryPortalModel";

/** Candidate rows drawn at once. Bounded on purpose: a big substance matches
 * hundreds of works, and mounting them all is what made the pool unreadable. */
const LIST_PAGE_SIZE = 12;
const TRIAGE_PAGE_SIZE = 24;

type CandidateView = "list" | "triage";

const CANDIDATE_VIEW_KEY = "dosewiki.replicationStudio.candidateView";

/** Marks a candidate tile/row so the band's keyboard verbs can find its slug. */
const CANDIDATE_ATTR = "data-candidate-slug";
const CANDIDATE_SELECTOR = `[${CANDIDATE_ATTR}]`;
export const MOTION = "transition-[background-color,opacity,box-shadow] duration-[240ms] ease-[cubic-bezier(0.25,1,0.5,1)] motion-reduce:transition-none";
/** Effective article position, whether automatic or explicitly prioritized. */
export function PositionNumber({ position, onStage }: { position: number; onStage: boolean }) {
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
export function ExcludeButton({ title, slug, onExclude }: { title: string; slug: string; onExclude: (slug: string) => void }) {
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
export function useBandFocus(focused: boolean, onFocusHandled: () => void) {
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
      title="Exclude everywhere: junk on every article, not just this one"
      onClick={() => onExcludeEverywhere(slug)}
    >
      <Icon icon="lucide:trash-2" size={14} />
    </Button>
  );
}

/** An automatically placed row that can be prioritized or excluded. */
function CandidateRow({
  row,
  focused,
  readOnly,
  onCurate,
  onExclude,
  onExcludeEverywhere,
  onFocusHandled,
}: {
  row: GalleryBoardRow;
  focused: boolean;
  readOnly: boolean;
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
          <PositionNumber position={row.position} onStage={row.onStage} />
          <GalleryMatchIdentity match={match} />
          {readOnly ? null : (
            <div className="flex shrink-0 items-center gap-1">
              <Button
                ref={primaryActionRef}
                variant="secondary"
                size="sm"
                data-candidate-primary
                aria-label={`Prioritize ${title}`}
                onClick={() => onCurate(slug)}
              >
                <Icon icon="lucide:pin" size={14} />
                Prioritize
              </Button>
              <ExcludeButton title={title} slug={slug} onExclude={onExclude} />
              <ExcludeEverywhereButton
                title={title}
                slug={slug}
                onExcludeEverywhere={onExcludeEverywhere}
              />
            </div>
          )}
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
  readOnly,
  onCurate,
  onExclude,
  onExcludeEverywhere,
  onFocusHandled,
}: {
  row: GalleryBoardRow;
  focused: boolean;
  readOnly: boolean;
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
        {readOnly ? null : (
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
              aria-label={`Prioritize ${title}`}
              onClick={() => onCurate(slug)}
            >
              <Icon icon="lucide:pin" size={14} />
              Prioritize
            </Button>
            <ExcludeButton title={title} slug={slug} onExclude={onExclude} />
            <ExcludeEverywhereButton
              title={title}
              slug={slug}
              onExcludeEverywhere={onExcludeEverywhere}
            />
          </div>
        )}
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
export function Fold({ cap }: { cap: number }) {
  return (
    <li className="list-none py-2">
      <div className="theme-replication-fold flex items-center gap-3 border-y px-3 py-2">
        <Icon icon="lucide:scissors" size={14} className="theme-accent-emphasis shrink-0" />
        <p className="theme-accent-emphasis text-[11px] font-semibold uppercase tracking-[0.24em]">
          The article stops here: positions {cap + 1}+ reach /replications only
        </p>
      </div>
    </li>
  );
}


export function BandHeading({
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
 * Automatically placed rows. Paged and available in visual triage mode because
 * large class-wide collections can still need selective priority or exclusion.
 */
export function CandidateBand({
  headingId,
  rows,
  cap,
  focusSlug,
  readOnly,
  onCurate,
  onExclude,
  onExcludeEverywhere,
  onFocusHandled,
}: {
  headingId: string;
  rows: GalleryBoardRow[];
  cap: number;
  focusSlug: string | null;
  readOnly: boolean;
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

  /** Keyboard verbs: `c` prioritizes, `x` excludes, arrows move focus. */
  const onKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLElement>) => {
      if (readOnly) return;
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
    [onCurate, onExclude, onExcludeEverywhere, readOnly, triage],
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
        Automatic placements ({rows.length})
      </BandHeading>
      {rows.length === 0 ? (
        <p className="theme-text-faint text-xs">Every published row has stored priority or is excluded.</p>
      ) : readOnly ? (
        <p className="theme-text-faint text-xs">
          These rows are already on the article in policy order.
        </p>
      ) : (
        <p className="theme-text-faint text-xs">
          These rows are already on the article in policy order. <kbd>c</kbd> adds ordering priority,
          <kbd>x</kbd> excludes here, <kbd>Shift</kbd>+<kbd>X</kbd> excludes everywhere, and arrows move.
        </p>
      )}
      <ul
        ref={gridRef}
        className={cn(
          triage ? "grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4" : "space-y-2",
        )}
      >
        {visible.map((row) => (
          <Fragment key={row.match.replication.slug}>
            {triage ? (
              <TriageTile
                row={row}
                focused={focusSlug === row.match.replication.slug}
                readOnly={readOnly}
                onCurate={onCurate}
                onExclude={onExclude}
                onExcludeEverywhere={onExcludeEverywhere}
                onFocusHandled={onFocusHandled}
              />
            ) : (
              <CandidateRow
                row={row}
                focused={focusSlug === row.match.replication.slug}
                readOnly={readOnly}
                onCurate={onCurate}
                onExclude={onExclude}
                onExcludeEverywhere={onExcludeEverywhere}
                onFocusHandled={onFocusHandled}
              />
            )}
            {row.position === cap ? <Fold cap={cap} /> : null}
          </Fragment>
        ))}
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
