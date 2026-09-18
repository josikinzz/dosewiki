/**
 * Bring the Theme Lab's editor back into view after a swatch is tapped.
 *
 * Only the mobile bottom sheet needs this: it scrolls as one column, so tapping
 * a swatch part-way down the catalog can leave the editor off-screen above.
 * Desktop pins the editor already, so this is a no-op there.
 *
 * Three rules keep it from being a jarring jump:
 *  - if the editor is already visible in the viewport, do nothing at all;
 *  - scroll to the *nearest* edge rather than slamming it to the top;
 *  - honour `prefers-reduced-motion` by jumping instantly instead of animating.
 */

/** Desktop breakpoint — matches the `max-width: 63.999rem` sheet media query. */
const SHEET_MEDIA = "(max-width: 63.999rem)";
const REDUCED_MOTION_MEDIA = "(prefers-reduced-motion: reduce)";

function matches(query: string): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.(query)?.matches ?? false;
}

/** True when the element's box already sits inside the viewport. */
function isFullyVisible(element: Element): boolean {
  const rect = element.getBoundingClientRect();
  // A zero box means jsdom (or a display:none ancestor); treat it as visible so
  // we never scroll something that has no place to scroll to.
  if (rect.width === 0 && rect.height === 0) return true;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
  return rect.top >= 0 && rect.bottom <= viewportHeight;
}

/**
 * Scroll `element` into view if — and only if — the mobile sheet is in play and
 * the element is not already on screen. Returns the options used (or null when
 * nothing was scrolled), which is what the tests assert on.
 */
export function revealEditorElement(element: Element | null | undefined): ScrollIntoViewOptions | null {
  if (!element) return null;
  if (typeof window === "undefined") return null;
  if (!matches(SHEET_MEDIA)) return null;
  if (isFullyVisible(element)) return null;
  const options: ScrollIntoViewOptions = {
    behavior: matches(REDUCED_MOTION_MEDIA) ? "auto" : "smooth",
    block: "nearest",
  };
  element.scrollIntoView?.(options);
  return options;
}
