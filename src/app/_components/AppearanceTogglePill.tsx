"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** The appearance axis a pill owns. Mirrored to the DOM for tests and skin hooks. */
type AppearanceAxis = "color-scheme" | "visual-style" | "font";

/**
 * `w-1/2` rather than a stated pixel width: two halves of the pill's content box
 * always fit it exactly, so the slot pitch is a property of the box instead of an
 * accident of flex-shrink. See the geometry contract below.
 */
const SLOT_CLASS =
  "relative z-10 inline-flex h-9 w-1/2 items-center justify-center transition-colors duration-300 motion-reduce:transition-none";
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
 * The shared two-state appearance switch: an 80x44px pill whose thumb slides between
 * two half-width slots.
 *
 * Day/Night and Fun/Pro are geometric twins on purpose — identical size, thumb
 * travel and colour recipe — so the pair reads as two independent switches on one
 * instrument rather than as one four-state control. It reuses the existing
 * `theme-toggle-*` recipe, so every style and scheme already dresses both pills.
 *
 * Geometry contract: every box here is derived, never asserted. The thumb is
 * inset-positioned (`inset-y-1 left-1 right-1/2`) and travels by `translate-x-full`;
 * the slots take `w-1/2`. For a pill of border-box width W with border b and padding
 * p, the thumb spans (W - 2b)/2 - p and a slot spans (W - 2b - 2p)/2 — algebraically
 * the same number, both offset b + p from the left edge. The travel is 100% of the
 * thumb's own width, so thumb pitch equals slot pitch by construction at any pill
 * width and any border thickness, and the thumb shares a centre with the active slot
 * in both states. Insets also centre vertically for free: they resolve symmetrically
 * inside the padding box, which a symmetric border leaves centred in the border box.
 *
 * That identity is the fix for a measured defect. The previous `left-1 top-1 h-9 w-9`
 * plus `translate-x-9` asserted 36px over a box that could not grant it — the 80px pill
 * less its 1px border (`utilities-theme.css:3024`) and `px-1` leaves a 70px content box,
 * so two 36px slots shrank to 35px while the absolutely positioned thumb, not being a
 * flex item, kept 36px. Measured by `getBoundingClientRect()` in the running app: the
 * thumb sat 0.5px right of its slot at rest and 1.5px right at the far end, because 36px
 * of travel crossed a 35px pitch; and vertically it was not so much 1px low as 2px
 * lopsided, 5px of pill above it against 3px below, because `top-1` resolves against the
 * padding box that the border had already inset. The glyphs were centred in their slots
 * to 0.0px in both states, so what read as an off-centre icon was the puck having moved:
 * nudging a glyph would have squared one state and broken the other. Nothing here is
 * glyph-specific.
 *
 * `inset-y-1` deliberately matches the pill's `px-1`, and the match is the point — the
 * thumb then clears the border box by b + p = 5px on all four sides, so a round thumb is
 * concentric with the round pill and the ring around it is a constant 5px. Read the puck
 * going 36px -> 34px together with that and never on its own: it is 2px smaller and, for
 * the first time, evenly ringed, where before it was 5px clear above and 3px below. The
 * fatter `inset-y-0.5` puck was rejected for the opposite trade — 38px tall but ringed
 * 3px vertically against 5px at the caps, and a ring that changes width around a
 * full-round cap reads as a squashed puck, which is the complaint this change answers.
 * The `box-shadow` those `.theme-toggle-thumb` rules carry survives the smaller radius,
 * measured rather than assumed: Pro's is `0 0 #0000`, and Fun's `0 16px 32px -28px` drop
 * term (`site-colors.css:393`) contracts its shadow rect by 28px a side, which a 35px
 * puck cannot survive at any height — rendered side by side, 35x34 and 35x36 are
 * pixel-identical with that term and without it. What paints is `inset 0 1px 0`, a
 * hairline whose 1px thickness no height can change.
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
          "theme-toggle-thumb pointer-events-none absolute inset-y-1 left-1 right-1/2 rounded-full border transition-transform duration-300 motion-reduce:transition-none",
          startActive ? "translate-x-0" : "translate-x-full",
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
