"use client";

import { useLayoutEffect, useState } from "react";
import {
  computeIndexPanelColumnCount,
  guessIndexPanelColumnCount,
  indexPanelColumnGate,
  type IndexPanelColumnGate,
} from "@/components/common/indexPanelColumns";

type ResponsiveColumnOptions = {
  limitColumns?: boolean;
  maxColumns?: number;
};

export type ResponsiveColumnCount = {
  count: number;
  /**
   * Set until the viewport has been measured, so the server render and the
   * hydration render carry the same gate. Pass it to `IndexPanelGrid`, which
   * keeps the grid unpainted wherever the server guess is wrong for this
   * viewport. Null once measured, or when the cap makes the guess exact.
   */
  gate: IndexPanelColumnGate | null;
};

export function useResponsiveColumnCount(options?: ResponsiveColumnOptions): ResponsiveColumnCount {
  const limitColumns = options?.limitColumns ?? false;
  const maxColumns = options?.maxColumns ?? (limitColumns ? 3 : Number.POSITIVE_INFINITY);

  const [measured, setMeasured] = useState<number | null>(null);

  // Layout effect, not effect: on a client-side navigation or a tab remount
  // the measurement lands before the browser paints, so the guess is never
  // shown. On initial load the server HTML has already painted; the gate
  // covers that case.
  useLayoutEffect(() => {
    const measure = () => setMeasured(computeIndexPanelColumnCount(window.innerWidth, maxColumns));
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [maxColumns]);

  return measured === null
    ? { count: guessIndexPanelColumnCount(maxColumns), gate: indexPanelColumnGate(maxColumns) }
    : { count: measured, gate: null };
}
