"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { Icon } from "@/components/common/Icon";
import { Badge } from "@/components/ui/badge";
import { EditorPanel } from "@/features/dev/components";
import { cn } from "@/lib/utils";

import { ReplicationThumb } from "./ReplicationThumb";
import type { StudioGroup, StudioRow } from "./replicationStudioModel";

export type ReplicationGridProps = {
  groups: readonly StudioGroup[];
  selection: ReadonlySet<string>;
  /** The keyboard anchor; the box scrolls so its row is in view whenever it changes. */
  anchorId: string | null;
  onCardActivate: (event: React.MouseEvent, id: string) => void;
};

/** What the keyboard handler needs from the grid without touching its DOM. */
export type ReplicationGridHandle = {
  /** Cards per visual row at the current width. */
  columns: number;
};

/** Narrowest card the grid will draw before dropping a column. */
const MIN_CARD_WIDTH = 150;
const MAX_COLUMNS = 4;
/** `gap-3` in pixels; rows are spaced by the same amount as columns. */
const GAP = 12;
/** Rows kept mounted above and below the visible band. */
const OVERSCAN_ROWS = 3;
/** Height assumed for the box before it has been measured (first paint, jsdom). */
const FALLBACK_VIEWPORT = 640;
const FALLBACK_HEADER_HEIGHT = 40;

type Segment =
  | { kind: "header"; key: string; label: string; count: number; top: number; height: number }
  | { kind: "row"; key: string; rows: StudioRow[]; first: number; top: number; height: number };

function ReplicationCard({
  row,
  selected,
  position,
  total,
  onActivate,
}: {
  row: StudioRow;
  selected: boolean;
  position: number;
  total: number;
  onActivate: (event: React.MouseEvent, id: string) => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      aria-posinset={position}
      aria-setsize={total}
      data-id={row.id}
      onClick={(event) => onActivate(event, row.id)}
      data-state={selected ? "active" : undefined}
      className={cn(
        "theme-replication-card group relative flex min-w-0 flex-col gap-2 rounded-xl border p-2 text-left transition",
        selected ? undefined : "border-[color:var(--editor-panel-border)]",
      )}
    >
      <ReplicationThumb row={row} className="aspect-[4/3]" />

      {selected ? (
        <span className="absolute right-3 top-3 inline-flex size-5 items-center justify-center theme-replication-card-check rounded-full">
          <Icon icon="lucide:check" size={13} />
        </span>
      ) : null}

      <div className="min-w-0 space-y-1">
        <div className="theme-text-primary truncate text-sm font-medium">{row.title || "Untitled"}</div>
        <div className="theme-text-faint truncate text-xs">{row.artist}</div>
        {/* One line, always: every card in a row shares its height, which is
            what lets the box window rows without measuring each one. */}
        <div className="flex items-center gap-1 overflow-hidden whitespace-nowrap">
          {row.effect_name ? (
            <Badge variant="effect" className="min-w-0 shrink truncate">
              {row.effect_name}
            </Badge>
          ) : (
            <Badge variant="outline" className="shrink-0">
              No effect
            </Badge>
          )}
          <Badge variant="secondary" className="shrink-0">
            {row.type}
          </Badge>
          {row.role === "figure" ? (
            <Badge variant="outline" className="shrink-0">
              figure
            </Badge>
          ) : null}
          {row.effect_tags.length > 0 ? (
            <Badge variant="secondary" className="shrink-0">
              {row.effect_tags.length} tags
            </Badge>
          ) : null}
        </div>
      </div>
    </button>
  );
}

/**
 * Observes one element's height. The callback ref re-targets whenever the
 * probed element changes, so it can ride on "the first mounted row".
 */
function useHeightProbe(fallback: number) {
  const [height, setHeight] = useState(0);
  const observer = useRef<ResizeObserver | null>(null);
  const ref = useCallback((node: HTMLElement | null) => {
    observer.current?.disconnect();
    observer.current = null;
    if (!node) return;
    const report = () => {
      const measured = node.getBoundingClientRect().height;
      if (measured > 0) setHeight((prev) => (Math.abs(prev - measured) < 1 ? prev : measured));
    };
    report();
    if (typeof ResizeObserver === "undefined") return;
    observer.current = new ResizeObserver(report);
    observer.current.observe(node);
  }, []);
  useEffect(() => () => observer.current?.disconnect(), []);
  return [height || fallback, ref] as const;
}

function columnsFor(width: number): number {
  if (width <= 0) return 1;
  return Math.max(1, Math.min(MAX_COLUMNS, Math.floor((width + GAP) / (MIN_CARD_WIDTH + GAP))));
}

/** Index of the last segment whose top is at or above `offset`. */
function segmentAt(segments: readonly Segment[], offset: number): number {
  let low = 0;
  let high = segments.length - 1;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if (segments[mid].top <= offset) low = mid;
    else high = mid - 1;
  }
  return low;
}

/**
 * The media grid: a bounded box that scrolls inside itself and mounts only
 * the rows in view, so the page never grows with the corpus. Groups keep
 * their labelled headers inline, and the box scrolls to the keyboard anchor
 * when the arrows or the gallery board move it.
 */
export const ReplicationGrid = forwardRef<ReplicationGridHandle, ReplicationGridProps>(
  function ReplicationGrid({ groups, selection, anchorId, onCardActivate }, handle) {
    const total = groups.reduce((sum, group) => sum + group.rows.length, 0);
    const boxRef = useRef<HTMLDivElement>(null);
    const [width, setWidth] = useState(0);
    const [viewport, setViewport] = useState(0);
    const [scrollTop, setScrollTop] = useState(0);
    const columns = columnsFor(width);
    // Cards are 4:3 media plus three fixed text lines; this is what a row
    // costs before the first one has been measured.
    const cardWidth = columns > 0 && width > 0 ? (width - GAP * (columns - 1)) / columns : 200;
    const [rowHeight, rowProbe] = useHeightProbe(Math.round(cardWidth * 0.75 + 88));
    const [headerHeight, headerProbe] = useHeightProbe(FALLBACK_HEADER_HEIGHT);

    useImperativeHandle(handle, () => ({ columns }), [columns]);

    useLayoutEffect(() => {
      const box = boxRef.current;
      if (!box) return;
      const measure = () => {
        setWidth(box.clientWidth);
        setViewport(box.clientHeight);
      };
      measure();
      if (typeof ResizeObserver === "undefined") return;
      const observer = new ResizeObserver(measure);
      observer.observe(box);
      return () => observer.disconnect();
    }, [total]);

    const segments = useMemo<Segment[]>(() => {
      const list: Segment[] = [];
      let top = 0;
      let first = 0;
      for (const group of groups) {
        if (group.label) {
          list.push({
            kind: "header",
            key: `header:${group.key}`,
            label: group.label,
            count: group.rows.length,
            top,
            height: headerHeight,
          });
          top += headerHeight + GAP;
        }
        for (let index = 0; index < group.rows.length; index += columns) {
          const rows = group.rows.slice(index, index + columns);
          list.push({ kind: "row", key: rows[0].id, rows, first: first + index, top, height: rowHeight });
          top += rowHeight + GAP;
        }
        first += group.rows.length;
      }
      return list;
    }, [groups, columns, rowHeight, headerHeight]);

    const last = segments[segments.length - 1];
    const contentHeight = last ? last.top + last.height : 0;

    const onScroll = useCallback(() => {
      const box = boxRef.current;
      if (box) setScrollTop(box.scrollTop);
    }, []);

    // Scroll the anchor's row into the box whenever the anchor moves. Runs
    // again once a real row height lands so a mount-time anchor (a row the
    // gallery board asked to inspect) is honoured with true offsets.
    useEffect(() => {
      const box = boxRef.current;
      if (!box || !anchorId) return;
      const segment = segments.find(
        (entry) => entry.kind === "row" && entry.rows.some((row) => row.id === anchorId),
      );
      if (!segment) return;
      const bottom = segment.top + segment.height;
      if (segment.top < box.scrollTop) box.scrollTop = segment.top;
      else if (bottom > box.scrollTop + box.clientHeight) {
        box.scrollTop = Math.max(0, bottom - box.clientHeight);
      }
    }, [anchorId, segments]);

    if (total === 0) {
      return (
        <EditorPanel variant="empty" className="p-8 text-center text-sm">
          No replications match these filters. Clear a chip above, or drop files anywhere to add one.
        </EditorPanel>
      );
    }

    const band = viewport || FALLBACK_VIEWPORT;
    const start = Math.max(0, segmentAt(segments, scrollTop) - OVERSCAN_ROWS);
    const end = Math.min(segments.length, segmentAt(segments, scrollTop + band) + 1 + OVERSCAN_ROWS);
    const mounted = segments.slice(start, end);
    const firstRowKey = mounted.find((segment) => segment.kind === "row")?.key;
    const firstHeaderKey = mounted.find((segment) => segment.kind === "header")?.key;

    return (
      <div
        ref={boxRef}
        role="listbox"
        aria-multiselectable
        aria-label="Replications"
        onScroll={onScroll}
        className="relative max-h-[max(24rem,calc(100dvh-14rem))] overflow-y-auto overscroll-contain rounded-xl"
      >
        <div className="relative" style={{ height: contentHeight }}>
          {mounted.map((segment) =>
            segment.kind === "header" ? (
              <header
                key={segment.key}
                ref={segment.key === firstHeaderKey ? headerProbe : undefined}
                className="absolute inset-x-0 flex items-baseline gap-3 border-b border-[color:var(--editor-panel-border)] pb-1"
                style={{ top: segment.top }}
              >
                <h3 className="theme-accent-emphasis font-display text-base font-semibold">
                  {segment.label}
                </h3>
                <span className="theme-text-faint font-mono text-xs">
                  {segment.count} item{segment.count === 1 ? "" : "s"}
                </span>
              </header>
            ) : (
              <div
                key={segment.key}
                ref={segment.key === firstRowKey ? rowProbe : undefined}
                role="presentation"
                className="absolute inset-x-0 grid gap-3"
                style={{
                  top: segment.top,
                  gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                }}
              >
                {segment.rows.map((row, index) => (
                  <ReplicationCard
                    key={row.id}
                    row={row}
                    selected={selection.has(row.id)}
                    position={segment.first + index + 1}
                    total={total}
                    onActivate={onCardActivate}
                  />
                ))}
              </div>
            ),
          )}
        </div>
      </div>
    );
  },
);
