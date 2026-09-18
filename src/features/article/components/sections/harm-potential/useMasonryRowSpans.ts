"use client";

import { useEffect, useLayoutEffect, useRef } from "react";

// Matches the guard in app/_components/RouteChrome.tsx: useLayoutEffect warns during SSR.
const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

/** Fine row lattice the cards span across. Smaller packs tighter but costs more rows. */
export const MASONRY_ROW_HEIGHT_PX = 4;
/** Vertical gutter between stacked cards. Must match the `mb-4` on each masonry item. */
export const MASONRY_ROW_GAP_PX = 16;

/** Rows a card of `height` must span to cover itself plus its bottom gutter. */
export function getMasonryRowSpan(height: number) {
  return Math.max(1, Math.ceil((height + MASONRY_ROW_GAP_PX) / MASONRY_ROW_HEIGHT_PX));
}

/**
 * Masonry packing for cards that change height at runtime.
 *
 * Deliberately not `columns-*`. Multi-column is the only masonry technique that
 * packs by *fragmenting* content across column boxes, and Gecko mis-fragments
 * these flex cards: paragraphs split with stray leading, and an expanded card's
 * button paints outside its own border. Grid places whole elements, so
 * expanding a card just re-packs.
 *
 * Each card spans `ceil((height + gap) / rowHeight)` rows of a 4px lattice,
 * which gives `grid-auto-flow: row dense` enough resolution to backfill short
 * columns. A ResizeObserver keeps the span in sync as cards expand.
 *
 * The lattice is applied imperatively alongside the spans rather than through a
 * rendered class, so both always land in the same layout pass — a frame with
 * spans but no lattice would resolve `span 60` against auto-sized rows and blow
 * the section open. Before this runs (SSR, pre-hydration, no JS) the container
 * stays a plain top-aligned grid: correct, just not tetris-packed.
 *
 * @param itemCount rebinds the observer when the rendered card set changes.
 */
export function useMasonryRowSpans<T extends HTMLElement>(itemCount: number) {
  const containerRef = useRef<T>(null);

  useIsomorphicLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    // jsdom and older engines have no ResizeObserver; the plain grid is a fine fallback.
    if (typeof ResizeObserver === "undefined") return;

    const items = Array.from(container.children).filter(
      (child): child is HTMLElement => child instanceof HTMLElement,
    );

    const applySpan = (item: HTMLElement) => {
      item.style.gridRow = `span ${getMasonryRowSpan(item.getBoundingClientRect().height)}`;
    };

    container.style.gridAutoRows = `${MASONRY_ROW_HEIGHT_PX}px`;
    container.style.gridAutoFlow = "row dense";
    items.forEach(applySpan);

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target instanceof HTMLElement) applySpan(entry.target);
      }
    });
    items.forEach((item) => observer.observe(item));

    return () => {
      observer.disconnect();
      container.style.removeProperty("grid-auto-rows");
      container.style.removeProperty("grid-auto-flow");
      items.forEach((item) => item.style.removeProperty("grid-row"));
    };
  }, [itemCount]);

  return containerRef;
}
