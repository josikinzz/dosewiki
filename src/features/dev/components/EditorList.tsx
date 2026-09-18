import type { KeyboardEvent, ReactNode, RefObject } from "react";
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
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
 * Rows must share one height. The row wrapper owns the click and calls
 * `onSelect(key)`; `renderItem` should render a presentational row (an
 * `EditorListItem` with `active={selected}` and no `onSelect`) so a tap does
 * not report twice.
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

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!onSelect || visible.length === 0) return;
    let next: number;
    switch (event.key) {
      case "ArrowDown":
        next = Math.min(visible.length - 1, selectedIndex + 1);
        break;
      case "ArrowUp":
        next = Math.max(0, selectedIndex < 0 ? 0 : selectedIndex - 1);
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = visible.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    if (next !== selectedIndex) onSelect(getKey(visible[next]));
  };

  const rows = visible.slice(start, end);
  const activeId = selectedIndex >= 0 ? `${id}-option-${selectedIndex}` : undefined;

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
                const key = getKey(item);
                const selected = index === selectedIndex;
                return (
                  // Keyboard selection lives on the listbox (aria-activedescendant); rows only take the pointer.
                  // eslint-disable-next-line jsx-a11y/click-events-have-key-events
                  <div
                    key={key}
                    id={`${id}-option-${index}`}
                    role="option"
                    aria-selected={selected}
                    tabIndex={-1}
                    ref={offset === 0 ? measureRow : undefined}
                    onClick={onSelect ? () => onSelect(key) : undefined}
                    className="pb-1"
                  >
                    {renderItem(item, { selected })}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
