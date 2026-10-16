"use client";

import { memo, useCallback, useEffect, useState, type MouseEvent } from "react";
import { Icon, type IconName } from "@/components/common/Icon";
import { msg, useT } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { isPlainLeftClick, scrollIntoViewRespectingMotion } from "@/utils/navigation";

const SCROLLSPY_TOP_OFFSET = 140;

export function useActiveSection(ids: string[]): string | null {
  const idsKey = ids.join("|");
  const [activeId, setActiveId] = useState<string | null>(() => ids[0] ?? null);

  useEffect(() => {
    if (typeof window === "undefined" || ids.length === 0) {
      return;
    }

    let frame = 0;

    const compute = () => {
      frame = 0;
      let current: string | null = null;
      let topOffset: number | null = null;
      for (const id of ids) {
        const element = document.getElementById(id);
        if (!element) {
          continue;
        }
        topOffset ??= Math.max(
          SCROLLSPY_TOP_OFFSET,
          Number.parseFloat(window.getComputedStyle(element).scrollMarginTop) || 0,
        );
        if (element.getBoundingClientRect().top - topOffset <= 1) {
          current = id;
        } else {
          break;
        }
      }
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
  variant?: "panel" | "bare";
}

export const PublicTableOfContents = memo(function PublicTableOfContents({
  items,
  title = msg("Contents"),
  className,
  variant = "panel",
}: PublicTableOfContentsProps) {
  const t = useT();
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
      <div className={cn(isBare ? "px-1" : "theme-article-toc-panel rounded-card border p-4")}>
        <div className={cn("space-y-2.5", isBare ? "mb-2 px-1" : "mb-3")}>
          <h2 className="theme-text-faint type-meta-label">
            {t(title)}
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
                    data-tone={item.tone}
                    aria-current={isActive ? "true" : undefined}
                    className={cn(
                      "theme-article-toc-item group flex w-full items-center gap-2.5 rounded-control border border-transparent px-2 py-2 text-left text-sm transition-[background-color,color,border-color,box-shadow] motion-reduce:transition-none [@media(pointer:coarse)]:min-h-11",
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
