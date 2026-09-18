import { useEffect, useRef, type RefObject } from "react";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/** Every dev master/detail tool stacks below its `lg:` grid. */
const STACKED_BELOW_LG_QUERY = "(max-width: 1023px)";

/**
 * Master/detail tools stack the list above the detail column below their grid
 * breakpoint, so picking a row would otherwise give no visible feedback. When
 * `selectionKey` changes to a non-null value and the viewport matches
 * `belowQuery` (the tool's own "stacked" query; every current tool uses the
 * `lg:` default), the element behind `ref` scrolls into view. Reduced-motion
 * users get an instant jump. Above the breakpoint, and on first render, nothing
 * happens: a deep link lands on the page as it always did.
 */
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
    // The detail column re-renders in the same commit as the selection; wait a
    // frame so its new height is laid out before the browser picks a target.
    const frame = requestAnimationFrame(() => {
      ref.current?.scrollIntoView({ behavior, block: "start" });
    });
    return () => cancelAnimationFrame(frame);
  }, [belowQuery, ref, selectionKey]);
}
