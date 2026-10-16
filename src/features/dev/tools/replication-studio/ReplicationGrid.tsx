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
import { Button } from "@/components/ui/button";
import { EditorPanel } from "@/features/dev/components";
import { cn } from "@/lib/utils";

import { ReplicationThumb } from "./ReplicationThumb";
import type { StudioGroup, StudioRow } from "./replicationStudioModel";

export type StudioGridView = "grid" | "list";
export type StudioGridDensity = "compact" | "comfortable" | "large";

export type ReplicationGridProps = {
  groups: readonly StudioGroup[];
  selection: ReadonlySet<string>;
  anchorId: string | null;
  onCardActivate: (event: React.MouseEvent, id: string) => void;
  view?: StudioGridView;
  density?: StudioGridDensity;
  hideEffect?: boolean;
  onClearFilters?: () => void;
};

export type ReplicationGridHandle = {
  columns: number;
};

const MIN_CARD_WIDTH: Record<StudioGridDensity, number> = {
  compact: 120,
  comfortable: 160,
  large: 240,
};
const MAX_COLUMNS = 10;
const LIST_ROW_HEIGHT = 60;
const GAP = 12;
const OVERSCAN_ROWS = 3;
const FALLBACK_VIEWPORT = 640;
const FALLBACK_HEADER_HEIGHT = 40;

type Segment =
  | { kind: "header"; key: string; label: string; count: number; top: number; height: number }
  | { kind: "row"; key: string; rows: StudioRow[]; first: number; top: number; height: number };

type CardFlag = { label: string; tone?: "warning" };

function flagsFor(row: StudioRow): CardFlag[] {
  const flags: CardFlag[] = [];
  if (row.publication_state === "unpublished") flags.push({ label: "Unpublished", tone: "warning" });
  if (!row.effect_slug) flags.push({ label: "No effect", tone: "warning" });
  if (row.role === "figure") flags.push({ label: "Figure" });
  if (row.rights_status === "unknown") flags.push({ label: "Rights unknown", tone: "warning" });
  return flags;
}

type ItemProps = {
  row: StudioRow;
  selected: boolean;
  focusable: boolean;
  position: number;
  total: number;
  hideEffect: boolean;
  onActivate: (event: React.MouseEvent, id: string) => void;
};

function ReplicationCard({ row, selected, focusable, position, total, hideEffect, onActivate }: ItemProps) {
  const flags = flagsFor(row);
  const effect = hideEffect ? null : row.effect_name;
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      aria-posinset={position}
      aria-setsize={total}
      tabIndex={focusable ? 0 : -1}
      data-id={row.id}
      onClick={(event) => onActivate(event, row.id)}
      data-state={selected ? "active" : undefined}
      className={cn(
        "theme-replication-card group relative flex min-w-0 flex-col gap-2 rounded-xl border p-1.5 text-left transition",
        selected ? undefined : "border-[color:var(--editor-panel-border)]",
      )}
    >
      <div className="relative">
        <ReplicationThumb row={row} className="aspect-[4/3]" />
        {flags.length > 0 ? (
          <span className="absolute left-1.5 top-1.5 flex max-w-[calc(100%-2.5rem)] flex-wrap gap-1">
            {flags.map((flag) => (
              <span
                key={flag.label}
                data-tone={flag.tone}
                className="theme-replication-card-flag rounded-full px-2 py-0.5 text-xs font-medium leading-4"
              >
                {flag.label}
              </span>
            ))}
          </span>
        ) : null}
        {selected ? (
          <span className="absolute right-1.5 top-1.5 inline-flex size-5 items-center justify-center theme-replication-card-check rounded-full">
            <Icon icon="lucide:check" size={13} />
          </span>
        ) : null}
      </div>

      <div className="min-w-0 px-1 pb-0.5">
        <div className="theme-text-primary truncate text-sm font-medium">{row.title || "Untitled"}</div>
        <div className="theme-text-faint truncate text-xs">
          {row.artist}
          {effect ? (
            <>
              <span aria-hidden="true"> · </span>
              <span className="theme-text-secondary">{effect}</span>
            </>
          ) : null}
        </div>
      </div>
    </button>
  );
}

function ReplicationListRow({ row, selected, focusable, position, total, hideEffect, onActivate }: ItemProps) {
  const flags = flagsFor(row);
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      aria-posinset={position}
      aria-setsize={total}
      tabIndex={focusable ? 0 : -1}
      data-id={row.id}
      onClick={(event) => onActivate(event, row.id)}
      data-state={selected ? "active" : undefined}
      className="theme-replication-list-row grid w-full grid-cols-[4rem_minmax(0,2fr)_minmax(0,1fr)_minmax(0,1.2fr)] items-center gap-3 rounded-lg px-2 text-left text-sm transition"
      style={{ height: LIST_ROW_HEIGHT }}
    >
      <ReplicationThumb row={row} showGlyph={false} className="h-12 w-16" />
      <span className="min-w-0">
        <span className="theme-text-primary block truncate font-medium">{row.title || "Untitled"}</span>
        <span className="theme-text-faint block truncate text-xs">{row.artist}</span>
      </span>
      <span className="theme-text-secondary min-w-0 truncate text-xs">
        {hideEffect ? null : row.effect_name ?? null}
      </span>
      <span className="flex min-w-0 flex-wrap items-center gap-1">
        {flags.map((flag) => (
          <Badge key={flag.label} variant={flag.tone === "warning" ? "outline" : "secondary"}>
            {flag.label}
          </Badge>
        ))}
        {row.effect_tags.length > 0 ? (
          <span className="theme-text-faint text-xs tabular-nums">
            {row.effect_tags.length} tag{row.effect_tags.length === 1 ? "" : "s"}
          </span>
        ) : null}
      </span>
    </button>
  );
}

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

function columnsFor(width: number, density: StudioGridDensity): number {
  if (width <= 0) return 1;
  const min = MIN_CARD_WIDTH[density];
  return Math.max(1, Math.min(MAX_COLUMNS, Math.floor((width + GAP) / (min + GAP))));
}

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

export const ReplicationGrid = forwardRef<ReplicationGridHandle, ReplicationGridProps>(
  function ReplicationGrid(
    {
      groups,
      selection,
      anchorId,
      onCardActivate,
      view = "grid",
      density = "comfortable",
      hideEffect = false,
      onClearFilters,
    },
    handle,
  ) {
    const total = groups.reduce((sum, group) => sum + group.rows.length, 0);
    const boxRef = useRef<HTMLDivElement>(null);
    const [width, setWidth] = useState(0);
    const [viewport, setViewport] = useState(0);
    const [scrollTop, setScrollTop] = useState(0);
    const columns = view === "list" ? 1 : columnsFor(width, density);
    const gap = view === "list" ? 2 : GAP;
    const cardWidth = columns > 0 && width > 0 ? (width - GAP * (columns - 1)) / columns : 200;
    const [measuredRow, rowProbe] = useHeightProbe(Math.round(cardWidth * 0.75 + 60));
    const rowHeight = view === "list" ? LIST_ROW_HEIGHT : measuredRow;
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
          top += headerHeight + gap;
        }
        for (let index = 0; index < group.rows.length; index += columns) {
          const rows = group.rows.slice(index, index + columns);
          list.push({ kind: "row", key: rows[0].id, rows, first: first + index, top, height: rowHeight });
          top += rowHeight + gap;
        }
        first += group.rows.length;
      }
      return list;
    }, [groups, columns, rowHeight, headerHeight, gap]);

    const last = segments[segments.length - 1];
    const contentHeight = last ? last.top + last.height : 0;

    const onScroll = useCallback(() => {
      const box = boxRef.current;
      if (box) setScrollTop(box.scrollTop);
    }, []);

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

    useEffect(() => {
      const box = boxRef.current;
      if (!box || !anchorId || !box.contains(document.activeElement)) return;
      const card = box.querySelector<HTMLElement>(`[data-id="${CSS.escape(anchorId)}"]`);
      if (card && card !== document.activeElement) card.focus({ preventScroll: true });
    });

    if (total === 0) {
      return (
        <EditorPanel variant="empty" className="space-y-3 p-8 text-center text-sm">
          <p>No replications match these filters.</p>
          {onClearFilters ? (
            <Button type="button" variant="secondary" size="sm" onClick={onClearFilters}>
              Clear filters
            </Button>
          ) : (
            <p className="theme-text-faint">Drop files anywhere to add one.</p>
          )}
        </EditorPanel>
      );
    }

    const band = viewport || FALLBACK_VIEWPORT;
    const start = Math.max(0, segmentAt(segments, scrollTop) - OVERSCAN_ROWS);
    const end = Math.min(segments.length, segmentAt(segments, scrollTop + band) + 1 + OVERSCAN_ROWS);
    const mounted = segments.slice(start, end);
    const firstRowKey = mounted.find((segment) => segment.kind === "row")?.key;
    const firstHeaderKey = mounted.find((segment) => segment.kind === "header")?.key;
    const mountedIds = mounted.flatMap((segment) =>
      segment.kind === "row" ? segment.rows.map((row) => row.id) : [],
    );
    const tabStop = anchorId && mountedIds.includes(anchorId) ? anchorId : mountedIds[0];
    const pinned = (() => {
      let label: { label: string; count: number } | null = null;
      for (const segment of segments) {
        if (segment.top > scrollTop) break;
        if (segment.kind === "header") label = { label: segment.label, count: segment.count };
      }
      return label;
    })();

    return (
      <div
        ref={boxRef}
        role="listbox"
        aria-multiselectable
        aria-label="Replications"
        onScroll={onScroll}
        data-studio-grid=""
        className="relative h-full min-h-[18rem] overflow-y-auto rounded-xl"
      >
        {pinned && scrollTop > 0 ? (
          <div className="sticky top-0 z-10 h-0" aria-hidden="true">
            <div className="theme-replication-pinned-header flex items-baseline gap-3 border-b pb-1" style={{ height: headerHeight }}>
              <span className="theme-accent-emphasis font-display text-base font-semibold">{pinned.label}</span>
              <span className="theme-text-faint text-xs tabular-nums">
                {pinned.count} item{pinned.count === 1 ? "" : "s"}
              </span>
            </div>
          </div>
        ) : null}
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
                {segment.rows.map((row, index) => {
                  const Item = view === "list" ? ReplicationListRow : ReplicationCard;
                  return (
                    <Item
                      key={row.id}
                      row={row}
                      selected={selection.has(row.id)}
                      focusable={row.id === tabStop}
                      position={segment.first + index + 1}
                      total={total}
                      hideEffect={hideEffect}
                      onActivate={onCardActivate}
                    />
                  );
                })}
              </div>
            ),
          )}
        </div>
      </div>
    );
  },
);
