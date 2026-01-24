import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

interface Position {
  top: number;
  left: number;
}

interface UseListboxPositioningOptions {
  /** Reference to the container element (e.g., the input wrapper) */
  containerRef: RefObject<HTMLElement | null>;
  /** Whether positioning should be active */
  enabled: boolean;
  /** Gap between container and listbox in pixels (default: 8) */
  gap?: number;
}

interface UseListboxPositioningReturn {
  /** Calculated position for the listbox, or null if not applicable */
  position: Position | null;
  /** Whether we're in mobile viewport mode */
  isMobile: boolean;
}

/**
 * Hook for mobile-aware listbox positioning.
 *
 * Handles the complex positioning logic needed for dropdown menus on mobile,
 * accounting for visual viewport changes (keyboard, zoom), scroll containers,
 * and orientation changes.
 *
 * @example
 * ```tsx
 * const containerRef = useRef<HTMLDivElement>(null);
 * const { position, isMobile } = useListboxPositioning({
 *   containerRef,
 *   enabled: showDropdown,
 *   gap: 8,
 * });
 *
 * return (
 *   <div ref={containerRef}>
 *     <input />
 *     {showDropdown && (
 *       <ul
 *         className={isMobile ? "fixed" : "absolute"}
 *         style={isMobile && position ? { top: position.top, left: position.left } : undefined}
 *       >
 *         {options.map(opt => <li key={opt.id}>{opt.label}</li>)}
 *       </ul>
 *     )}
 *   </div>
 * );
 * ```
 */
export function useListboxPositioning({
  containerRef,
  enabled,
  gap = 8,
}: UseListboxPositioningOptions): UseListboxPositioningReturn {
  const [isMobile, setIsMobile] = useState(false);
  const [position, setPosition] = useState<Position | null>(null);
  const rafRef = useRef<number | null>(null);
  const enabledRef = useRef(enabled);

  // Keep ref in sync to avoid adding enabled to effect deps
  enabledRef.current = enabled;

  // Detect mobile viewport
  useEffect(() => {
    const updateViewportFlag = () => {
      if (typeof window === "undefined") return;
      setIsMobile(window.matchMedia("(max-width: 639px)").matches);
    };

    updateViewportFlag();
    window.addEventListener("resize", updateViewportFlag);
    return () => window.removeEventListener("resize", updateViewportFlag);
  }, []);

  // Position update scheduler
  const schedulePositionUpdate = useCallback(() => {
    if (typeof window === "undefined" || rafRef.current !== null) return;

    if (!enabledRef.current) {
      setPosition(null);
      return;
    }

    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = null;

      if (!containerRef.current || typeof window === "undefined") return;

      const rect = containerRef.current.getBoundingClientRect();
      const viewport = window.visualViewport;
      const offsetTop = viewport?.offsetTop ?? 0;
      const offsetLeft = viewport?.offsetLeft ?? 0;
      const viewportWidth = viewport?.width ?? window.innerWidth;

      setPosition({
        top: rect.bottom + gap + offsetTop,
        left: offsetLeft + viewportWidth / 2,
      });
    });
  }, [containerRef, gap]);

  // Update position when enabled changes
  useEffect(() => {
    if (isMobile && enabled) {
      schedulePositionUpdate();
    } else {
      setPosition(null);
    }
  }, [isMobile, enabled, schedulePositionUpdate]);

  // Set up event listeners for mobile viewport
  useEffect(() => {
    if (!isMobile) return;

    const getScrollContainer = () => {
      if (typeof document === "undefined") return null;
      const scoped = containerRef.current
        ?.closest(".app-container")
        ?.querySelector(".app-content");
      if (scoped instanceof HTMLElement) return scoped;
      const fallback = document.querySelector(".app-content");
      return fallback instanceof HTMLElement ? fallback : null;
    };

    const scrollContainer = getScrollContainer();
    const visualViewport =
      typeof window !== "undefined" ? window.visualViewport : null;
    const resizeObserver =
      typeof ResizeObserver !== "undefined" && containerRef.current
        ? new ResizeObserver(schedulePositionUpdate)
        : null;

    window.addEventListener("resize", schedulePositionUpdate);
    window.addEventListener("orientationchange", schedulePositionUpdate);
    scrollContainer?.addEventListener("scroll", schedulePositionUpdate, {
      passive: true,
    });

    const cleanupViewport: Array<["resize" | "scroll", () => void]> = [];
    if (visualViewport) {
      visualViewport.addEventListener("resize", schedulePositionUpdate);
      visualViewport.addEventListener("scroll", schedulePositionUpdate);
      cleanupViewport.push(
        ["resize", schedulePositionUpdate],
        ["scroll", schedulePositionUpdate]
      );
    }

    if (resizeObserver && containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      if (rafRef.current !== null && typeof window !== "undefined") {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }

      window.removeEventListener("resize", schedulePositionUpdate);
      window.removeEventListener("orientationchange", schedulePositionUpdate);
      scrollContainer?.removeEventListener("scroll", schedulePositionUpdate);

      if (visualViewport) {
        cleanupViewport.forEach(([type, handler]) => {
          visualViewport.removeEventListener(type, handler);
        });
      }

      if (resizeObserver) {
        resizeObserver.disconnect();
      }
    };
  }, [isMobile, schedulePositionUpdate, containerRef]);

  return { position, isMobile };
}
