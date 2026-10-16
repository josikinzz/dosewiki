import { useCallback, useEffect, useLayoutEffect, useRef } from "react";

const VIEWPORT_CAP_RATIO = 0.6;

export interface GrowToContent {
  ref: (element: HTMLTextAreaElement | null) => void;
  grow: () => void;
}

export function useGrowToContent(): GrowToContent {
  const elementRef = useRef<HTMLTextAreaElement | null>(null);
  const observerRef = useRef<ResizeObserver | null>(null);

  const grow = useCallback(() => {
    const element = elementRef.current;
    if (!element) return;
    element.style.height = "";
    if (element.scrollHeight <= element.clientHeight) return;
    const borderHeight = element.offsetHeight - element.clientHeight;
    const cap = Math.round(window.innerHeight * VIEWPORT_CAP_RATIO);
    element.style.height = `${Math.min(element.scrollHeight + borderHeight, cap)}px`;
  }, []);

  const ref = useCallback(
    (element: HTMLTextAreaElement | null) => {
      elementRef.current = element;
      observerRef.current?.disconnect();
      observerRef.current = null;
      if (!element || typeof ResizeObserver === "undefined") return;
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

  useLayoutEffect(grow);

  useEffect(() => () => observerRef.current?.disconnect(), []);

  return { ref, grow };
}
