"use client";

import { SITE_FLAVOR_CONFIG } from "@/config/siteFlavor";
import { useTheme } from "@/context/ThemeContext";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "./ThemeToggle";
import { VisualStyleToggle } from "./VisualStyleToggle";

/**
 * The reader's appearance group: Day/Night beside Fun/Pro.
 *
 * One composition for every surface that offers appearance choices — the footer,
 * the homepage floating cluster and the `/dev/kit` parity harness — so the two
 * axes are always presented, labelled and spaced the same way.
 *
 * Which controls appear is publication policy, not a caller decision:
 *
 * - The colour scheme is selectable on both publications, so it follows
 *   `showColorSchemeToggle`.
 * - The visual style is locked on a publication whose identity *is* one style
 *   (Effect Index is Pro). Under that lock `setVisualStyle` is a no-op, so the
 *   control is not rendered at all rather than rendered inert.
 *
 * The lock is read from the provider, which is the only thing that knows whether
 * the axis is actually writable.
 *
 * The group lays the pair out in a row. A caller whose container cannot spare the
 * pair's full width — a fixed overlay competing with other bottom chrome, a narrow
 * footer column — passes `flex-col` for those widths and gets the same two controls
 * stacked in one pill's width instead. Neither control is ever dropped for space.
 */
export function AppearanceControls({ className }: { className?: string }) {
  const { isVisualStyleLocked } = useTheme();
  const showColorScheme = SITE_FLAVOR_CONFIG.showColorSchemeToggle;
  const showVisualStyle = !isVisualStyleLocked;

  if (!showColorScheme && !showVisualStyle) {
    return null;
  }

  return (
    <div
      role="group"
      aria-label="Appearance"
      className={cn("theme-appearance-controls flex items-center gap-2", className)}
    >
      {showColorScheme ? <ThemeToggle /> : null}
      {showVisualStyle ? <VisualStyleToggle /> : null}
    </div>
  );
}
