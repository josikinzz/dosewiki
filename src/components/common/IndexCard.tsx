import { useCallback, useState, memo, type ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

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
}: IndexCardProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const chevronIcon = isExpanded ? "lucide:chevron-up" : "lucide:chevron-down";
  const contentId = `${title.toLowerCase().replace(/\s+/g, "-")}-content`;

  const iconClassName = `flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/5 ring-1 ring-white/10 shadow-inner shadow-black/20 ${onIconClick ? "cursor-pointer transition duration-300 hover:bg-white/10 hover:ring-fuchsia-400/30 hover:shadow-fuchsia-500/10 hover:scale-105" : ""}`;

  const iconContent = (
    <Icon
      icon={iconActiveState ? "lucide:check" : icon}
      size={20}
      className={iconActiveState ? "text-emerald-400" : "text-fuchsia-300/80 transition-colors group-hover:text-fuchsia-300"}
    />
  );

  const iconElement = onIconClick ? (
    <button type="button" className={iconClassName} onClick={onIconClick}>
      {iconContent}
    </button>
  ) : (
    <div className={iconClassName}>
      {iconContent}
    </div>
  );

  const titleElement = (
    <h2 className="text-lg font-bold tracking-tight text-fuchsia-300 group-hover:text-fuchsia-200 transition-colors duration-300">
      {title}
      <span className="ml-2 text-[0.9em] font-medium text-white/40 group-hover:text-white/60 transition-colors">({count})</span>
    </h2>
  );

  return (
    <section className="group w-full rounded-[20px] border border-white/10 bg-white/[0.02] p-5 shadow-lg shadow-black/20 backdrop-blur-md backdrop-safe transition-all duration-300 hover:bg-white/[0.04] hover:border-fuchsia-500/20 hover:shadow-xl hover:shadow-fuchsia-500/5 hover:-translate-y-0.5">
      {/* Header */}
      <header className="flex items-start gap-4 pb-2">
        {iconElement}
        <div className="flex-1 min-w-0 pt-0.5">
          {onTitleClick ? (
            <button
              type="button"
              onClick={onTitleClick}
              className="text-left transition hover:opacity-80"
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
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-white/40 transition hover:bg-white/10 hover:text-white"
        >
          <Icon icon={chevronIcon} size={16} />
        </button>
      </header>

      {/* Content */}
      <div
        id={contentId}
        className={`grid transition-all duration-300 ease-in-out ${isExpanded ? "grid-rows-[1fr] opacity-100 mt-2" : "grid-rows-[0fr] opacity-0 mt-0"
          }`}
      >
        <div className="overflow-hidden">
          {children}
        </div>
      </div>
    </section>
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
          ? "relative pt-6 before:absolute before:left-0 before:right-0 before:top-0 before:h-px before:bg-[linear-gradient(90deg,rgba(255,255,255,0)_0%,rgba(255,255,255,0.1)_20%,rgba(255,255,255,0.1)_80%,rgba(255,255,255,0)_100%)] before:content-['']"
          : ""
      }
    >
      {title && (
        <p className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-fuchsia-200">
          {icon && <Icon icon={icon} size={16} className="text-fuchsia-300" />}
          {title}
          {count !== undefined && (
            <span className="text-xs font-normal normal-case text-white/40">({count})</span>
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
  return <ul className="space-y-1">{children}</ul>;
});

interface IndexCardListItemProps {
  /** Item label */
  label: string;
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

  return (
    <li>
      <button
        type="button"
        onClick={handleClick}
        className="group/item flex w-full items-center rounded-xl px-3 py-2.5 text-left text-[0.9375rem] text-white/70 transition-all duration-200 hover:bg-white/[0.06] hover:text-white hover:pl-4"
      >
        <span className="theme-index-card-bullet mr-3 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-white/20 transition-colors group-hover/item:bg-fuchsia-400" />
        {label}
      </button>
    </li>
  );
});
