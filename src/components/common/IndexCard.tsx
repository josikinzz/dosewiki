"use client";

import Link from "next/link";
import { useCallback, useState, memo, type ReactNode } from "react";
import { InteractiveSurface } from "@/components/ui/surface";
import { Icon, type IconName } from "./Icon";
import { cn } from "@/lib/utils";

interface IndexCardProps {
  /** Card title */
  title: string;
  /** Icon to display */
  icon: IconName;
  /** Count to display in parentheses after title */
  count: number;
  /** Card content */
  children: ReactNode;
  /** Whether the card starts expanded (default: true) */
  defaultExpanded?: boolean;
  /** Optional click handler for the title (makes it a link) */
  onTitleClick?: () => void;
  /** Optional click handler for the icon */
  onIconClick?: () => void;
  /** Icon to show when onIconClick has been triggered (e.g., checkmark for "copied") */
  iconActiveState?: boolean;
  /** Optional CSS variable-backed color treatment for category wayfinding */
  colorClassName?: string;
}

/**
 * Shared card component for index pages (Substance Index, Effect Index).
 * 
 * Provides consistent styling for:
 * - Card container with glass effect
 * - Header with icon, title (with count), and expand/collapse chevron
 * - Collapsible content area
 */
export const IndexCard = memo(function IndexCard({
  title,
  icon,
  count,
  children,
  defaultExpanded = true,
  onTitleClick,
  onIconClick,
  iconActiveState = false,
  colorClassName,
}: IndexCardProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const chevronIcon = isExpanded ? "lucide:chevron-up" : "lucide:chevron-down";
  const contentId = `${title.toLowerCase().replace(/\s+/g, "-")}-content`;

  const iconClassName = cn(
    "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-dose-surface-muted ring-1 ring-dose-divider outline-none transition-colors duration-200 hover:bg-dose-surface-strong hover:ring-dose-card-border",
    colorClassName
      ? "bg-[color:color-mix(in_srgb,var(--effect-family-surface)_72%,transparent)] ring-[color:color-mix(in_srgb,var(--effect-family-ring)_66%,transparent)] hover:bg-[color:var(--effect-family-surface-hover)] hover:ring-[color:color-mix(in_srgb,var(--effect-family-ring-strong)_58%,transparent)]"
      : undefined,
    onIconClick
      ? "cursor-pointer focus-visible:ring-2 focus-visible:ring-fuchsia-400"
      : undefined,
  );

  const iconContent = (
    <Icon
      icon={iconActiveState ? "lucide:check" : icon}
      size={20}
      className={
        iconActiveState
          ? "text-emerald-400"
          : cn(
              "text-dose-accent-soft transition-colors group-hover:text-dose-accent-soft",
              colorClassName
                ? "text-[color:var(--effect-family-icon)] group-hover:text-[color:var(--effect-family-icon-strong)]"
                : undefined,
            )
      }
    />
  );

  const iconElement = onIconClick ? (
    <button type="button" className={iconClassName} onClick={onIconClick} aria-label={`${title} action`}>
      {iconContent}
    </button>
  ) : (
    <div className={iconClassName}>
      {iconContent}
    </div>
  );

  const titleElement = (
    <h2
      className={cn(
        "theme-text-primary text-lg font-bold tracking-tight transition-colors duration-200 group-hover:text-dose-accent-soft",
        colorClassName
          ? "group-hover:text-[color:var(--effect-family-heading-hover)]"
          : undefined,
      )}
    >
      {title}
      <span className="theme-text-faint ml-2 text-[0.9em] font-medium transition-colors group-hover:text-dose-text-secondary">
        ({count})
      </span>
    </h2>
  );

  return (
    <InteractiveSurface
      asChild
      variant="index"
      padding="md"
      radius="index"
      className="group w-full transition-all duration-300"
    >
      <section className={colorClassName}>
      {/* Header */}
      <header className="flex items-start gap-4 pb-2">
        {iconElement}
        <div className="flex-1 min-w-0 pt-0.5">
          {onTitleClick ? (
            <button
              type="button"
              onClick={onTitleClick}
              className="text-left transition-opacity hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400"
            >
              {titleElement}
            </button>
          ) : (
            titleElement
          )}
        </div>
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          aria-expanded={isExpanded}
          aria-controls={contentId}
          aria-label={`${isExpanded ? "Collapse" : "Expand"} ${title}`}
          className="theme-text-faint flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-[background-color,color,transform] hover:-translate-y-px hover:bg-dose-surface-muted hover:text-dose-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dose-accent-strong"
        >
          <Icon icon={chevronIcon} size={16} />
        </button>
      </header>

      {isExpanded ? (
        <div id={contentId} className="mt-2">
          {children}
        </div>
      ) : null}
      </section>
    </InteractiveSurface>
  );
});

interface IndexCardSectionProps {
  /** Section title (optional - if not provided, no header is shown) */
  title?: string;
  /** Section icon (optional) */
  icon?: IconName;
  /** Count to display after title */
  count?: number;
  /** Section content */
  children: ReactNode;
  /** Whether to show a divider above this section */
  showDivider?: boolean;
}

/**
 * Section within an IndexCard for grouping content with optional headers.
 */
export const IndexCardSection = memo(function IndexCardSection({
  title,
  icon,
  count,
  children,
  showDivider = false,
}: IndexCardSectionProps) {
  return (
    <div
      className={
        showDivider
          ? "relative pt-6 before:absolute before:left-0 before:right-0 before:top-0 before:h-px before:bg-[image:var(--theme-horizontal-divider-image)] before:content-['']"
          : ""
      }
    >
      {title && (
        <p className="theme-text-secondary mb-3 flex items-center gap-2 text-[0.78rem] font-semibold uppercase tracking-[0.18em]">
          {icon && <Icon icon={icon} size={16} className="text-dose-accent-soft" />}
          {title}
          {count !== undefined && (
            <span className="theme-text-faint text-xs font-normal normal-case">({count})</span>
          )}
        </p>
      )}
      {children}
    </div>
  );
});

interface IndexCardListProps {
  children: ReactNode;
}

/**
 * List container for IndexCard items with consistent spacing.
 */
export const IndexCardList = memo(function IndexCardList({ children }: IndexCardListProps) {
  return <ul className="space-y-1.5">{children}</ul>;
});

interface IndexCardListItemProps {
  /** Item label */
  label: string;
  /** Optional href for direct navigation */
  href?: string;
  /** Click handler - use this OR (slug + onSelect) */
  onClick?: () => void;
  /** Item slug - use with onSelect for stable callbacks */
  slug?: string;
  /** Select handler - receives slug, use with slug prop for stable callbacks */
  onSelect?: (slug: string) => void;
}

/**
 * List item for IndexCard with bullet point styling.
 *
 * For optimal memoization, prefer using slug+onSelect pattern over inline onClick:
 * - Good: <IndexCardListItem label="..." slug={item.slug} onSelect={handleSelect} />
 * - Avoid: <IndexCardListItem label="..." onClick={() => handleSelect(item.slug)} />
 */
export const IndexCardListItem = memo(function IndexCardListItem({
  label,
  href,
  onClick,
  slug,
  onSelect,
}: IndexCardListItemProps) {
  const handleClick = useCallback(() => {
    if (onClick) {
      onClick();
    } else if (slug && onSelect) {
      onSelect(slug);
    }
  }, [onClick, slug, onSelect]);

  const className = "theme-text-secondary group/item flex w-full items-center rounded-xl px-3 py-2.5 text-left text-[0.9375rem] transition-[background-color,color,transform] duration-200 hover:translate-x-0.5 hover:bg-dose-surface-muted hover:text-dose-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dose-accent-strong";

  const content = (
    <>
      <span className="theme-index-card-bullet mr-3 inline-block h-1.5 w-1.5 shrink-0 rounded-full transition-colors group-hover/item:bg-dose-accent-soft" />
      {label}
    </>
  );

  if (href) {
    return (
      <li>
        <Link href={href} className={className}>
          {content}
        </Link>
      </li>
    );
  }

  return (
    <li>
      <button
        type="button"
        onClick={handleClick}
        className={className}
      >
        {content}
      </button>
    </li>
  );
});
