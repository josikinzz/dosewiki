"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function RotatingIcon({
  rotated,
  className,
  children,
}: {
  rotated: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      aria-hidden
      data-rotating-icon
      className={cn(
        "grid place-items-center transition-transform duration-200 motion-reduce:transition-none",
        rotated ? "rotate-90" : "rotate-0",
        className,
      )}
    >
      {children}
    </span>
  );
}
