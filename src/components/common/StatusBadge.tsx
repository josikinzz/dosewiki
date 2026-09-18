import * as React from "react";

import { cn } from "@/lib/utils";

export type StatusBadgeTone =
  | "red"
  | "rose"
  | "yellow"
  | "orange"
  | "blue"
  | "green"
  | "emerald"
  | "gray"
  | "white";

export interface StatusBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Semantic tone, mapped to theme tokens via the data-badge-tone attribute. */
  tone: StatusBadgeTone;
}

/**
 * Inline pill badge for status/severity labels in article sections.
 *
 * Emits the canonical `theme-status-badge` class string and a
 * `data-badge-tone` attribute that drives the per-tone theme tokens. Extra
 * surface classes (e.g. `theme-semantic-danger-badge`) and layout overrides
 * are merged through `className`.
 */
export function StatusBadge({ tone, className, children, ...props }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "theme-status-badge inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        className,
      )}
      data-badge-tone={tone}
      {...props}
    >
      {children}
    </span>
  );
}
