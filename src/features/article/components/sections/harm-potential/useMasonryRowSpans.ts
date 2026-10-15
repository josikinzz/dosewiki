"use client";

import { useEffect, useLayoutEffect, useRef } from "react";

const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

export const MASONRY_ROW_HEIGHT_PX = 4;
export const MASONRY_ROW_GAP_PX = 16;

export function getMasonryRowSpan(height: number) {
  return Math.max(1, Math.ceil((height + MASONRY_ROW_GAP_PX) / MASONRY_ROW_HEIGHT_PX));
}

export function useMasonryRowSpans<T extends HTMLElement>(itemCount: number) {
  const containerRef = useRef<T>(null);

  useIsomorphicLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
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
