import * as React from "react";

import { cn } from "@/lib/utils";
import { Icon, type IconName } from "./Icon";

type HeadingLevel = "h1" | "h2" | "h3";

export interface SearchEmptyStateProps {
  icon: IconName;
  title: React.ReactNode;
  description?: React.ReactNode;
  headingLevel?: HeadingLevel;
  iconSize?: number;
  className?: string;
}

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
      <span className="theme-search-suggestion-icon inline-flex h-10 w-10 items-center justify-center rounded-card">
        <Icon icon={icon} size={iconSize} />
      </span>
      <div className="space-y-1">
        <Heading className="theme-search-suggestion-title font-display text-lg font-semibold tracking-tight">
          {title}
        </Heading>
        {description ? (
          <p className="theme-search-suggestion-secondary max-w-md text-sm leading-6">
            {description}
          </p>
        ) : null}
      </div>
    </div>
  );
}
