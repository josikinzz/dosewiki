"use client";

import {
  memo,
  useCallback,
  useEffect,
  useRef,
  type MouseEvent,
} from "react";
import { Icon } from "@/components/common/Icon";
import { useT } from "@/i18n/client";
import {
  useActiveSection,
  type PublicTableOfContentsItem,
} from "@/components/common/PublicTableOfContents";
import { cn } from "@/lib/utils";
import {
  isPlainLeftClick,
  prefersReducedMotion,
  scrollIntoViewRespectingMotion,
} from "@/utils/navigation";

interface PublicTocStripProps {
  items: PublicTableOfContentsItem[];
  className?: string;
}

/**
 * How long after the reader lets go of the strip before scrollspy is allowed
 * to steer it again. Long enough for a flick's momentum to settle; short
 * enough that the strip re-syncs before the next section flips.
 */
const DRAG_SETTLE_MS = 700;

/**
 * Mobile companion of `PublicTableOfContents`: the same section list condensed
 * into one swipeable row of chips, rendered above the article hero so it is
 * pinned beneath the sticky site header from the very first scroll
 * (`--public-toc-strip-top` re-times it under the review workbench's command
 * bar). The chip for the section under the reader lights up and glides to the
 * center of the row as they scroll; tapping a chip jumps to its section.
 *
 * Hidden at >=1200px, where `StickyTocLayout`'s gutter rail takes over. Pages
 * that render the strip mark their layout root `theme-toc-strip-scope` so
 * anchor targets scroll clear of the header + strip stack.
 */
export const PublicTocStrip = memo(function PublicTocStrip({
  items,
  className,
}: PublicTocStripProps) {
  const t = useT();
  const activeId = useActiveSection(items.map((item) => item.id));
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  /** True from first touch until DRAG_SETTLE_MS after release. */
  const draggingRef = useRef(false);
  const settleTimerRef = useRef<number | null>(null);

  /**
   * Edge fades are data, not decoration: each one appears only while there are
   * chips hidden beyond that edge. Written as data attributes from a scroll
   * listener rather than state — the strip repaints its mask, React does not
   * re-render.
   */
  const syncEdgeFades = useCallback(() => {
    const scroller = scrollerRef.current;
    if (!scroller) {
      return;
    }
    const maxScroll = scroller.scrollWidth - scroller.clientWidth;
    scroller.dataset.fadeStart = scroller.scrollLeft > 4 ? "true" : "false";
    scroller.dataset.fadeEnd = scroller.scrollLeft < maxScroll - 4 ? "true" : "false";
  }, []);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) {
      return;
    }

    syncEdgeFades();

    const markDragging = () => {
      draggingRef.current = true;
      if (settleTimerRef.current !== null) {
        window.clearTimeout(settleTimerRef.current);
        settleTimerRef.current = null;
      }
    };
    const settleDragging = () => {
      if (settleTimerRef.current !== null) {
        window.clearTimeout(settleTimerRef.current);
      }
      settleTimerRef.current = window.setTimeout(() => {
        draggingRef.current = false;
        settleTimerRef.current = null;
      }, DRAG_SETTLE_MS);
    };

    scroller.addEventListener("scroll", syncEdgeFades, { passive: true });
    scroller.addEventListener("pointerdown", markDragging, { passive: true });
    scroller.addEventListener("pointerup", settleDragging, { passive: true });
    scroller.addEventListener("pointercancel", settleDragging, { passive: true });
    window.addEventListener("resize", syncEdgeFades);

    return () => {
      scroller.removeEventListener("scroll", syncEdgeFades);
      scroller.removeEventListener("pointerdown", markDragging);
      scroller.removeEventListener("pointerup", settleDragging);
      scroller.removeEventListener("pointercancel", settleDragging);
      window.removeEventListener("resize", syncEdgeFades);
      if (settleTimerRef.current !== null) {
        window.clearTimeout(settleTimerRef.current);
      }
    };
  }, [syncEdgeFades]);

  /**
   * Chip centering: when the scrollspy flips to a new section, glide that
   * chip to the center of the strip with a single native smooth scroll and do
   * nothing between flips. (A previous version mirrored reading progress with
   * per-frame scrollLeft writes, which forced a layout read/write cycle and a
   * backdrop-blur repaint on every page-scroll frame — visibly janky on
   * mobile.) The browser composites the smooth scroll off the main thread, so
   * scrolling the page costs the strip nothing. Stands down while a finger is
   * on the strip; reduced motion gets an instant jump instead of a glide.
   */
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || activeId === null) {
      return;
    }
    // Hidden at >=1200px, or the reader is mid-swipe — leave it alone.
    if (draggingRef.current || scroller.offsetParent === null) {
      return;
    }
    const chip = scroller.querySelector<HTMLElement>(
      `[data-toc-id="${CSS.escape(activeId)}"]`,
    );
    if (!chip) {
      return;
    }
    scroller.scrollTo({
      left: chip.offsetLeft + chip.offsetWidth / 2 - scroller.clientWidth / 2,
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
  }, [activeId]);

  const handleClick = useCallback((id: string, event: MouseEvent<HTMLAnchorElement>) => {
    if (!isPlainLeftClick(event)) {
      return;
    }

    event.preventDefault();

    const element = document.getElementById(id);
    if (element) {
      scrollIntoViewRespectingMotion(element);
    }

    const hash = `#${id}`;
    if (window.location.hash !== hash) {
      window.location.hash = hash;
    }
  }, []);

  if (items.length === 0) {
    return null;
  }

  return (
    <nav
      aria-label={t("On this page")}
      data-nosnippet
      className={cn(
        "theme-toc-strip-shell sticky z-30 min-[1200px]:hidden",
        // Full-bleed: break out of the centered column to span the viewport,
        // and cancel the layout's pt-8 so the bar sits flush against the
        // header from the very first paint.
        "-mt-8 mx-[calc(50%-50vw)]",
        className,
      )}
    >
      {/* Bar chrome and scroller are separate layers: the edge-fade mask
          lives on the scroller so overflowing chips dissolve at the edges
          while the bar's bottom border stays crisp. */}
      <div className="theme-toc-strip-bar backdrop-blur-sm backdrop-safe">
        <div
          ref={scrollerRef}
          data-fade-start="false"
          data-fade-end="false"
          className="theme-toc-strip flex items-center overflow-x-auto overscroll-x-contain py-1 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))]"
        >
          <ol className="flex items-center gap-1">
            {items.map((item) => {
              const isAccent = item.tone === "accent";
              const isWarning = item.tone === "warning";
              const isActive = item.id === activeId;

              return (
                <li key={item.id} className="shrink-0">
                  <a
                    href={`#${item.id}`}
                    data-toc-id={item.id}
                    onClick={(event) => handleClick(item.id, event)}
                    data-active={isActive ? "true" : undefined}
                    data-tone={item.tone}
                    aria-current={isActive ? "true" : undefined}
                    className={cn(
                      "theme-article-toc-item flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[0.8125rem] font-medium transition-[background-color,color] duration-[180ms] ease-out motion-reduce:transition-none [@media(pointer:coarse)]:min-h-11",
                      isWarning
                        ? "border"
                        : isAccent
                          ? "theme-badge-surface border"
                          : "theme-text-secondary",
                    )}
                  >
                    <span
                      className={cn(
                        "theme-article-toc-item-icon flex h-4 w-4 shrink-0 items-center justify-center transition-colors duration-[180ms] ease-out motion-reduce:transition-none",
                        isAccent
                          ? "theme-accent-emphasis"
                          : isWarning
                            ? undefined
                            : "theme-text-faint",
                      )}
                    >
                      <Icon icon={item.icon} size={14} />
                    </span>
                    {item.label}
                  </a>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </nav>
  );
});
