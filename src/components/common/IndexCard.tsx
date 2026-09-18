"use client";

import { SmartLink } from "@/components/common/SmartLink";
import { useCallback, useId, useState, memo, type ReactNode } from "react";
import { InteractiveSurface } from "@/components/ui/surface";
import { TOUCH_ICON } from "@/components/ui/touchTargets";
import { ExpandIndicator } from "./ExpandButton";
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
  /**
   * Controls that sit between the title and the expand toggle. The public
   * index passes none; the /dev index layout editor passes its per-panel
   * handles so the editable card keeps the reader's header composition.
   */
  actions?: ReactNode;
}

/**
 * Vertical centring of the digits, in two layers:
 *
 * 1. The inner block is trimmed to cap height with `text-box`, so a flex
 *    centre puts the cap-height centre on the pill centre by definition,
 *    whatever the face's ascent/descent split (Inter's is mild, Titillium
 *    Web's is not).
 * 2. The pill's line-height equals its height, so where `text-box` is not
 *    supported the single line box fills the pill and the glyphs centre on
 *    the font's content area instead, which both shipped faces land within
 *    a pixel of centre.
 *
 * No sub-pixel transform anywhere in the badge or around it: Safari and
 * Chromium snap glyphs and backgrounds to the device grid independently
 * under a fractional translate, which is how the Clinical face ended up a
 * pixel high in some clients and low in others.
 *
 * `leading-*` stays after `text-[..]`: tailwind-merge otherwise drops it.
 */
export function IndexCardCountBadge({
  count,
  size = "md",
}: {
  count: number;
  size?: "sm" | "md";
}) {
  return (
    <span
      className={cn(
        // 0.62rem computed to 9.92px, under any legible floor for functional
        // text; these are the only numbers three public indexes print, so
        // both sizes now sit at or above 11px and the box grows with them.
        "theme-index-card-count inline-flex shrink-0 items-center justify-center rounded-[0.12rem] font-semibold tabular-nums tracking-normal",
        size === "sm"
          ? "theme-index-card-count-sm h-[1.25rem] min-w-[1.5rem] px-1.5 text-[0.6875rem] leading-[1.25rem]"
          : "h-[1.3rem] min-w-[1.55rem] px-1.5 text-[0.69rem] leading-[1.3rem]",
      )}
      aria-label={`${count} item${count === 1 ? "" : "s"}`}
    >
      <span className="block [text-box:trim-both_cap_alphabetic]">{count}</span>
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
  actions,
}: IndexCardProps) {
  const generatedId = useId();
  const [uncontrolledExpanded, setUncontrolledExpanded] =
    useState(defaultExpanded);
  const isExpanded = expanded ?? uncontrolledExpanded;
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
    "theme-index-card-icon flex h-10 w-10 shrink-0 items-center justify-center rounded-[0.85rem] ring-1 ring-dose-ring outline-none transition-colors duration-200",
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
  // titles keep it inline, centered on the title's line box. Same treatment
  // whether or not the leading icon is shown; the icon is rendered separately
  // in the header grid.
  const titleElement = (
    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-left">
      <h2 className="theme-index-card-title theme-index-card-title-accent min-w-0 text-lg font-bold leading-snug tracking-tight">
        <span className="line-clamp-2 break-words">{title}</span>
      </h2>
      {/* The title line box carries more ascender than descender room, so
          centering on it lands the badge about a pixel below the cap-height
          center in both faces. A whole-pixel layout offset corrects that; a
          fractional transform would take the pill off the device grid. */}
      <span className="relative -top-px flex">
        <IndexCardCountBadge count={count} />
      </span>
    </div>
  );

  return (
    <InteractiveSurface
      asChild
      variant="index"
      surfaceVariant={tone === "dim" ? "indexDim" : undefined}
      padding="md"
      radius="index"
      className="group w-full"
    >
      <section>
        {/* Header */}
        <header
          className={cn(
            "grid items-center gap-3 pb-2",
            hideIcon ? "grid-cols-[minmax(0,1fr)_auto]" : "grid-cols-[auto_minmax(0,1fr)_auto]",
            hideIcon
              ? "[&:has(>[data-index-card-actions]:not(:empty))]:grid-cols-[minmax(0,1fr)_auto_auto]"
              : "[&:has(>[data-index-card-actions]:not(:empty))]:grid-cols-[auto_minmax(0,1fr)_auto_auto]",
          )}
        >
          {hideIcon ? null : iconElement}
          <div className="min-w-0 flex-1">
            {titleHref ? (
              <SmartLink
                href={titleHref}
                className="theme-focus-ring block min-w-0 text-left transition-opacity hover:opacity-80"
              >
                {titleElement}
              </SmartLink>
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
          {actions ? <div data-index-card-actions className="contents">{actions}</div> : null}
          <button
            type="button"
            onClick={handleToggle}
            aria-expanded={isExpanded}
            aria-controls={resolvedContentId}
            aria-label={resolvedToggleLabel}
            className={cn("theme-index-card-toggle theme-focus-ring flex h-8 min-w-10 shrink-0 items-center justify-center rounded-lg outline-none transition-colors motion-reduce:transition-none", TOUCH_ICON)}
          >
            <ExpandIndicator isExpanded={isExpanded} />
          </button>
        </header>

        <div
          id={resolvedContentId}
          aria-hidden={!isExpanded}
          inert={!isExpanded}
          className={cn(
            "grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none",
            isExpanded
              ? "grid-rows-[1fr] opacity-100"
              : "grid-rows-[0fr] opacity-0",
          )}
        >
          <div className="min-h-0 overflow-hidden">
            <div className="pt-2">{children}</div>
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
            <Icon icon={icon} size={16} className="theme-icon-accent" />
          )}
          {titleHref ? (
            <SmartLink
              href={titleHref}
              className="theme-focus-ring rounded-sm transition-opacity hover:opacity-80"
            >
              {title}
            </SmartLink>
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
  /** Optional contextual controls, outside the navigation link or button. */
  actions?: ReactNode;
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
  actions,
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
    "theme-index-card-link theme-text-secondary group/item mx-1 flex w-[calc(100%-1rem)] items-center rounded-xl py-2.5 pr-3 text-left text-[0.9375rem] transition-[background-color,color] duration-200 hover:bg-dose-surface-muted hover:text-dose-text theme-focus-ring",
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
      <span className="theme-index-card-label min-w-0">{label}</span>
      {meta ? (
        <span className="theme-text-faint ml-auto shrink-0 pl-3 text-[0.8125rem] tabular-nums">
          {meta}
        </span>
      ) : null}
    </>
  );

  if (href) {
    return (
      <li id={id} className={cn(id && "scroll-mt-24", "[&:has(>[data-index-item-actions]:not(:empty))]:flex [&:has(>[data-index-item-actions]:not(:empty))]:items-center")}>
        <SmartLink href={href} className={className}>
          {content}
        </SmartLink>
        {actions ? <div data-index-item-actions className="contents">{actions}</div> : null}
      </li>
    );
  }

  return (
    <li id={id} className={cn(id && "scroll-mt-24", "[&:has(>[data-index-item-actions]:not(:empty))]:flex [&:has(>[data-index-item-actions]:not(:empty))]:items-center")}>
      <button type="button" onClick={handleClick} className={className}>
        {content}
      </button>
      {actions ? <div data-index-item-actions className="contents">{actions}</div> : null}
    </li>
  );
});
