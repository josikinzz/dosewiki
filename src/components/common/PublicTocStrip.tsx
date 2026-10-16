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

const DRAG_SETTLE_MS = 700;

export const PublicTocStrip = memo(function PublicTocStrip({
  items,
  className,
}: PublicTocStripProps) {
  const t = useT();
  const activeId = useActiveSection(items.map((item) => item.id));
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);
  const settleTimerRef = useRef<number | null>(null);

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

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || activeId === null) {
      return;
    }
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
        "-mt-8 mx-[calc(50%-50vw)]",
        className,
      )}
    >
      <div className="theme-toc-strip-bar backdrop-blur-[var(--frost-blur)] backdrop-safe">
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
                      "theme-article-toc-item flex items-center gap-1.5 whitespace-nowrap rounded-chip border border-transparent px-2.5 py-1.5 text-[13px] font-medium transition-[background-color,color] motion-reduce:transition-none [@media(pointer:coarse)]:min-h-11",
                      isWarning
                        ? undefined
                        : isAccent
                          ? "theme-badge-surface"
                          : "theme-text-secondary",
                    )}
                  >
                    <span
                      className={cn(
                        "theme-article-toc-item-icon flex h-4 w-4 shrink-0 items-center justify-center transition-colors motion-reduce:transition-none",
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
