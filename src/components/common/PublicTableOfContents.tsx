"use client";

import { memo, useCallback, type MouseEvent } from "react";
import { Icon, type IconName } from "@/components/common/Icon";
import { cn } from "@/lib/utils";
import { isPlainLeftClick, scrollIntoViewRespectingMotion } from "@/utils/navigation";

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
    <div className={cn("w-full", isBare ? null : "max-w-xs", className)}>
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

              return (
                <li key={item.id}>
                  <a
                    href={`#${item.id}`}
                    onClick={(event) => handleClick(item.id, event)}
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
                        "flex h-5 w-5 shrink-0 items-center justify-center transition-transform duration-[260ms] ease-[cubic-bezier(0.25,1,0.5,1)] group-hover:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover:scale-100",
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
