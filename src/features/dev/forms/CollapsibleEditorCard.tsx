import {
  useState,
  type ReactNode,
  type PropsWithChildren,
} from "react";
import { Icon } from "@/components/common/Icon";
import { InteractiveContentCard } from "@/components/ui/surface";
import { cn } from "@/lib/utils";

export interface CollapsibleEditorCardProps extends PropsWithChildren {
  /** Accent-tinted leading icon (Lucide / Iconify node). */
  icon?: ReactNode;
  /** Section title, rendered in the accent heading tier. */
  title: string;
  /** Optional helper copy shown under the header once expanded. */
  description?: string;
  /** Optional count chip (e.g. number of entries) shown next to the title. */
  count?: number;
  /** Optional badge node rendered after the title (status, hint, etc.). */
  badge?: ReactNode;
  /** Start expanded. Defaults to collapsed. */
  defaultExpanded?: boolean;
  /** Smaller header/body padding for nested subsections. */
  density?: "default" | "compact";
  className?: string;
}

/**
 * Frosted, accent-headed collapsible section card for the dev article forms.
 *
 * Built on the public `InteractiveContentCard` (`theme-public-card` +
 * backdrop blur) so it reads as the same material as the public site, with an
 * accent header (`.theme-accent-heading` + `theme-icon-accent`) and a
 * `--theme-horizontal-divider-image` hairline separating header from body.
 *
 * Replaces the flat navy `CollapsibleFormSectionCard` / `CollapsibleSubsection`
 * recipes; those exports now render through this primitive so adopters get the
 * frosted look transitively with no call-site change.
 */
export function CollapsibleEditorCard({
  icon,
  title,
  description,
  count,
  badge,
  defaultExpanded = false,
  density = "default",
  className,
  children,
}: CollapsibleEditorCardProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const titleSize = density === "compact" ? "text-sm" : "text-lg";
  const chevronSize = density === "compact" ? 16 : 20;
  const headerPadding = density === "compact" ? "p-3 sm:p-4" : "p-4";
  const bodyPadding =
    density === "compact" ? "p-3 sm:p-4 space-y-4" : "p-4 sm:p-5 space-y-6";

  return (
    <InteractiveContentCard
      variant="public"
      padding="none"
      radius="xl"
      className={cn("overflow-hidden", className)}
    >
      <button
        type="button"
        onClick={() => setIsExpanded((value) => !value)}
        aria-expanded={isExpanded}
        className={cn(
          "flex w-full items-center justify-between gap-3 text-left transition-colors",
          "hover:bg-[var(--theme-frosted-control-hover-bg)]",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--theme-accent-strong)]",
          headerPadding,
        )}
      >
        <span className="flex min-w-0 items-center gap-2.5">
          {icon ? (
            <span className="theme-icon-accent shrink-0">{icon}</span>
          ) : null}
          <span
            className={cn(
              "theme-accent-heading truncate font-semibold",
              titleSize,
            )}
          >
            {title}
          </span>
          {typeof count === "number" ? (
            <span className="theme-badge-surface inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1">
              {count}
            </span>
          ) : null}
          {badge ? <span className="shrink-0">{badge}</span> : null}
        </span>
        <Icon
          icon={isExpanded ? "lucide:chevron-down" : "lucide:chevron-right"}
          size={chevronSize}
          className="theme-icon-muted shrink-0"
        />
      </button>
      {isExpanded ? (
        <div
          className={cn(
            "relative",
            bodyPadding,
            "before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-[image:var(--theme-horizontal-divider-image)]",
          )}
        >
          {description ? (
            <p className="theme-text-muted -mt-1 text-sm leading-5">
              {description}
            </p>
          ) : null}
          {children}
        </div>
      ) : null}
    </InteractiveContentCard>
  );
}

export default CollapsibleEditorCard;
