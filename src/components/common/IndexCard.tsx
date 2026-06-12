"use client";

import Link from "next/link";
import {
  useCallback,
  useId,
  useState,
  memo,
  type ReactNode,
} from "react";
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
  /** Controlled expanded state. */
  expanded?: boolean;
  /** Called when the expand/collapse control changes. */
  onExpandedChange?: (expanded: boolean) => void;
  /** Stable id for the collapsible content region. */
  contentId?: string;
  /** Optional small text below the title. */
  description?: ReactNode;
  /** Optional title href. */
  titleHref?: string;
  /** Optional click handler for the title (makes it a link) */
  onTitleClick?: () => void;
  /** Optional click handler for the icon */
  onIconClick?: () => void;
  /** Accessible label for the optional icon action */
  iconActionLabel?: string;
  /** Icon to show when onIconClick has been triggered (e.g., checkmark for "copied") */
  iconActiveState?: boolean;
  /** Optional accessible label override for the expand/collapse button. */
  toggleLabel?: string;
  /** Surface tone: "dim" = neutral grey panel instead of the purple index surface. */
  tone?: "default" | "dim";
}

function IndexCardCountBadge({ count, size = "md" }: { count: number; size?: "sm" | "md" }) {
  return (
    <span
      className={cn(
        "theme-index-card-count inline-flex shrink-0 items-center justify-center rounded-[0.12rem] font-semibold leading-none tabular-nums",
        size === "sm"
          ? "theme-index-card-count-sm h-[1.12rem] min-w-[1.35rem] px-1.5 text-[0.58rem] tracking-normal"
          : "h-[1.35rem] min-w-[1.55rem] translate-y-px px-2 text-[0.7rem] tracking-normal",
      )}
      aria-label={`${count} item${count === 1 ? "" : "s"}`}
    >
      {count}
    </span>
  );
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
  expanded,
  onExpandedChange,
  contentId,
  description,
  titleHref,
  onTitleClick,
  onIconClick,
  iconActionLabel,
  iconActiveState = false,
  toggleLabel,
  tone = "default",
}: IndexCardProps) {
  const generatedId = useId();
  const [uncontrolledExpanded, setUncontrolledExpanded] =
    useState(defaultExpanded);
  const isExpanded = expanded ?? uncontrolledExpanded;
  const chevronIcon = isExpanded ? "lucide:chevron-up" : "lucide:chevron-down";
  const resolvedContentId = contentId ?? `index-card-${generatedId}`;
  const resolvedToggleLabel =
    toggleLabel ?? `${isExpanded ? "Collapse" : "Expand"} ${title}`;

  const handleToggle = useCallback(() => {
    const nextExpanded = !isExpanded;
    if (expanded === undefined) {
      setUncontrolledExpanded(nextExpanded);
    }
    onExpandedChange?.(nextExpanded);
  }, [expanded, isExpanded, onExpandedChange]);

  const iconClassName = cn(
    "theme-index-card-icon flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 ring-white/10 outline-none transition-colors duration-200",
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
          : "theme-index-card-icon-glyph transition-colors"
      }
    />
  );

  const iconElement = onIconClick ? (
    <button
      type="button"
      className={iconClassName}
      onClick={onIconClick}
      aria-label={iconActionLabel ?? `${title} action`}
    >
      {iconContent}
    </button>
  ) : (
    <div className={iconClassName}>
      {iconContent}
    </div>
  );

  const titleElement = (
    <h2
      className="theme-index-card-title theme-index-card-title-accent flex min-w-0 flex-nowrap items-center gap-x-2.5 text-left text-lg font-bold tracking-tight transition-colors duration-200 group-hover:text-dose-accent-strong"
    >
      <span className="min-w-0 truncate">{title}</span>
      <IndexCardCountBadge count={count} />
    </h2>
  );

  return (
    <InteractiveSurface
      asChild
      variant="index"
      surfaceVariant={tone === "dim" ? "indexDim" : undefined}
      padding="md"
      radius="index"
      className="group w-full transition-all duration-300"
    >
      <section>
      {/* Header */}
      <header className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-4 pb-2">
        {iconElement}
        <div className="min-w-0 flex-1 pt-1">
          {titleHref ? (
            <Link
              href={titleHref}
              className="block min-w-0 text-left transition-opacity hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400"
            >
              {titleElement}
            </Link>
          ) : onTitleClick ? (
            <button
              type="button"
              onClick={onTitleClick}
              className="min-w-0 text-left transition-opacity hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400"
            >
              {titleElement}
            </button>
          ) : (
            titleElement
          )}
          {description ? (
            <p className="theme-text-faint mt-1 text-xs">{description}</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={handleToggle}
          aria-expanded={isExpanded}
          aria-controls={resolvedContentId}
          aria-label={resolvedToggleLabel}
          className="theme-index-card-toggle flex h-11 w-11 shrink-0 items-center justify-center rounded-xl outline-none transition focus-visible:ring-2 focus-visible:ring-fuchsia-400"
        >
          <Icon icon={chevronIcon} size={16} />
        </button>
      </header>

      <div
        id={resolvedContentId}
        className={cn(
          "grid transition-all duration-300 ease-in-out",
          isExpanded
            ? "mt-2 grid-rows-[1fr] opacity-100"
            : "mt-0 grid-rows-[0fr] opacity-0",
        )}
      >
        <div className={isExpanded ? "overflow-visible" : "overflow-hidden"}>
          {children}
        </div>
      </div>
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
        <p className="theme-index-card-section-label mb-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.78rem] font-semibold uppercase tracking-[0.18em]">
          {icon && <Icon icon={icon} size={16} className="text-dose-accent-soft" />}
          {title}
          {count !== undefined && (
            <IndexCardCountBadge count={count} size="sm" />
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
  return <ul className="-mb-1 space-y-1.5 pb-1">{children}</ul>;
});

interface IndexCardListItemProps {
  /** Optional anchor id for deep links to this item */
  id?: string;
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
  id,
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

  const className = "theme-index-card-link theme-text-secondary group/item mx-1 flex w-[calc(100%-1rem)] items-center rounded-xl px-3 py-2.5 text-left text-[0.9375rem] transition-[background-color,color] duration-200 hover:bg-dose-surface-muted hover:text-dose-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dose-accent-strong";

  const content = (
    <>
      <span className="theme-index-card-bullet mr-3 inline-block h-1.5 w-1.5 shrink-0 rounded-full" />
      {label}
    </>
  );

  if (href) {
    return (
      <li id={id} className={id ? "scroll-mt-24" : undefined}>
        <Link href={href} className={className}>
          {content}
        </Link>
      </li>
    );
  }

  return (
    <li id={id} className={id ? "scroll-mt-24" : undefined}>
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
