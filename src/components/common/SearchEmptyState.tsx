import * as React from "react";

import { cn } from "@/lib/utils";
import { Icon, type IconName } from "./Icon";

type HeadingLevel = "h1" | "h2" | "h3";

export interface SearchEmptyStateProps {
  /** Iconify name for the centered glyph (lucide:* or custom:*). */
  icon: IconName;
  /** Headline copy. */
  title: React.ReactNode;
  /** Supporting copy under the title. */
  description?: React.ReactNode;
  /** Heading element for the title. Defaults to "h1". */
  headingLevel?: HeadingLevel;
  /** Pixel size for the centered icon. Defaults to 20. */
  iconSize?: number;
  /** Extra classes merged onto the centered flex stack. */
  className?: string;
}

/**
 * Centered icon + title + description stack used inside the search result
 * panels (empty / loading / no-results states). Render it inside the page's
 * `theme-public-card` panel; this component owns only the inner stack so each
 * call site keeps its own panel chrome and spacing via `className`.
 */
export function SearchEmptyState({
  icon,
  title,
  description,
  headingLevel = "h1",
  iconSize = 20,
  className,
}: SearchEmptyStateProps) {
  const Heading = headingLevel;
  return (
    <div
      className={cn(
        "flex min-h-44 flex-col items-center justify-center gap-3 text-center",
        className,
      )}
    >
      <span className="theme-search-suggestion-icon inline-flex h-10 w-10 items-center justify-center rounded-xl">
        <Icon icon={icon} size={iconSize} />
      </span>
      <div className="space-y-1">
        <Heading className="theme-search-suggestion-title text-lg font-semibold">
          {title}
        </Heading>
        {description ? (
          <p className="theme-search-suggestion-secondary max-w-md text-[0.8125rem] leading-5">
            {description}
          </p>
        ) : null}
      </div>
    </div>
  );
}
