"use client";

import { SITE_FLAVOR_CONFIG } from "@/config/siteFlavor";
import { useTheme } from "@/context/ThemeContext";
import { AppearanceCog } from "./AppearanceCog";

/**
 * Resolves publication policy for the appearance axes. DoseWiki always exposes
 * its public Palette Lab drawer from the panel.
 *
 * `className` lands on the trigger itself because the homepage positions that
 * button directly.
 */
export function AppearanceControls({ className }: { className?: string }) {
  const { isVisualStyleLocked, isSurfaceLocked, isAccentLocked } = useTheme();
  const hasPaletteLab = SITE_FLAVOR_CONFIG.flavor === "dosewiki";

  return (
    <AppearanceCog
      className={className}
      showVisualStyle={!isVisualStyleLocked}
      showColorScheme={SITE_FLAVOR_CONFIG.showColorSchemeToggle}
      showSurface={!isSurfaceLocked}
      showAccent={!isAccentLocked}
      showMoreSettings={hasPaletteLab}
    />
  );
}
