"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Leans a control icon (never its label) with the stage media: while the
 * active work is painted sideways under rotate mode the iconography turns
 * the same way, and swiping onto an upright work eases it back — the
 * camera-app grammar for a rotated world. Purely decorative: hit areas,
 * layout, and text all stay upright.
 */
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
