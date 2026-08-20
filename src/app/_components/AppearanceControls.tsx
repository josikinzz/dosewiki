"use client";

import { SITE_FLAVOR_CONFIG } from "@/config/siteFlavor";
import { useTheme } from "@/context/ThemeContext";
import { AppearanceCog } from "./AppearanceCog";

/**
 * Resolves publication policy for the appearance axes. DoseWiki always exposes
 * its public Theme Lab drawer from the panel.
 *
 * `className` lands on the trigger itself because the homepage positions that
 * button directly.
 *
 * `allowThemeLab` is the caller's veto over that drawer, not a second policy: the
 * pre-launch holding page mounts this cog so a visitor can still pick an appearance,
 * but the Lab authors and shares palettes through routes the construction hosts do
 * not serve, so there the drawer is withheld.
 */
export function AppearanceControls({
  className,
  allowThemeLab = true,
}: {
  className?: string;
  allowThemeLab?: boolean;
}) {
  const { isVisualStyleLocked, isSurfaceLocked, isAccentLocked } = useTheme();
  const hasThemeLab = allowThemeLab && SITE_FLAVOR_CONFIG.flavor === "dosewiki";

  return (
    <AppearanceCog
      className={className}
      showVisualStyle={!isVisualStyleLocked}
      showColorScheme={SITE_FLAVOR_CONFIG.showColorSchemeToggle}
      showSurface={!isSurfaceLocked}
      showAccent={!isAccentLocked}
      showMoreSettings={hasThemeLab}
    />
  );
}
