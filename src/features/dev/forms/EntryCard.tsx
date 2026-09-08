import type { ReactNode, PropsWithChildren } from "react";
import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { TOUCH_ICON } from "@/components/ui/touchTargets";
import { cn } from "@/lib/utils";

export interface EntryCardProps extends PropsWithChildren {
  /** Optional title rendered in the entry header row. */
  title?: ReactNode;
  /** Optional leading icon for the title. */
  icon?: ReactNode;
  /** Optional badge / index chip rendered after the title. */
  badge?: ReactNode;
  /** When provided, renders a token-correct danger remove button. */
  onRemove?: () => void;
  /** Accessible label for the remove control. */
  removeLabel?: string;
  /** Body spacing between children. Defaults to `space-y-3`. */
  bodyClassName?: string;
  className?: string;
}

/**
 * Canonical array-item entry for the dev article forms.
 *
 * Renders as the lightest inset well — a hairline border over a faint
 * `--theme-surface-soft` fill, no shadow / blur / frosted highlight — so a list
 * of entries inside an already-carded accordion section reads as recessed rows
 * rather than another stack of floating cards. When `onRemove` is supplied it
 * renders a header row with an optional title/badge and a token-correct danger
 * ghost remove button (`Button variant="destructivePill"`, driven by
 * `--theme-danger-*` so it stays reverso-safe in both themes).
 */
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
