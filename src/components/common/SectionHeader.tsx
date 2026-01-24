import { memo } from "react";
import { IconBadge } from "./IconBadge";
import type { IconName } from "./Icon";
import { cn } from "@/lib/utils";

interface SectionHeaderProps {
  icon: IconName;
  title: string;
  className?: string;
}

/**
 * Reusable section header with glow effect, icon badge, and gradient line.
 * Used across all article sections for consistent styling.
 */
export const SectionHeader = memo(function SectionHeader({
  icon,
  title,
  className,
}: SectionHeaderProps) {
  return (
    <div className={cn("flex items-center gap-4", className)}>
      <div className="relative">
        <div className="absolute inset-0 bg-fuchsia-500/20 blur-xl rounded-full" />
        <h2 className="relative flex shrink-0 items-center gap-3 text-xl font-bold tracking-tight text-fuchsia-300 whitespace-nowrap">
          <IconBadge icon={icon} />
          <span className="drop-shadow-sm">{title}</span>
        </h2>
      </div>
      <div className="h-px w-full bg-gradient-to-r from-fuchsia-500/30 via-fuchsia-500/10 to-transparent" />
    </div>
  );
});
