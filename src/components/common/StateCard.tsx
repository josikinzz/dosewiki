import type { ReactNode } from "react";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Icon, type IconName } from "./Icon";

export type StateTone = "accent" | "success" | "warning" | "danger" | "neutral";
type StateCardTone = StateTone;

export interface StateCardProps {
  badge?: string;
  badgeVariant?: BadgeProps["variant"];
  title: ReactNode;
  description?: ReactNode;
  icon?: IconName;
  tone?: StateCardTone;
  loading?: boolean;
  actions?: ReactNode;
  footer?: ReactNode;
  className?: string;
  align?: "center" | "left";
  compact?: boolean;
}

/** Plain glyph colour per tone; shared with StatusHeader so both read alike. */
export const stateToneIconClassName: Record<StateTone, string> = {
  accent: "theme-icon-accent",
  success: "theme-success-text-strong",
  warning: "theme-warning-text-strong",
  danger: "theme-danger-text-strong",
  neutral: "theme-icon-muted",
};

/**
 * Free-floating empty / status / loading state. No panel, no orb: one small
 * tone-coloured glyph (or, while loading, the theme-tokened indeterminate
 * sweep), a title, a line of description, and whatever actions follow.
 * Callers place it; it only owns its own stack.
 */
export function StateCard({
  badge,
  badgeVariant = "secondary",
  title,
  description,
  icon = "lucide:sparkles",
  tone = "accent",
  loading = false,
  actions,
  footer,
  className,
  align = "center",
  compact = false,
}: StateCardProps) {
  const centered = align === "center";

  return (
    <div
      className={cn(
        "flex flex-col",
        compact ? "gap-3 py-6" : "gap-4 py-10",
        centered ? "items-center text-center" : "items-start text-left",
        className,
      )}
      data-tone={tone}
      role={loading ? "status" : undefined}
      aria-live={loading ? "polite" : undefined}
      aria-busy={loading || undefined}
    >
      {badge ? (
        <Badge variant={badgeVariant} className="w-fit">
          {badge}
        </Badge>
      ) : null}

      {loading ? null : (
        <Icon icon={icon} size={compact ? 20 : 24} className={cn("shrink-0", stateToneIconClassName[tone])} />
      )}

      <div className={cn("max-w-xl", compact ? "space-y-1" : "space-y-1.5")}>
        <h2
          className={cn(
            "theme-text-primary font-display font-semibold tracking-tight",
            compact ? "text-base" : "text-lg sm:text-xl",
          )}
        >
          {title}
        </h2>
        {description ? (
          <div className="theme-text-muted text-sm leading-6">{description}</div>
        ) : null}
      </div>

      {loading ? (
        <div className="theme-loading-track h-0.5 w-48 overflow-hidden rounded-full" aria-hidden="true">
          <div className="theme-loading-bar motion-reduce:animate-none" />
        </div>
      ) : null}

      {actions ? (
        <div className={cn("flex flex-wrap gap-3", centered ? "justify-center" : "justify-start")}>{actions}</div>
      ) : null}

      {footer ? <div className="theme-text-faint text-xs">{footer}</div> : null}
    </div>
  );
}
