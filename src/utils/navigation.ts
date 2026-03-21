import type { MouseEvent } from "react";

type AnchorLikeEvent = MouseEvent<HTMLAnchorElement>;

export function isPlainLeftClick(event: AnchorLikeEvent) {
  return (
    event.button === 0 &&
    !event.defaultPrevented &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey &&
    (!event.currentTarget.target || event.currentTarget.target === "_self")
  );
}

export function prefersReducedMotion() {
  return typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function scrollIntoViewRespectingMotion(
  element: HTMLElement,
  options: Omit<ScrollIntoViewOptions, "behavior"> = {},
) {
  element.scrollIntoView({
    behavior: prefersReducedMotion() ? "auto" : "smooth",
    block: "start",
    ...options,
  });
}
