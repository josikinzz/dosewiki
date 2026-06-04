import type { ReactNode } from "react";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { StatusState } from "@/components/ui/surface";
import { cn } from "@/lib/utils";
import { StatusOrb } from "./StatusOrb";
import type { IconName } from "./Icon";

type StateCardTone = "accent" | "success" | "warning" | "danger" | "neutral";

export interface StateCardProps {
  badge?: string;
  badgeVariant?: BadgeProps["variant"];
  title: ReactNode;
  description: ReactNode;
  icon?: IconName;
  tone?: StateCardTone;
  loading?: boolean;
  actions?: ReactNode;
  footer?: ReactNode;
  className?: string;
  align?: "center" | "left";
  compact?: boolean;
}

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
    <StatusState
      tone={tone === "danger" ? "danger" : "neutral"}
      radius={compact ? "compactState" : "state"}
      className={cn(
        className,
      )}
      data-tone={tone}
      data-loading-state={loading ? "loading" : undefined}
      aria-busy={loading || undefined}
    >
      <div className="relative flex flex-col gap-5 p-6 sm:p-8">
        <div
          className={cn(
            "flex gap-5",
            centered ? "flex-col items-center text-center" : "items-start text-left sm:flex-row",
          )}
        >
          <StatusOrb
            icon={icon}
            tone={tone === "neutral" ? "accent" : tone}
            size={compact ? "sm" : "md"}
            loading={loading}
          />

          <div className={cn("space-y-3", centered ? "max-w-2xl" : "max-w-2xl flex-1") }>
            {badge ? (
              <Badge variant={badgeVariant} className={cn("w-fit", centered ? "mx-auto" : undefined)}>
                {badge}
              </Badge>
            ) : null}
            <div className="space-y-2.5">
              <h2 className="theme-text-primary font-display text-2xl font-semibold tracking-tight sm:text-[2rem]">
                {title}
              </h2>
              <div className="theme-text-secondary text-sm leading-7 sm:text-base">{description}</div>
            </div>
          </div>
        </div>

        {actions ? (
          <div className={cn("flex flex-wrap gap-3", centered ? "justify-center" : "justify-start")}>{actions}</div>
        ) : null}

        {footer ? (
          <div className={cn("theme-text-faint text-sm", centered ? "text-center" : "text-left")}>{footer}</div>
        ) : null}
      </div>
    </StatusState>
  );
}
