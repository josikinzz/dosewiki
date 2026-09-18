/**
 * Keeps a nested-effects textarea from silently clipping its wrapped content.
 *
 * The effect description and the subcategory/sense notes are deliberately short,
 * fixed-height fields with resizing disabled, so a description that wraps to one
 * line more than the field declares (narrow phones, or the 16px mobile control
 * size) hides its last line behind the border with no scrollbar or resize handle
 * to reach it. This grows the field only while the content overflows: the
 * declared rows/min-height footprint is untouched for content that already fits,
 * and growth is capped at 60% of the viewport so a long entry stays a field
 * rather than a page-long column.
 */

import { useCallback, useEffect, useLayoutEffect, useRef } from "react";

/** Growth ceiling: 60% of the viewport, so the cap follows the device. */
const VIEWPORT_CAP_RATIO = 0.6;

export interface GrowToContent {
  /** Attach to the textarea; composes with a React Hook Form ref. */
  ref: (element: HTMLTextAreaElement | null) => void;
  /** Re-measure after uncontrolled input, where no re-render happens. */
  grow: () => void;
}

export function useGrowToContent(): GrowToContent {
  const elementRef = useRef<HTMLTextAreaElement | null>(null);
  const observerRef = useRef<ResizeObserver | null>(null);

  const grow = useCallback(() => {
    const element = elementRef.current;
    if (!element) return;
    // Drop any previous growth first, so shortening the text shrinks the field
    // back to the footprint its rows/min-height class declares.
    element.style.height = "";
    if (element.scrollHeight <= element.clientHeight) return;
    const borderHeight = element.offsetHeight - element.clientHeight;
    const cap = Math.round(window.innerHeight * VIEWPORT_CAP_RATIO);
    element.style.height = `${Math.min(element.scrollHeight + borderHeight, cap)}px`;
  }, []);

  // A callback ref rather than a ref object: a field inside a collapsed card
  // attaches long after the card mounted, and a collapsed field measures zero,
  // so measurement has to follow the node instead of this hook's own mount.
  const ref = useCallback(
    (element: HTMLTextAreaElement | null) => {
      elementRef.current = element;
      observerRef.current?.disconnect();
      observerRef.current = null;
      if (!element || typeof ResizeObserver === "undefined") return;
      // Wrapping depends on width, so re-measure when the column resizes and
      // when a hidden field first gains a width. Width-only: reacting to our
      // own height write would loop.
      let lastWidth = element.clientWidth;
      const observer = new ResizeObserver((entries) => {
        const width = entries[entries.length - 1]?.contentRect.width;
        if (width === undefined || width === lastWidth) return;
        lastWidth = width;
        grow();
      });
      observer.observe(element);
      observerRef.current = observer;
      grow();
    },
    [grow],
  );

  // Controlled fields re-render on every keystroke; this also covers a form
  // reset and an appearance change that alters the line height.
  useLayoutEffect(grow);

  useEffect(() => () => observerRef.current?.disconnect(), []);

  return { ref, grow };
}
