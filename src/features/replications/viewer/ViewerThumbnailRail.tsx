"use client";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FocusEvent,
  type ReactNode,
} from "react";

import { AppImage } from "@/components/common/AppImage";
import { audioWaveformBars } from "@/features/replications/audioWaveform";
import { Icon } from "@/components/common/Icon";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";
import { RotatingIcon } from "./RotatingIcon";
import { type ReplicationViewerMediaItem } from "./viewerModel";

/**
 * The rail renders a window, not the corpus: a 300-work group would otherwise
 * mount 300 optimized images into a 19,000px strip nobody scrolls end to end.
 * Slot geometry is deterministic (fixed thumb + fixed gap per breakpoint), so
 * skipped runs collapse into exact-width spacers and the scrollbar, snap
 * offsets, and scrollIntoView targets stay truthful to the full strip.
 */
const OVERSCAN = 8;
const GAP_PX = 8;
const THUMB_PX = { base: 48, sm: 56 } as const;

export interface ViewerThumbnailRailProps {
  items: ReplicationViewerMediaItem[];
  selectedIndex: number;
  groupLabel: string;
  rotated: boolean;
  chromeHidden: boolean;
  onSelect: (itemIndex: number) => void;
  focusRingClassName: string;
}

interface Span {
  start: number;
  end: number;
}

/**
 * Clamps candidate index spans to the corpus and merges overlapping or
 * adjacent ones into sorted disjoint runs — each run renders contiguously,
 * each gap between runs becomes one spacer.
 */
function mergeSpans(spans: Span[], lastIndex: number): Span[] {
  const clamped = spans
    .map((span) => ({
      start: Math.max(0, span.start),
      end: Math.min(lastIndex, span.end),
    }))
    .filter((span) => span.start <= span.end)
    .sort((a, b) => a.start - b.start);
  const merged: Span[] = [];
  for (const span of clamped) {
    const previous = merged[merged.length - 1];
    if (previous && span.start <= previous.end + 1) {
      previous.end = Math.max(previous.end, span.end);
    } else {
      merged.push({ ...span });
    }
  }
  return merged;
}

export function ViewerThumbnailRail({
  items,
  selectedIndex,
  groupLabel,
  rotated,
  chromeHidden,
  onSelect,
  focusRingClassName,
}: ViewerThumbnailRailProps) {
  const t = useT();
  const listRef = useRef<HTMLUListElement | null>(null);

  // Slot width is breakpoint-dependent (size-12 sm:size-14), read once from
  // the same media query Tailwind's `sm:` compiles to rather than measured
  // per item.
  const [smUp, setSmUp] = useState(
    () =>
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(min-width: 640px)").matches,
  );
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(min-width: 640px)");
    const onChange = (event: MediaQueryListEvent) => setSmUp(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  const slotWidth = (smUp ? THUMB_PX.sm : THUMB_PX.base) + GAP_PX;

  const [metrics, setMetrics] = useState({ scrollLeft: 0, clientWidth: 0 });
  const measure = useCallback(() => {
    const list = listRef.current;
    if (!list) return;
    setMetrics((previous) =>
      previous.scrollLeft === list.scrollLeft &&
      previous.clientWidth === list.clientWidth
        ? previous
        : { scrollLeft: list.scrollLeft, clientWidth: list.clientWidth },
    );
  }, []);
  useLayoutEffect(() => {
    measure();
  }, [measure, smUp, items.length]);

  // Scroll storms are collapsed to one measurement per frame.
  const scrollFrame = useRef<number | null>(null);
  const handleScroll = useCallback(() => {
    if (scrollFrame.current !== null) return;
    scrollFrame.current = requestAnimationFrame(() => {
      scrollFrame.current = null;
      measure();
    });
  }, [measure]);
  useEffect(
    () => () => {
      if (scrollFrame.current !== null)
        cancelAnimationFrame(scrollFrame.current);
    },
    [],
  );

  // A thumb the user tabbed onto must survive the window sliding away from
  // it, or focus silently falls to <body> mid-traversal: the focused index
  // joins the union below for as long as focus stays inside the list.
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const handleFocus = useCallback((event: FocusEvent<HTMLUListElement>) => {
    const indexed = (event.target as HTMLElement).closest<HTMLElement>(
      "[data-rail-index]",
    );
    if (!indexed) return;
    setFocusedIndex(Number(indexed.dataset.railIndex));
  }, []);
  const handleBlur = useCallback((event: FocusEvent<HTMLUListElement>) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null))
      return;
    setFocusedIndex(null);
  }, []);

  // Keep the active work visible in the rail as navigation moves. The span
  // union already guarantees the selected thumb is mounted this render.
  useEffect(() => {
    const selected = listRef.current?.querySelector<HTMLElement>(
      '[aria-current="true"]',
    );
    selected?.scrollIntoView?.({
      block: "nearest",
      inline: "nearest",
      behavior:
        typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
    });
  }, [selectedIndex]);

  const firstVisible = Math.max(0, Math.floor(metrics.scrollLeft / slotWidth));
  const lastVisible = Math.max(
    firstVisible,
    Math.ceil((metrics.scrollLeft + metrics.clientWidth) / slotWidth) - 1,
  );
  const spans = mergeSpans(
    [
      { start: firstVisible - OVERSCAN, end: lastVisible + OVERSCAN },
      { start: selectedIndex - OVERSCAN, end: selectedIndex + OVERSCAN },
      ...(focusedIndex !== null
        ? [{ start: focusedIndex - OVERSCAN, end: focusedIndex + OVERSCAN }]
        : []),
    ],
    items.length - 1,
  );

  const children: ReactNode[] = [];
  let cursor = 0;
  const pushSpacer = (skipped: number) => {
    children.push(
      <li
        key={`gap-${cursor}`}
        aria-hidden
        data-rail-spacer=""
        className="shrink-0"
        // N skipped slots minus the one flex gap the spacer itself absorbs.
        style={{ width: skipped * slotWidth - GAP_PX }}
      />,
    );
  };
  for (const span of spans) {
    if (span.start > cursor) pushSpacer(span.start - cursor);
    for (let itemIndex = span.start; itemIndex <= span.end; itemIndex += 1) {
      const item = items[itemIndex];
      const selected = itemIndex === selectedIndex;
      const gifLike = item.replication.format.toLowerCase() === "gif";
      // A clip is not a picture: its own URL in an <img> is a broken tile.
      const isAudio = item.replication.type === "audio";
      const thumb = isAudio
        ? null
        : gifLike
          ? item.replication.motion_poster_url
          : (item.replication.motion_poster_url ??
            item.replication.thumbnail_url ??
            item.replication.url);
      children.push(
        <li key={item.replication.slug} className="shrink-0 snap-start">
          <button
            type="button"
            data-rail-index={itemIndex}
            aria-label={t("Show {{title}}, work {{position}} of {{total}}", {
              title: item.replication.title,
              position: itemIndex + 1,
              total: items.length,
            })}
            aria-current={selected ? "true" : undefined}
            onClick={() => onSelect(itemIndex)}
            className={cn(
              "relative block size-12 overflow-hidden rounded-md border transition-[border-color,opacity] duration-200 motion-reduce:transition-none sm:size-14",
              selected
                ? "theme-media-thumbnail-selected opacity-100"
                : "theme-media-thumbnail-border opacity-65 hover:opacity-100",
              focusRingClassName,
            )}
          >
            {isAudio ? (
              <span
                aria-hidden
                className="flex h-full w-full items-end justify-center gap-[2px] px-1.5 py-2"
              >
                {audioWaveformBars(
                  item.replication.slug || item.replication.title,
                  8,
                ).map((barHeight, barIndex) => (
                  <span
                    key={barIndex}
                    className="theme-replication-waveform-bar w-[2px] flex-none rounded-full opacity-80"
                    style={{ height: `${barHeight.toFixed(0)}%` }}
                  />
                ))}
              </span>
            ) : thumb ? (
              <RotatingIcon rotated={rotated} className="h-full w-full">
                <AppImage
                  src={thumb}
                  alt=""
                  width={80}
                  height={80}
                  className="h-full w-full object-contain"
                />
              </RotatingIcon>
            ) : (
              <span className="theme-media-tile-creator grid h-full w-full place-items-center">
                <RotatingIcon rotated={rotated}>
                  <Icon icon="lucide:image-off" size={16} aria-hidden />
                </RotatingIcon>
              </span>
            )}
            <span
              aria-hidden
              className="theme-media-tile-title absolute bottom-0 left-0 min-w-4 rounded-tr bg-black/85 px-1 py-0.5 text-[10px] font-semibold leading-none tabular-nums"
            >
              <RotatingIcon rotated={rotated}>{itemIndex + 1}</RotatingIcon>
            </span>
          </button>
        </li>,
      );
    }
    cursor = span.end + 1;
  }
  if (cursor < items.length) pushSpacer(items.length - cursor);

  return (
    <nav
      aria-label={t("{{groupLabel}} works", { groupLabel })}
      inert={chromeHidden || undefined}
      aria-hidden={chromeHidden || undefined}
      className={cn(
        // Landscape phones surrender too much height to a browse strip the
        // swipe grammar already covers: the rail stands down and the work
        // keeps the screen.
        "theme-media-thumbnail-border absolute inset-x-0 bottom-0 z-10 bg-black/75 px-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] pt-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))] transition-opacity duration-200 motion-reduce:transition-none sm:px-5 sm:py-2 [@media(max-height:500px)]:hidden",
        chromeHidden && "opacity-0",
      )}
    >
      {/* Focus/blur bubble up from the thumb buttons; the list itself is
          never interactive — the listeners only track which thumb owns
          focus so the render window can keep it mounted. */}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
      <ul
        ref={listRef}
        onScroll={handleScroll}
        onFocus={handleFocus}
        onBlur={handleBlur}
        className="flex snap-x gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </ul>
    </nav>
  );
}
