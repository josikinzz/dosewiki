import { useEffect, useRef, type RefObject } from "react";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

const STACKED_BELOW_LG_QUERY = "(max-width: 1023px)";

export function useScrollToDetail(
  ref: RefObject<HTMLElement | null>,
  selectionKey: unknown,
  belowQuery: string = STACKED_BELOW_LG_QUERY,
): void {
  const previousKey = useRef(selectionKey);

  useEffect(() => {
    if (Object.is(selectionKey, previousKey.current)) {
      return;
    }
    previousKey.current = selectionKey;
    if (selectionKey === null || selectionKey === undefined) {
      return;
    }
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }
    if (!window.matchMedia(belowQuery).matches) {
      return;
    }
    const behavior: ScrollBehavior = window.matchMedia(REDUCED_MOTION_QUERY).matches ? "auto" : "smooth";
    const frame = requestAnimationFrame(() => {
      ref.current?.scrollIntoView({ behavior, block: "start" });
    });
    return () => cancelAnimationFrame(frame);
  }, [belowQuery, ref, selectionKey]);
}
