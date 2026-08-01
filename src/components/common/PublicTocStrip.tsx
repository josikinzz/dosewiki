"use client";

import {
  memo,
  useCallback,
  useEffect,
  useRef,
  type MouseEvent,
} from "react";
import { Icon } from "@/components/common/Icon";
import {
  SCROLLSPY_TOP_OFFSET,
  useActiveSection,
  type PublicTableOfContentsItem,
} from "@/components/common/PublicTableOfContents";
import { cn } from "@/lib/utils";
import {
  isPlainLeftClick,
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
   * Continuous glide: the strip's horizontal position mirrors reading
   * progress. Each page-scroll frame interpolates between the current and
   * next chips' centers by how far the reader is through the current section
   * (measured against the same line the scrollspy highlight uses), so the
   * strip advances at the article's pace instead of snapping at each section
   * flip. Direct per-frame scrollLeft writes on the strip itself — never the
   * page — and, because the glide only mirrors scrolling the reader is
   * already doing, it is not an autonomous animation to gate on
   * prefers-reduced-motion. Stands down while a finger is on the strip.
   */
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || items.length === 0) {
      return;
    }

    let frame = 0;

    const compute = () => {
      frame = 0;
      // Hidden at >=1200px, or the reader is mid-swipe — leave it alone.
      if (draggingRef.current || scroller.offsetParent === null) {
        return;
      }
      const sections: Array<{ chip: HTMLElement; top: number }> = [];
      for (const chip of scroller.querySelectorAll<HTMLElement>("[data-toc-id]")) {
        const element = document.getElementById(chip.dataset.tocId ?? "");
        if (element) {
          sections.push({
            chip,
            top: element.getBoundingClientRect().top - SCROLLSPY_TOP_OFFSET,
          });
        }
      }
      if (sections.length === 0) {
        return;
      }

      // Last section whose heading has crossed the scrollspy line.
      let index = -1;
      for (const section of sections) {
        if (section.top > 0) {
          break;
        }
        index += 1;
      }

      const center = (chip: HTMLElement) => chip.offsetLeft + chip.offsetWidth / 2;
      const current = sections[Math.max(index, 0)];
      const next = sections[index + 1];
      // Progress through the current section, 0 at its heading, 1 at the
      // next. Before the first section both terms resolve to the first chip.
      const t =
        index < 0 || !next
          ? 0
          : Math.min(Math.max(-current.top / (next.top - current.top), 0), 1);
      const anchor = next
        ? center(current.chip) + (center(next.chip) - center(current.chip)) * t
        : center(current.chip);

      const maxScroll = scroller.scrollWidth - scroller.clientWidth;
      const target = Math.min(Math.max(anchor - scroller.clientWidth / 2, 0), maxScroll);
      if (Math.abs(scroller.scrollLeft - target) >= 1) {
        scroller.scrollLeft = target;
      }
    };

    const schedule = () => {
      if (frame === 0) {
        frame = window.requestAnimationFrame(compute);
      }
    };

    compute();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);

    return () => {
      if (frame !== 0) {
        window.cancelAnimationFrame(frame);
      }
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
    // items is a fresh array each render; the id list is what matters.
  }, [items.map((item) => item.id).join("|")]);

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
      aria-label="On this page"
      data-nosnippet
      className={cn(
        "sticky z-30 min-[1200px]:hidden",
        // Full-bleed: break out of the centered column to span the viewport,
        // and cancel the layout's pt-8 so the bar sits flush against the
        // header from the very first paint.
        "-mt-8 mx-[calc(50%-50vw)]",
        "top-[var(--public-toc-strip-top,var(--theme-header-height,4.25rem))]",
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
                    aria-current={isActive ? "true" : undefined}
                    className={cn(
                      "theme-article-toc-item flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[0.8125rem] font-medium transition-[background-color,color] duration-[260ms] ease-[cubic-bezier(0.25,1,0.5,1)] motion-reduce:transition-none",
                      "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--theme-accent-strong)]",
                      isWarning
                        ? "border border-[color:var(--theme-warning-border)] bg-[color:var(--theme-warning-bg)] text-[color:var(--theme-warning-text)]"
                        : isAccent
                          ? "theme-badge-surface border"
                          : "theme-text-secondary",
                    )}
                  >
                    <span
                      className={cn(
                        "theme-article-toc-item-icon flex h-4 w-4 shrink-0 items-center justify-center",
                        isWarning
                          ? "text-[var(--theme-warning-text)]"
                          : isAccent
                            ? "theme-accent-emphasis"
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

export default PublicTocStrip;
