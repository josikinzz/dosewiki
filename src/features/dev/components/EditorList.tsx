import type { KeyboardEvent, ReactNode, RefObject } from "react";
import { Fragment, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const DEFAULT_MAX_HEIGHT = "min(60vh, 640px)";
const DEFAULT_ROW_HEIGHT = 60;
const OVERSCAN_ROWS = 6;

export interface EditorListProps<T> {
  items: readonly T[];
  getKey: (item: T) => string;
  renderItem: (item: T, state: { selected: boolean }) => ReactNode;
  selectedKey?: string | null;
  onSelect?: (key: string) => void;
  search?: { placeholder: string; matches: (item: T, query: string) => boolean };
  maxHeight?: string;
  estimateRowHeight?: number;
  emptyText: string;
  label: string;
  className?: string;
  isOption?: (item: T) => boolean;
  multiSelect?: EditorListMultiSelect<T>;
}

export interface EditorListMultiSelect<T> {
  checkedKeys: ReadonlySet<string>;
  onToggle: (key: string) => void;
  checkLabel: (item: T) => string;
  canCheck?: (item: T) => boolean;
}

const MAX_REVEAL_CORRECTIONS = 4;

function rowAt(offsets: Float64Array, count: number, top: number): number {
  let low = 0;
  let high = count;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (offsets[mid + 1] <= top) low = mid + 1;
    else high = mid;
  }
  return low;
}

function useWindow(
  keys: readonly string[],
  fixed: (index: number) => boolean,
  estimate: number,
  scrollRef: RefObject<HTMLDivElement | null>,
) {
  const count = keys.length;
  const [scrollTop, setScrollTop] = useState(0);
  const [viewport, setViewport] = useState(0);
  const heights = useRef(new Map<string, number>());
  const [baseline, setBaseline] = useState(estimate);
  const [measured, setMeasured] = useState(0);
  const observer = useRef<ResizeObserver | null>(null);

  useLayoutEffect(() => {
    const box = scrollRef.current;
    if (!box) return;
    setViewport(box.clientHeight);
    const boxObserver = new ResizeObserver(() => setViewport(box.clientHeight));
    boxObserver.observe(box);
    return () => boxObserver.disconnect();
  }, [scrollRef]);

  const record = useCallback((node: HTMLElement) => {
    const key = node.dataset.rowKey;
    if (!key) return;
    const height = node.getBoundingClientRect().height;
    if (height <= 0) return;
    const known = heights.current.get(key);
    if (known !== undefined && Math.abs(known - height) < 1) return;
    heights.current.set(key, height);
    if (node.dataset.rowOption === "true") setBaseline((prev) => (prev === estimate ? height : prev));
    setMeasured((version) => version + 1);
  }, [estimate]);

  useEffect(() => {
    if (typeof ResizeObserver === "undefined") return;
    const rows = new ResizeObserver((entries) => {
      for (const entry of entries) record(entry.target as HTMLElement);
    });
    observer.current = rows;
    return () => {
      rows.disconnect();
      observer.current = null;
    };
  }, [record]);

  const measureRow = useCallback(
    (node: HTMLElement | null) => {
      if (!node) return;
      record(node);
      observer.current?.observe(node);
      return () => observer.current?.unobserve(node);
    },
    [record],
  );

  const offsets = useMemo(() => {
    const next = new Float64Array(count + 1);
    for (let index = 0; index < count; index += 1) {
      const height = fixed(index) ? baseline : (heights.current.get(keys[index]) ?? baseline);
      next[index + 1] = next[index] + height;
    }
    return next;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys, count, fixed, baseline, measured]);
  const total = offsets[count];

  const onScroll = useCallback(() => {
    const box = scrollRef.current;
    if (box) setScrollTop(box.scrollTop);
  }, [scrollRef]);

  const scrollTo = useCallback(
    (top: number) => {
      const box = scrollRef.current;
      if (!box) return;
      const clamped = Math.max(0, Math.min(top, total - viewport));
      box.scrollTop = clamped;
      setScrollTop(clamped);
    },
    [scrollRef, total, viewport],
  );

  const span = viewport || 640;
  const first = count === 0 ? 0 : rowAt(offsets, count, scrollTop);
  const last = count === 0 ? 0 : rowAt(offsets, count, scrollTop + span);
  const start = Math.max(0, first - OVERSCAN_ROWS);
  const end = Math.min(count, last + 1 + OVERSCAN_ROWS);

  return { start, end, offsets, viewport, layoutVersion: `${measured}:${baseline}`, onScroll, scrollTo, measureRow };
}

export function EditorList<T>({
  items,
  getKey,
  renderItem,
  selectedKey = null,
  onSelect,
  search,
  maxHeight = DEFAULT_MAX_HEIGHT,
  estimateRowHeight = DEFAULT_ROW_HEIGHT,
  emptyText,
  label,
  className,
  isOption,
  multiSelect,
}: EditorListProps<T>) {
  const id = useId();
  const [query, setQuery] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const visible = useMemo(() => {
    const trimmed = query.trim();
    if (!search || trimmed.length === 0) return items;
    return items.filter((item) => search.matches(item, trimmed));
  }, [items, query, search]);

  const keys = useMemo(() => visible.map(getKey), [visible, getKey]);
  const optionAt = useCallback((index: number) => !isOption || isOption(visible[index]), [isOption, visible]);
  const headingAt = useCallback((index: number) => !optionAt(index), [optionAt]);

  const { start, end, offsets, viewport, layoutVersion, onScroll, scrollTo, measureRow } = useWindow(
    keys,
    headingAt,
    estimateRowHeight,
    scrollRef,
  );

  const selectedIndex = useMemo(
    () => (selectedKey === null ? -1 : keys.indexOf(selectedKey)),
    [keys, selectedKey],
  );

  const reveal = useRef<{ index: number; corrections: number } | null>(null);
  const revealSelected = () => {
    const box = scrollRef.current;
    const pending = reveal.current;
    if (!box || !pending) return;
    if (pending.corrections >= MAX_REVEAL_CORRECTIONS) {
      reveal.current = null;
      return;
    }
    const top = offsets[pending.index];
    const bottom = offsets[pending.index + 1];
    const view = viewport || box.clientHeight;
    if (top < box.scrollTop) scrollTo(top);
    else if (view > 0 && bottom > box.scrollTop + view) scrollTo(bottom - view);
    else return;
    pending.corrections += 1;
  };

  useEffect(() => {
    reveal.current = selectedIndex >= 0 ? { index: selectedIndex, corrections: 0 } : null;
    revealSelected();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIndex, viewport]);

  useEffect(() => {
    revealSelected();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutVersion]);

  const handleScroll = () => {
    const box = scrollRef.current;
    const pending = reveal.current;
    if (box && pending && pending.corrections > 0) {
      const top = offsets[pending.index];
      const bottom = offsets[pending.index + 1];
      const view = viewport || box.clientHeight;
      const inView = top >= box.scrollTop - 1 && bottom <= box.scrollTop + view + 1;
      if (!inView) reveal.current = null;
    }
    onScroll();
  };

  const { positions, optionCount } = useMemo(() => {
    const next = new Array<number>(visible.length);
    let count = 0;
    for (let index = 0; index < visible.length; index += 1) {
      if (optionAt(index)) count += 1;
      next[index] = count;
    }
    return { positions: next, optionCount: count };
  }, [optionAt, visible.length]);

  const seekOption = useCallback(
    (from: number, step: 1 | -1) => {
      for (let index = from; index >= 0 && index < visible.length; index += step) {
        if (optionAt(index)) return index;
      }
      return -1;
    },
    [optionAt, visible.length],
  );

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.defaultPrevented || visible.length === 0) return;
    if (event.key === " " && multiSelect && selectedIndex >= 0) {
      const item = visible[selectedIndex];
      event.preventDefault();
      if (!multiSelect.canCheck || multiSelect.canCheck(item)) multiSelect.onToggle(getKey(item));
      return;
    }
    if (!onSelect) return;
    let next: number;
    switch (event.key) {
      case "ArrowDown":
        next = selectedIndex < 0 ? seekOption(0, 1) : seekOption(selectedIndex + 1, 1);
        break;
      case "ArrowUp":
        next = selectedIndex < 0 ? seekOption(0, 1) : seekOption(selectedIndex - 1, -1);
        break;
      case "Home":
        next = seekOption(0, 1);
        break;
      case "End":
        next = seekOption(visible.length - 1, -1);
        break;
      default:
        return;
    }
    event.preventDefault();
    if (next >= 0 && next !== selectedIndex) onSelect(getKey(visible[next]));
  };

  const rows = visible.slice(start, end);
  const activeId = selectedIndex >= 0 ? `${id}-option-${selectedIndex}` : undefined;
  const selectedOutside = selectedIndex >= 0 && (selectedIndex < start || selectedIndex >= end);

  const renderOption = (item: T, index: number) => {
    const key = getKey(item);
    const selected = index === selectedIndex;
    const checkable = multiSelect !== undefined && (!multiSelect.canCheck || multiSelect.canCheck(item));
    return (
      // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/interactive-supports-focus
      <div
        id={`${id}-option-${index}`}
        role="option"
        aria-selected={selected}
        aria-checked={checkable ? multiSelect.checkedKeys.has(key) : undefined}
        aria-posinset={positions[index]}
        aria-setsize={optionCount}
        data-row-key={key}
        data-row-option="true"
        ref={measureRow}
        onClick={onSelect ? () => onSelect(key) : undefined}
        className={multiSelect ? "flex items-center gap-2 pb-1" : "pb-1"}
      >
        {multiSelect ? (
          <>
            <span className="flex w-5 shrink-0 justify-center [@media(pointer:coarse)]:w-11">
              {checkable ? <TickBox item={item} itemKey={key} multiSelect={multiSelect} /> : null}
            </span>
            <div className="min-w-0 flex-1">{renderItem(item, { selected })}</div>
          </>
        ) : (
          renderItem(item, { selected })
        )}
      </div>
    );
  };

  return (
    <div className={cn("flex min-h-0 flex-col gap-2", className)}>
      {search ? (
        <Input
          type="search"
          inputSize="sm"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={search.placeholder}
          aria-label={search.placeholder}
          aria-controls={`${id}-listbox`}
        />
      ) : null}
      <div
        ref={scrollRef}
        id={`${id}-listbox`}
        role="listbox"
        aria-label={label}
        aria-activedescendant={activeId}
        tabIndex={0}
        onScroll={handleScroll}
        onKeyDown={handleKeyDown}
        style={{ maxHeight }}
        className="theme-dev-listbox min-h-0 overflow-y-auto overscroll-contain rounded-xl theme-focus-ring"
      >
        {visible.length === 0 ? (
          <p className="theme-text-muted px-3 py-6 text-center text-sm">{emptyText}</p>
        ) : (
          <div style={{ height: offsets[visible.length], position: "relative" }}>
            <div style={{ transform: `translateY(${offsets[start]}px)` }}>
              {rows.map((item, offset) => {
                const index = start + offset;
                if (!optionAt(index)) {
                  return (
                    <div
                      key={getKey(item)}
                      aria-hidden="true"
                      style={{ height: offsets[index + 1] - offsets[index] }}
                      className="flex flex-col justify-end"
                    >
                      {renderItem(item, { selected: false })}
                    </div>
                  );
                }
                return <Fragment key={getKey(item)}>{renderOption(item, index)}</Fragment>;
              })}
            </div>
            {selectedOutside ? (
              <div style={{ position: "absolute", top: offsets[selectedIndex], left: 0, right: 0 }}>
                {renderOption(visible[selectedIndex], selectedIndex)}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

function TickBox<T>({ item, itemKey, multiSelect }: { item: T; itemKey: string; multiSelect: EditorListMultiSelect<T> }) {
  const checked = multiSelect.checkedKeys.has(itemKey);
  return (
    <span
      aria-hidden="true"
      title={multiSelect.checkLabel(item)}
      data-checked={checked || undefined}
      onClick={(event) => {
        event.stopPropagation();
        multiSelect.onToggle(itemKey);
      }}
      className="flex h-5 w-5 cursor-pointer items-center justify-center [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11"
    >
      <span
        className={cn(
          "flex size-4 items-center justify-center rounded border transition",
          checked
            ? "theme-list-tick-checked"
            : "theme-list-tick",
        )}
      >
        {checked ? (
          <svg viewBox="0 0 16 16" className="size-3" fill="none" stroke="currentColor" strokeWidth={2.5}>
            <path d="M3.5 8.5l3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : null}
      </span>
    </span>
  );
}
