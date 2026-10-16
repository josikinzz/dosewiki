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
  tone: StatusBadgeTone;
}

export function StatusBadge({ tone, className, children, ...props }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "theme-status-badge inline-flex h-5 items-center whitespace-nowrap rounded-full px-2 text-xs font-medium leading-none",
        className,
      )}
      data-badge-tone={tone}
      {...props}
    >
      {children}
    </span>
  );
}
