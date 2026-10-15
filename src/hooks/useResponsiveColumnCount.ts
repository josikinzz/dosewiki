"use client";

import { useLayoutEffect, useState } from "react";
import {
  computeIndexPanelColumnCount,
  guessIndexPanelColumnCount,
  INDEX_PANEL_LARGE_GAP,
  type IndexPanelColumnGate,
} from "@/components/common/indexPanelColumns";

type ResponsiveColumnOptions = {
  limitColumns?: boolean;
  maxColumns?: number;
};

export type ResponsiveColumnCount = {
  count: number;
  gate: IndexPanelColumnGate | null;
  ref: (element: HTMLDivElement | null) => void;
};

export function useResponsiveColumnCount(options?: ResponsiveColumnOptions): ResponsiveColumnCount {
  const limitColumns = options?.limitColumns ?? false;
  const maxColumns = options?.maxColumns ?? (limitColumns ? 3 : Number.POSITIVE_INFINITY);

  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const [measured, setMeasured] = useState<number | null>(null);

  useLayoutEffect(() => {
    if (!element) return;

    const measure = () => {
      const style = window.getComputedStyle(element);
      const width = element.getBoundingClientRect().width
        - (parseFloat(style.paddingLeft) || 0)
        - (parseFloat(style.paddingRight) || 0);
      const gap = parseFloat(style.columnGap) || INDEX_PANEL_LARGE_GAP;
      setMeasured(computeIndexPanelColumnCount(width, maxColumns, gap));
    };

    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(element);
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [element, maxColumns]);

  return {
    count: measured ?? guessIndexPanelColumnCount(maxColumns),
    gate: measured === null && maxColumns > 1 ? "pending" : null,
    ref: setElement,
  };
}
