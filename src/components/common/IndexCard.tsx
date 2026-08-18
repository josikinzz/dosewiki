"use client";

import Link from "next/link";
import { useCallback, useId, useState, memo, type ReactNode } from "react";
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
  /**
   * Hide the leading icon entirely. Use when the icon would be redundant —
   * e.g. single-class substance-index tabs where every panel shares the same
   * category glyph. The header collapses to title + chevron. Note: the icon
   * doubles as the copy-list control, so that affordance is dropped too.
   */
  hideIcon?: boolean;
}

function IndexCardCountBadge({
  count,
  size = "md",
}: {
  count: number;
  size?: "sm" | "md";
}) {
  return (
    <span
      className={cn(
        "theme-index-card-count inline-flex shrink-0 items-center justify-center rounded-[0.12rem] font-semibold leading-none tabular-nums",
        size === "sm"
          ? "theme-index-card-count-sm h-[1.12rem] min-w-[1.35rem] px-1.5 text-[0.58rem] tracking-normal"
          : "h-[1.15rem] min-w-[1.4rem] px-1.5 text-[0.62rem] tracking-normal",
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
  hideIcon = false,
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
    "theme-index-card-icon flex h-10 w-10 shrink-0 items-center justify-center rounded-[0.85rem] ring-1 ring-white/10 outline-none transition-colors duration-200",
    onIconClick
      ? "theme-focus-ring cursor-pointer"
      : undefined,
  );

  const iconContent = (
    <Icon
      icon={iconActiveState ? "lucide:check" : icon}
      size={28}
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
    <div className={iconClassName}>{iconContent}</div>
  );

  // The count badge rides inline with the title and only drops to its own line
  // when a narrow panel leaves no room beside it. `flex-wrap` + `min-w-0` let
  // the title claim the row and bump the badge down at thin widths, while short
  // titles keep it inline on the baseline. Same treatment whether or not the
  // leading icon is shown — the icon is rendered separately in the header grid.
  const titleElement = (
    <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1 text-left">
      <h2 className="theme-index-card-title theme-index-card-title-accent min-w-0 text-lg font-bold leading-snug tracking-tight">
        <span className="line-clamp-2 break-words">{title}</span>
      </h2>
      <IndexCardCountBadge count={count} />
    </div>
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
        <header
          className={cn(
            "grid items-start gap-3 pb-2",
            hideIcon
              ? "grid-cols-[minmax(0,1fr)_auto]"
              : "grid-cols-[auto_minmax(0,1fr)_auto]",
          )}
        >
          {hideIcon ? null : iconElement}
          <div className="min-w-0 flex-1 pt-1">
            {titleHref ? (
              <Link
                href={titleHref}
                className="theme-focus-ring block min-w-0 text-left transition-opacity hover:opacity-80"
              >
                {titleElement}
              </Link>
            ) : onTitleClick ? (
              <button
                type="button"
                onClick={onTitleClick}
                className="theme-focus-ring min-w-0 text-left transition-opacity hover:opacity-80"
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
            className="theme-index-card-toggle theme-focus-ring mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg outline-none transition"
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
  /** Anchor id, when the section is a link or table-of-contents destination. */
  id?: string;
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
  /** Destination of the section's own page, when it has one. */
  titleHref?: string;
}

/**
 * Section within an IndexCard for grouping content with optional headers.
 *
 * A section that owns a page links from its title, the same affordance the card
 * title uses. Only the name is the link — the icon and the count describe the
 * group rather than naming the destination, and a link that swallows them
 * leaves a wide dead-looking target beside the words that matter.
 */
export const IndexCardSection = memo(function IndexCardSection({
  id,
  title,
  icon,
  count,
  children,
  showDivider = false,
  titleHref,
}: IndexCardSectionProps) {
  return (
    <div
      id={id}
      className={cn(
        showDivider &&
          "relative pt-6 before:absolute before:left-0 before:right-0 before:top-0 before:h-px before:bg-[image:var(--theme-horizontal-divider-image)] before:content-['']",
        id && "scroll-mt-24",
      )}
    >
      {title && (
        <p className="theme-index-card-section-label mb-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.78rem] font-semibold uppercase tracking-[0.18em]">
          {icon && (
            <Icon icon={icon} size={16} className="text-dose-accent-soft" />
          )}
          {titleHref ? (
            <Link
              href={titleHref}
              className="theme-focus-ring rounded-sm transition-opacity hover:opacity-80"
            >
              {title}
            </Link>
          ) : (
            title
          )}
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
export const IndexCardList = memo(function IndexCardList({
  children,
}: IndexCardListProps) {
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
  /**
   * Trailing qualifier for the row — the frequency an effect occurs at, say.
   * Set quietly at the row's far edge so a column of them reads as one scannable
   * rail rather than competing with the labels.
   */
  meta?: ReactNode;
  /**
   * Indent level. `1` marks a row as belonging to the one above it — a
   * sub-effect under its parent effect — with a hollow bullet, so the
   * relationship reads without a second list nested inside the first.
   */
  depth?: 0 | 1;
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
  meta,
  depth = 0,
}: IndexCardListItemProps) {
  const handleClick = useCallback(() => {
    if (onClick) {
      onClick();
    } else if (slug && onSelect) {
      onSelect(slug);
    }
  }, [onClick, slug, onSelect]);

  const className = cn(
    "theme-index-card-link theme-text-secondary group/item mx-1 flex w-[calc(100%-1rem)] items-center rounded-xl py-2.5 pr-3 text-left text-[0.9375rem] transition-[background-color,color] duration-200 hover:bg-dose-surface-muted hover:text-dose-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dose-accent-strong",
    depth === 1 ? "pl-8 text-[0.875rem]" : "pl-3",
  );

  const content = (
    <>
      <span
        className={cn(
          "theme-index-card-bullet mr-3 inline-block h-1.5 w-1.5 shrink-0 rounded-full",
          depth === 1 && "bg-transparent ring-1 ring-current opacity-60",
        )}
      />
      <span className="min-w-0">{label}</span>
      {meta ? (
        <span className="theme-text-faint ml-auto shrink-0 pl-3 text-[0.8125rem] tabular-nums">
          {meta}
        </span>
      ) : null}
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
      <button type="button" onClick={handleClick} className={className}>
        {content}
      </button>
    </li>
  );
});
