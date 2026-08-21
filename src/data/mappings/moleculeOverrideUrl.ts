/**
 * URL builders for the canonical Convex molecule depictions, kept free of
 * server-only imports so client surfaces (e.g. the review workbench) can
 * version the same public image routes the server view models use.
 */
import type { ColorScheme, VisualStyle } from "@/theme";
import { DEFAULT_ACCENT_LEVEL } from "@/theme/appearanceChroma";

import type { MoleculeColorway } from "./moleculePalette";

function colorwayForAppearance(
  visualStyle: VisualStyle,
  colorScheme: ColorScheme,
  accentChroma: number | null,
): MoleculeColorway {
  if (visualStyle === "fun") {
    return (accentChroma ?? DEFAULT_ACCENT_LEVEL) === 0 ? "pro-dark" : "brand";
  }

  return `pro-${colorScheme}`;
}

/**
 * Resolve canonical molecule URLs onto the byte colourway for one appearance.
 *
 * `accentChroma` is the effective accent saturation level (0..1), or `null` for the site
 * default. A fully desaturated accent (level 0) deliberately borrows Pro Dark's chemically
 * differentiated atom colours instead of flattening every atom and bond into grey; every
 * other Fun level retains the authored brand colourway. Depictions are served by the
 * public image routes, which apply the colourway as a query parameter at serve time.
 */
export function moleculeImageUrlForAppearance(
  source: string,
  visualStyle: VisualStyle,
  colorScheme: ColorScheme,
  accentChroma: number | null,
): string {
  const colorway: MoleculeColorway = colorwayForAppearance(visualStyle, colorScheme, accentChroma);
  if (colorway === "brand" || !source.startsWith("/api/molecules/")) {
    return source;
  }

  return `${source}${source.includes("?") ? "&" : "?"}colorway=${colorway}`;
}

/** The public image-route URL for a slug's override, busted by `updatedAt`. */
export function moleculeOverrideImageUrl(slug: string, updatedAt: string): string {
  return `/api/molecules/${slug}?v=${encodeURIComponent(updatedAt)}`;
}

/** The public image-route URL for a chemical class override, busted by `updatedAt`. */
export function classStructureOverrideImageUrl(key: string, updatedAt: string): string {
  return `/api/molecules/classes/${key}?v=${encodeURIComponent(updatedAt)}`;
}
