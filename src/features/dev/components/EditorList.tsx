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
  /** CSS length for the scroll box; defaults to `min(60vh, 640px)`. */
  maxHeight?: string;
  /** Pixel estimate used to size the window before rows are measured. */
  estimateRowHeight?: number;
  emptyText: string;
  /** Accessible name of the listbox. */
  label: string;
  className?: string;
  /**
   * False for items that only divide the list (group headings). They take a
   * row's height, are hidden from assistive tech, and the keys skip them.
   */
  isOption?: (item: T) => boolean;
  /**
   * A tick box on each row for bulk actions, separate from the one selected
   * row. Space on the list ticks the selected row; the box itself answers the
   * pointer only, and the option reports its state through aria-checked.
   */
  multiSelect?: EditorListMultiSelect<T>;
}

export interface EditorListMultiSelect<T> {
  checkedKeys: ReadonlySet<string>;
  onToggle: (key: string) => void;
  /** Tooltip of a row's tick box, such as "Select Mescaline". */
  checkLabel: (item: T) => string;
  /** Rows that cannot take the bulk actions get no checkbox. */
  canCheck?: (item: T) => boolean;
}

/**
 * Windowed list state: which slice of `count` rows is visible in a scroll box
 * of `viewport` pixels. Row heights are measured from the first mounted row
 * and fall back to `estimate`; the range carries `OVERSCAN_ROWS` on each side.
 */
function useWindow(count: number, estimate: number, scrollRef: RefObject<HTMLDivElement | null>) {
  const [scrollTop, setScrollTop] = useState(0);
  const [viewport, setViewport] = useState(0);
  const [rowHeight, setRowHeight] = useState(estimate);

  useLayoutEffect(() => {
    const box = scrollRef.current;
    if (!box) return;
    setViewport(box.clientHeight);
    const observer = new ResizeObserver(() => setViewport(box.clientHeight));
    observer.observe(box);
    return () => observer.disconnect();
  }, [scrollRef]);

  const onScroll = useCallback(() => {
    const box = scrollRef.current;
    if (box) setScrollTop(box.scrollTop);
  }, [scrollRef]);

  // Programmatic scrolls update the window in the same commit instead of
  // waiting for the scroll event, so the target row is mounted immediately.
  // The clamp mirrors the browser's so state and element agree.
  const scrollTo = useCallback(
    (top: number) => {
      const box = scrollRef.current;
      if (!box) return;
      const clamped = Math.max(0, Math.min(top, count * rowHeight - viewport));
      box.scrollTop = clamped;
      setScrollTop(clamped);
    },
    [scrollRef, count, rowHeight, viewport],
  );

  const measureRow = useCallback((node: HTMLElement | null) => {
    if (!node) return;
    const measured = node.getBoundingClientRect().height;
    if (measured > 0) setRowHeight((prev) => (Math.abs(prev - measured) < 1 ? prev : measured));
  }, []);

  // With no measured viewport yet (first paint, or jsdom) fall back to a
  // window sized like the default box so the initial render is still bounded.
  const visibleRows = Math.ceil((viewport || 640) / rowHeight);
  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - OVERSCAN_ROWS);
  const end = Math.min(count, start + visibleRows + OVERSCAN_ROWS * 2);

  return { start, end, rowHeight, viewport, onScroll, scrollTo, measureRow };
}

/**
 * Bounded, self-scrolling list for corpus-sized rails (contributors,
 * replications, substances, copy rows, playlist works, tags). Only the rows
 * inside the scroll box are mounted so the document never grows with the
 * corpus. Renders `role="listbox"` with `role="option"` rows, moves the
 * selection with the arrow keys, Home and End, and keeps the selected row in
 * view whenever `selectedKey` changes.
 *
 * Focus model: the listbox is the only tab stop. It keeps the current row in
 * `aria-activedescendant`, and options carry no tab index, so `renderItem`
 * must render a presentational row (`EditorListRow` with `active={selected}`)
 * and no buttons, links or inputs. The option wrapper owns the click and calls
 * `onSelect(key)`. The selected option stays mounted even when the pointer
 * scrolls it out of the window, so the active descendant always resolves, and
 * each option carries aria-posinset and aria-setsize against the whole list.
 *
 * Rows must share one height. `isOption` lets group headings sit in the list
 * at a row's pitch without becoming options, and `multiSelect` adds a tick box
 * per row for bulk actions. The ticks are aria-checked on the option, apart
 * from aria-selected, which marks the one current row. The intake queues pair
 * this list with `useTriageShortcuts`.
 */
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

  const { start, end, rowHeight, viewport, onScroll, scrollTo, measureRow } = useWindow(
    visible.length,
    estimateRowHeight,
    scrollRef,
  );

  const selectedIndex = useMemo(
    () => (selectedKey === null ? -1 : visible.findIndex((item) => getKey(item) === selectedKey)),
    [visible, getKey, selectedKey],
  );

  // Keep the selected row inside the box when the selection changes from
  // outside (URL restore, keyboard step, another pane picking a record).
  useEffect(() => {
    const box = scrollRef.current;
    if (!box || selectedIndex < 0) return;
    const top = selectedIndex * rowHeight;
    const bottom = top + rowHeight;
    if (top < box.scrollTop) {
      scrollTo(top);
    } else if (bottom > box.scrollTop + viewport) {
      scrollTo(bottom - viewport);
    }
  }, [selectedIndex, rowHeight, viewport, scrollTo]);

  const optionAt = useCallback((index: number) => !isOption || isOption(visible[index]), [isOption, visible]);

  // 1-based position of each option among the options (headings excluded),
  // so windowed rows can report aria-posinset and aria-setsize.
  const { positions, optionCount } = useMemo(() => {
    const next = new Array<number>(visible.length);
    let count = 0;
    for (let index = 0; index < visible.length; index += 1) {
      if (optionAt(index)) count += 1;
      next[index] = count;
    }
    return { positions: next, optionCount: count };
  }, [optionAt, visible.length]);

  /** The nearest option from `from` stepping by `step`, or -1 past either end. */
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
  // Row heights are measured from an option, never from a heading.
  const measuredOffset = rows.findIndex((_, offset) => optionAt(start + offset));
  const activeId = selectedIndex >= 0 ? `${id}-option-${selectedIndex}` : undefined;
  // A pointer scroll can carry the selected row out of the window. It stays
  // mounted at its own offset so aria-activedescendant never dangles.
  const selectedOutside = selectedIndex >= 0 && (selectedIndex < start || selectedIndex >= end);

  const renderOption = (item: T, index: number, measure: boolean) => {
    const key = getKey(item);
    const selected = index === selectedIndex;
    const checkable = multiSelect !== undefined && (!multiSelect.canCheck || multiSelect.canCheck(item));
    return (
      // Keyboard selection lives on the listbox (aria-activedescendant); options only take the pointer
      // and must not be focusable, or the list would grow a tab stop per row.
      // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/interactive-supports-focus
      <div
        id={`${id}-option-${index}`}
        role="option"
        aria-selected={selected}
        aria-checked={checkable ? multiSelect.checkedKeys.has(key) : undefined}
        aria-posinset={positions[index]}
        aria-setsize={optionCount}
        ref={measure ? measureRow : undefined}
        onClick={onSelect ? () => onSelect(key) : undefined}
        className={multiSelect ? "flex items-center gap-2 pb-1" : "pb-1"}
      >
        {multiSelect ? (
          <>
            <span className="flex w-5 shrink-0 justify-center">
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
        onScroll={onScroll}
        onKeyDown={handleKeyDown}
        style={{ maxHeight }}
        className="min-h-0 overflow-y-auto overscroll-contain rounded-xl theme-focus-ring"
      >
        {visible.length === 0 ? (
          <p className="theme-text-muted px-3 py-6 text-center text-sm">{emptyText}</p>
        ) : (
          <div style={{ height: visible.length * rowHeight, position: "relative" }}>
            <div style={{ transform: `translateY(${start * rowHeight}px)` }}>
              {rows.map((item, offset) => {
                const index = start + offset;
                if (!optionAt(index)) {
                  return (
                    <div key={getKey(item)} aria-hidden="true" style={{ height: rowHeight }} className="flex flex-col justify-end">
                      {renderItem(item, { selected: false })}
                    </div>
                  );
                }
                return <Fragment key={getKey(item)}>{renderOption(item, index, offset === measuredOffset)}</Fragment>;
              })}
            </div>
            {selectedOutside ? (
              <div style={{ position: "absolute", top: selectedIndex * rowHeight, left: 0, right: 0 }}>
                {renderOption(visible[selectedIndex], selectedIndex, false)}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The bulk tick for one row. It answers the pointer only: the listbox keeps
 * the single tab stop, Space ticks the current row, and the option reports the
 * state through aria-checked, so the box is hidden from assistive tech.
 */
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
      className="flex h-5 w-5 cursor-pointer items-center justify-center"
    >
      {/* Drawn, not a native input, so nothing inside the listbox can take focus. */}
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
