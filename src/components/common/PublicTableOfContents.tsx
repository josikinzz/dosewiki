"use client";

import { memo, useCallback } from "react";
import { Icon, type IconName } from "@/components/common/Icon";
import { cn } from "@/lib/utils";
import { scrollIntoViewRespectingMotion } from "@/utils/navigation";

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
}

export const PublicTableOfContents = memo(function PublicTableOfContents({
  items,
  title = "Contents",
  className,
}: PublicTableOfContentsProps) {
  const handleClick = useCallback((id: string) => {
    const element = document.getElementById(id);
    if (element) {
      scrollIntoViewRespectingMotion(element);
    }
  }, []);

  if (items.length === 0) {
    return null;
  }

  return (
    <div className={cn("w-full", className)}>
      <nav
        aria-label={title}
        className="border-y border-dose-card-border py-3"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <h2 className="shrink-0 pt-2 text-xs font-semibold uppercase tracking-widest text-dose-text-faint">
            {title}
          </h2>
          <ol className="flex min-w-0 flex-1 flex-wrap gap-1.5">
            {items.map((item) => {
              const isAccent = item.tone === "accent";
              const isWarning = item.tone === "warning";

              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => handleClick(item.id)}
                    className={cn(
                      "group inline-flex min-h-9 items-center gap-2 rounded-full px-2.5 py-1.5 text-left text-sm transition-[background-color,color,transform,border-color,box-shadow] duration-200 hover:-translate-y-0.5",
                      "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400",
                      isWarning
                        ? "border border-dose-warning-border bg-dose-warning-bg text-dose-warning hover:bg-dose-warning-bg-strong"
                        : isAccent
                          ? "border border-dose-card-border bg-dose-surface-muted text-dose-accent-soft hover:border-dose-card-border-strong hover:bg-dose-surface-soft"
                          : "text-dose-text-muted hover:bg-dose-surface-muted hover:text-dose-accent-strong",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-5 w-5 shrink-0 items-center justify-center transition-transform duration-200 group-hover:scale-110",
                        isWarning
                          ? "text-dose-warning"
                          : isAccent
                            ? "text-dose-accent-soft"
                            : "text-dose-text-ghost group-hover:text-dose-accent-muted",
                      )}
                    >
                      <Icon icon={item.icon} size={14} />
                    </span>
                    <span>{item.label}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      </nav>
    </div>
  );
});
