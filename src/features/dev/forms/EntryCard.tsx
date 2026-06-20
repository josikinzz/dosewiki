import type { ReactNode, PropsWithChildren } from "react";
import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { Surface } from "@/components/ui/surface";
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
 * Canonical array-item tile for the dev article forms.
 *
 * Built on `Surface variant="subtle"` (`theme-public-card-subtle`,
 * `rounded-xl`). When `onRemove` is supplied it renders a header row with an
 * optional title/badge and a token-correct danger ghost remove button
 * (`Button variant="destructivePill"`, driven by `--theme-danger-*` so it stays
 * reverso-safe in both themes). Replaces the ~8 hand-rolled navy-hex entry
 * tiles that previously diverged on radii / hover / hex fills.
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
    <Surface
      variant="subtle"
      padding="sm"
      radius="lg"
      className={cn("space-y-3", className)}
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
              size="icon"
              onClick={onRemove}
              aria-label={removeLabel}
              className="h-7 w-7 shrink-0 p-0"
            >
              <Icon icon="lucide:x" size={14} />
            </Button>
          ) : null}
        </div>
      ) : null}
      <div className={cn(bodyClassName)}>{children}</div>
    </Surface>
  );
}

export default EntryCard;
