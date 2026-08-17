"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** The appearance axis a pill owns. Mirrored to the DOM for tests and skin hooks. */
type AppearanceAxis = "color-scheme" | "visual-style";

const SLOT_CLASS =
  "relative z-10 inline-flex h-9 w-9 items-center justify-center transition-colors duration-300 motion-reduce:transition-none";
const ACTIVE_SLOT_CLASS = "theme-toggle-icon-accent";
const INACTIVE_SLOT_CLASS = "theme-toggle-icon-muted";

interface AppearanceTogglePillProps {
  axis: AppearanceAxis;
  /** Active value on this axis, mirrored to the DOM. */
  value: string;
  /** Slot the thumb rests under: the left option or the right one. */
  side: "start" | "end";
  /**
   * Pressed state for this axis alone. Both appearance pills sit in the cog's panel and
   * must never mirror each other, so each publishes its own state.
   */
  pressed: boolean;
  /** Action-shaped accessible name, e.g. "Switch to day mode". Also the tooltip. */
  label: string;
  onToggle: () => void;
  start: ReactNode;
  end: ReactNode;
}

/**
 * The shared two-state appearance switch: a 44px pill with a sliding thumb under
 * one of two 36px slots.
 *
 * Day/Night and Fun/Pro are geometric twins on purpose — identical size, thumb
 * travel and colour recipe — so the pair reads as two independent switches on one
 * instrument rather than as one four-state control. It reuses the existing
 * `theme-toggle-*` recipe, so every style and scheme already dresses both pills.
 */
export function AppearanceTogglePill({
  axis,
  value,
  side,
  pressed,
  label,
  onToggle,
  start,
  end,
}: AppearanceTogglePillProps) {
  const startActive = side === "start";

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={pressed}
      aria-label={label}
      title={label}
      data-appearance-axis={axis}
      data-appearance-value={value}
      className="theme-toggle-pill relative inline-flex h-11 w-20 shrink-0 items-center rounded-full px-1 transition-[border-color,background-color] duration-300 motion-reduce:transition-none"
    >
      <span
        aria-hidden="true"
        className={cn(
          "theme-toggle-thumb pointer-events-none absolute left-1 top-1 h-9 w-9 rounded-full border transition-transform duration-300 motion-reduce:transition-none",
          startActive ? "translate-x-0" : "translate-x-9",
        )}
      />
      <span
        aria-hidden="true"
        className={cn(SLOT_CLASS, startActive ? ACTIVE_SLOT_CLASS : INACTIVE_SLOT_CLASS)}
      >
        {start}
      </span>
      <span
        aria-hidden="true"
        className={cn(SLOT_CLASS, startActive ? INACTIVE_SLOT_CLASS : ACTIVE_SLOT_CLASS)}
      >
        {end}
      </span>
    </button>
  );
}
