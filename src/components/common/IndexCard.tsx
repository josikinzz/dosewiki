"use client";

import { SmartLink } from "@/components/common/SmartLink";
import { useCallback, useId, useState, memo, type ReactNode } from "react";
import { InteractiveSurface } from "@/components/ui/surface";
import { TOUCH_HALO } from "@/components/ui/touchTargets";
import { ExpandIndicator } from "./ExpandButton";
import { Icon, type IconName } from "./Icon";
import { cn } from "@/lib/utils";

interface IndexCardProps {
  title: string;
  icon: IconName;
  count: number;
  children: ReactNode;
  defaultExpanded?: boolean;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  contentId?: string;
  description?: ReactNode;
  titleHref?: string;
  onTitleClick?: () => void;
  onIconClick?: () => void;
  iconActionLabel?: string;
  iconActiveState?: boolean;
  toggleLabel?: string;
  tone?: "default" | "dim";
  hideIcon?: boolean;
  actions?: ReactNode;
}

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
        "theme-index-card-count inline-flex h-5 min-w-6 shrink-0 items-center justify-center rounded-chip px-1.5 text-[11px] font-semibold leading-5 tabular-nums tracking-normal",
        size === "sm" && "theme-index-card-count-sm",
      )}
      aria-label={`${count} item${count === 1 ? "" : "s"}`}
    >
      <span className="block [text-box:trim-both_cap_alphabetic]">{count}</span>
    </span>
  );
}

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
    "theme-index-card-icon flex h-10 w-10 shrink-0 items-center justify-center rounded-control ring-1 ring-dose-ring outline-none transition-colors",
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
          ? "text-dose-success"
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

  const titleElement = (
    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-left">
      <h2 className="theme-index-card-title theme-index-card-title-accent min-w-0 text-lg font-bold leading-snug tracking-tight">
        <span className="line-clamp-2 break-words">{title}</span>
      </h2>
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
                className="theme-focus-ring block min-w-0 text-left transition-opacity hover:opacity-90"
              >
                {titleElement}
              </SmartLink>
            ) : onTitleClick ? (
              <button
                type="button"
                onClick={onTitleClick}
                className="theme-focus-ring min-w-0 text-left transition-opacity hover:opacity-90"
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
            className={cn("theme-index-card-toggle theme-focus-ring flex h-8 min-w-10 shrink-0 items-center justify-center rounded-control outline-none transition-colors motion-reduce:transition-none", TOUCH_HALO)}
          >
            <ExpandIndicator isExpanded={isExpanded} />
          </button>
        </header>

        <div
          id={resolvedContentId}
          aria-hidden={!isExpanded}
          inert={!isExpanded}
          className={cn(
            "grid transition-[grid-template-rows,opacity] duration-[var(--motion-base)] motion-reduce:transition-none",
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
  id?: string;
  title?: string;
  icon?: IconName;
  count?: number;
  children: ReactNode;
  showDivider?: boolean;
  titleHref?: string;
}

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
        <p className="theme-index-card-section-label type-meta-label mb-2.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          {icon && (
            <Icon icon={icon} size={16} className="theme-icon-accent" />
          )}
          {titleHref ? (
            <SmartLink
              href={titleHref}
              className="theme-focus-ring rounded-chip transition-opacity hover:opacity-90"
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

export const IndexCardList = memo(function IndexCardList({
  children,
}: IndexCardListProps) {
  return <ul className="-mb-1 space-y-1.5 pb-1">{children}</ul>;
});

interface IndexCardListItemProps {
  id?: string;
  label: string;
  href?: string;
  onClick?: () => void;
  slug?: string;
  onSelect?: (slug: string) => void;
  meta?: ReactNode;
  actions?: ReactNode;
  depth?: 0 | 1;
}

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
    "theme-index-card-link theme-text-secondary group/item mx-1 flex w-[calc(100%-1rem)] items-center rounded-control py-2.5 pr-3 text-left text-sm transition-[background-color,color] hover:bg-dose-surface-muted hover:text-dose-text theme-focus-ring",
    depth === 1 ? "pl-8 text-[13px]" : "pl-3",
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
        <span className="theme-text-faint ml-auto shrink-0 pl-3 text-[13px] tabular-nums">
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
