const SHEET_MEDIA = "(max-width: 63.999rem)";
const REDUCED_MOTION_MEDIA = "(prefers-reduced-motion: reduce)";

function matches(query: string): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.(query)?.matches ?? false;
}

function isFullyVisible(element: Element): boolean {
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return true;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
  return rect.top >= 0 && rect.bottom <= viewportHeight;
}

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
