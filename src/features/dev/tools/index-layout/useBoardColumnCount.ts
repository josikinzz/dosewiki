import { useLayoutEffect, useState } from "react";

/**
 * Column math for the layout board. The board sizes its own columns from the
 * width it actually has (the dev shell steals a rail from the viewport, so
 * the public index's viewport-based count overshoots and clips the last
 * column at laptop widths). The public grid's 300px minimum is the reference;
 * the board's cards carry a column select plus five icon buttons, which fit
 * comfortably at 280px, so the board packs one column more where that helps.
 */
export const BOARD_MIN_COLUMN_WIDTH = 280;
/** Matches the board grid's `gap-5`. */
export const BOARD_COLUMN_GAP = 20;
export const MAX_BOARD_COLUMNS = 6;

export function computeBoardColumnCount(containerWidth: number): number {
  if (!Number.isFinite(containerWidth) || containerWidth <= 0) {
    return 1;
  }
  const stride = BOARD_MIN_COLUMN_WIDTH + BOARD_COLUMN_GAP;
  const fitted = Math.floor((containerWidth + BOARD_COLUMN_GAP) / stride);
  return Math.min(MAX_BOARD_COLUMNS, Math.max(1, fitted));
}

/**
 * Measures the element handed to `ref` and reports how many board columns fit
 * inside it. Measures before paint (layout effect) so the first render at a
 * new width never shows the previous count.
 */
export function useBoardColumnCount(): {
  ref: (node: HTMLElement | null) => void;
  fitCount: number;
} {
  const [node, setNode] = useState<HTMLElement | null>(null);
  const [fitCount, setFitCount] = useState(1);

  useLayoutEffect(() => {
    if (!node) {
      return;
    }
    const measure = () => {
      setFitCount(computeBoardColumnCount(node.clientWidth));
    };
    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [node]);

  return { ref: setNode, fitCount };
}
