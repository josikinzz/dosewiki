import { useState, memo, type ReactNode } from "react";
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

  const iconElement = (
    <div 
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/15 ${onIconClick ? "cursor-pointer transition hover:bg-white/15 hover:ring-white/25" : ""}`}
      onClick={onIconClick}
      role={onIconClick ? "button" : undefined}
      tabIndex={onIconClick ? 0 : undefined}
    >
      <Icon
        icon={iconActiveState ? "lucide:check" : icon}
        size={18}
        className={iconActiveState ? "text-emerald-300" : "text-fuchsia-200"}
      />
    </div>
  );

  const titleElement = (
    <h2 className="text-lg font-semibold text-fuchsia-300">
      {title}
      <span className="ml-2 text-sm font-normal text-white/40">({count})</span>
    </h2>
  );

  return (
    <section className="w-full rounded-2xl border border-white/10 bg-white/5 p-4 shadow-[0_10px_30px_-12px_rgba(0,0,0,0.35)] backdrop-blur backdrop-safe break-inside-avoid transition hover:border-fuchsia-400/30 hover:shadow-[0_18px_50px_-12px_rgba(0,0,0,0.45)]">
      {/* Header */}
      <header className="flex items-start gap-3 pb-3">
        {iconElement}
        <div className="flex-1 min-w-0">
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
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-white/50 transition hover:bg-white/10 hover:text-white"
        >
          <Icon icon={chevronIcon} size={16} />
        </button>
      </header>

      {/* Content */}
      {isExpanded && (
        <div id={contentId} className="mt-3">
          {children}
        </div>
      )}
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
  /** Click handler */
  onClick: () => void;
}

/**
 * List item for IndexCard with bullet point styling.
 */
export const IndexCardListItem = memo(function IndexCardListItem({
  label,
  onClick,
}: IndexCardListItemProps) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center rounded-xl px-1.5 py-2 text-left text-sm text-white/85 transition hover:bg-white/10 hover:text-fuchsia-300"
      >
        <span className="mr-2 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-fuchsia-400/60" />
        {label}
      </button>
    </li>
  );
});
