import type { ReactNode, PropsWithChildren } from "react";
import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { TOUCH_ICON } from "@/components/ui/touchTargets";
import { cn } from "@/lib/utils";

export interface EntryCardProps extends PropsWithChildren {
  title?: ReactNode;
  icon?: ReactNode;
  badge?: ReactNode;
  onRemove?: () => void;
  removeLabel?: string;
  bodyClassName?: string;
  className?: string;
}

export function EntryCard({
  title,
  icon,
  badge,
  onRemove,
  removeLabel = "Remove entry",
  bodyClassName,
  className,
  children,
}: EntryCardProps) {
  const hasHeader = Boolean(title || badge || onRemove);

  return (
    <div
      className={cn(
        "theme-entry-card space-y-3 rounded-lg border p-3 sm:p-4",
        className,
      )}
    >
      {hasHeader ? (
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            {icon ? (
              <span className="theme-icon-accent shrink-0">{icon}</span>
            ) : null}
            {title ? (
              <span className="theme-text-secondary truncate text-sm font-medium">
                {title}
              </span>
            ) : null}
            {badge ? <span className="shrink-0">{badge}</span> : null}
          </div>
          {onRemove ? (
            <Button
              type="button"
              variant="destructivePill"
              size="auto"
              onClick={onRemove}
              aria-label={removeLabel}
              title={removeLabel}
              className={cn("h-7 w-7 shrink-0 p-0", TOUCH_ICON)}
            >
              <Icon icon="lucide:trash-2" size={14} />
            </Button>
          ) : null}
        </div>
      ) : null}
      <div className={cn(bodyClassName)}>{children}</div>
    </div>
  );
}
