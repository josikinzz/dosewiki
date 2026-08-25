/**
 * URL builders for the canonical Convex molecule depictions, kept free of
 * server-only imports so client surfaces (e.g. the review workbench) can
 * version the same public image routes the server view models use.
 */
import type { ColorScheme } from "@/theme";

import type { MoleculeColorway } from "./moleculePalette";

/**
 * Resolve canonical molecule URLs onto the byte colourway for one appearance.
 *
 * Depictions follow only the colour scheme: light gets the light textbook
 * element colours, dark the dark ones, identically in every visual style.
 * The old accent-tinted "brand" bytes are no longer served on-site (they
 * remain in the downloadable molecule pack). Colourways are applied by the
 * public image routes as a query parameter at serve time.
 */
export function moleculeImageUrlForAppearance(
  source: string,
  colorScheme: ColorScheme,
): string {
  if (!source.startsWith("/api/molecules/")) {
    return source;
  }

  const colorway: MoleculeColorway = `pro-${colorScheme}`;
  return `${source}${source.includes("?") ? "&" : "?"}colorway=${colorway}`;
}

/** The public image-route URL for a slug's override, busted by `updatedAt`. */
export function moleculeOverrideImageUrl(slug: string, updatedAt: string): string {
  return `/api/molecules/${slug}?v=${encodeURIComponent(updatedAt)}`;
}

/** Square substance OG card edge, kept in sync with `/api/og/molecule/[slug]`. */
export const MOLECULE_SOCIAL_CARD_SIZE = 1200;

/**
 * Increment when renderer changes must invalidate already-frozen CDN and
 * social-crawler copies without mutating the canonical molecule row.
 */
const MOLECULE_SOCIAL_CARD_RENDER_VERSION = "2";

/** The square molecule OG-card URL, busted by molecule and renderer revisions. */
export function moleculeSocialCardUrl(slug: string, updatedAt: string): string {
  const version = `${updatedAt}-${MOLECULE_SOCIAL_CARD_RENDER_VERSION}`;
  return `/api/og/molecule/${slug}?v=${encodeURIComponent(version)}`;
}

/** The public image-route URL for a chemical class override, busted by `updatedAt`. */
export function classStructureOverrideImageUrl(key: string, updatedAt: string): string {
  return `/api/molecules/classes/${key}?v=${encodeURIComponent(updatedAt)}`;
}
