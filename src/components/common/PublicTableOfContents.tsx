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
    <div className={cn("w-full max-w-xs", className)}>
      <div className="rounded-xl border border-[color:var(--theme-card-border)] bg-white/[0.02] p-4 shadow-[0_18px_40px_-28px_rgba(0,0,0,0.5)]">
        <div className="mb-3 space-y-2.5">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-white/40">
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
                  <button
                    type="button"
                    onClick={() => handleClick(item.id)}
                    className={cn(
                      "group flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm transition-[background-color,color,transform,border-color,box-shadow] duration-200 hover:-translate-y-0.5",
                      isWarning
                        ? "border border-[color:var(--theme-warning-border)] bg-[color:var(--theme-warning-bg)] text-[color:var(--theme-warning-text)] hover:bg-[color:var(--theme-warning-bg-strong)]"
                        : isAccent
                          ? "border border-fuchsia-400/15 bg-fuchsia-500/10 text-fuchsia-100 hover:border-fuchsia-400/25 hover:bg-fuchsia-500/14"
                          : "text-white/72 hover:bg-white/5 hover:text-fuchsia-300",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-5 w-5 shrink-0 items-center justify-center transition-transform duration-200 group-hover:scale-110",
                        isWarning
                          ? "text-[color:var(--theme-warning-text)]/85"
                          : isAccent
                            ? "text-fuchsia-200/90"
                            : "text-white/30 group-hover:text-fuchsia-400/60",
                      )}
                    >
                      <Icon icon={item.icon} size={14} />
                    </span>
                    <span className="flex-1">{item.label}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>
      </div>
    </div>
  );
});
