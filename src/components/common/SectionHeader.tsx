import { memo } from "react";
import { Icon, type IconName } from "./Icon";
import { cn } from "@/lib/utils";

interface SectionHeaderProps {
  icon: IconName;
  title: string;
  className?: string;
}

/**
 * Reusable section header with icon badge and gradient line.
 * Used across all article sections for consistent styling.
 */
export const SectionHeader = memo(function SectionHeader({
  icon,
  title,
  className,
}: SectionHeaderProps) {
  return (
    <div className={cn("flex items-center gap-4", className)}>
      <div className="relative shrink-0">
        {/* `type-section-title` is the recipe PublicSectionHeading's rule
            variant uses too, so article and page section heads match. */}
        <h2 className="type-section-title relative flex items-center gap-4 text-[var(--theme-section-heading)] whitespace-nowrap">
          <Icon icon={icon} className="h-7 w-7 sm:h-8 sm:w-8" />
          {title}
        </h2>
      </div>
      <div className="h-px flex-1 bg-[image:var(--theme-horizontal-divider-image)]" />
    </div>
  );
});
