"use client";

import { memo, useCallback, useEffect, useState, type MouseEvent } from "react";
import { Icon, type IconName } from "@/components/common/Icon";
import { cn } from "@/lib/utils";
import { isPlainLeftClick, scrollIntoViewRespectingMotion } from "@/utils/navigation";

/**
 * Distance from the top of the viewport at which a section counts as "current".
 * Roughly clears the sticky site header so the active item flips as a heading
 * settles just beneath the chrome rather than at the very top edge.
 *
 * Exported for `PublicTocStrip`, whose continuous glide interpolates progress
 * against the same line — highlight flips and glide must agree on "current".
 */
export const SCROLLSPY_TOP_OFFSET = 140;

/**
 * Scrollspy: tracks which section heading is currently beneath the site header
 * and returns its id, so the matching table-of-contents entry can light up as
 * the reader scrolls. Reads the live position of each section on scroll (rAF
 * throttled) so it stays correct even for sections taller than the viewport.
 *
 * Exported for `PublicTocStrip`, the mobile companion of this rail — both must
 * agree on which section is "current", so they share the one implementation.
 */
export function useActiveSection(ids: string[]): string | null {
  const idsKey = ids.join("|");
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || ids.length === 0) {
      return;
    }

    let frame = 0;

    const compute = () => {
      frame = 0;
      let current: string | null = null;
      for (const id of ids) {
        const element = document.getElementById(id);
        if (!element) {
          continue;
        }
        if (element.getBoundingClientRect().top - SCROLLSPY_TOP_OFFSET <= 0) {
          // Last section whose heading has scrolled above the offset line wins.
          current = id;
        } else {
          break;
        }
      }
      // Before the first heading reaches the line, keep the first item lit.
      if (current === null) {
        current = ids[0] ?? null;
      }
      setActiveId((previous) => (previous === current ? previous : current));
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
    // idsKey captures the section list; ids itself is a fresh array each render.
  }, [idsKey]);

  return activeId;
}

export interface PublicTableOfContentsItem {
  id: string;
  label: string;
  icon: IconName;
  tone?: "default" | "accent" | "warning";
}

interface PublicTableOfContentsProps {
  items: PublicTableOfContentsItem[];
  title?: string;
  className?: string;
  /**
   * "panel" (default) renders the frosted bordered card used inline under the
   * hero. "bare" drops the panel chrome for a quiet support rail in the page
   * gutter (the wide-screen sticky table of contents).
   */
  variant?: "panel" | "bare";
}

export const PublicTableOfContents = memo(function PublicTableOfContents({
  items,
  title = "Contents",
  className,
  variant = "panel",
}: PublicTableOfContentsProps) {
  const isBare = variant === "bare";
  const activeId = useActiveSection(items.map((item) => item.id));
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
    <div className={cn("w-full", isBare ? null : "max-w-xs", className)} data-nosnippet>
      <div className={cn(isBare ? "px-1" : "theme-article-toc-panel rounded-xl border p-4")}>
        <div className={cn("space-y-2.5", isBare ? "mb-2 px-1" : "mb-3")}>
          <h2 className="theme-text-faint text-xs font-semibold uppercase tracking-widest">
            {title}
          </h2>
        </div>
        <nav>
          <ol className="space-y-1">
            {items.map((item) => {
              const isAccent = item.tone === "accent";
              const isWarning = item.tone === "warning";
              const isActive = item.id === activeId;

              return (
                <li key={item.id}>
                  <a
                    href={`#${item.id}`}
                    onClick={(event) => handleClick(item.id, event)}
                    data-active={isActive ? "true" : undefined}
                    aria-current={isActive ? "true" : undefined}
                    className={cn(
                      "theme-article-toc-item group flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm transition-[background-color,color,transform,border-color,box-shadow] duration-[260ms] ease-[cubic-bezier(0.25,1,0.5,1)] hover:-translate-y-px motion-reduce:transition-none motion-reduce:hover:translate-y-0",
                      isWarning
                        ? "border border-[color:var(--theme-warning-border)] bg-[color:var(--theme-warning-bg)] text-[color:var(--theme-warning-text)] hover:bg-[color:var(--theme-warning-bg-strong)]"
                        : isAccent
                          ? "theme-badge-surface border"
                          : "theme-text-secondary",
                    )}
                  >
                    <span
                      className={cn(
                        "theme-article-toc-item-icon flex h-5 w-5 shrink-0 items-center justify-center transition-transform duration-[260ms] ease-[cubic-bezier(0.25,1,0.5,1)] group-hover:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover:scale-100",
                        isWarning
                          ? "text-[var(--theme-warning-text)]"
                        : isAccent
                            ? "theme-accent-emphasis"
                            : "theme-text-faint group-hover:text-[var(--theme-accent-strong)]",
                      )}
                    >
                      <Icon icon={item.icon} size={14} />
                    </span>
                    <span className="flex-1">{item.label}</span>
                  </a>
                </li>
              );
            })}
          </ol>
        </nav>
      </div>
    </div>
  );
});
