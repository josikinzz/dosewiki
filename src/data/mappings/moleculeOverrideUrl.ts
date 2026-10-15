import type { ColorScheme } from "@/theme";

import type { MoleculeColorway } from "./moleculePalette";

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

export function moleculeOverrideImageUrl(slug: string, updatedAt: string): string {
  return `/api/molecules/${slug}?v=${encodeURIComponent(updatedAt)}`;
}

export function classStructureOverrideImageUrl(key: string, updatedAt: string): string {
  return `/api/molecules/classes/${key}?v=${encodeURIComponent(updatedAt)}`;
}
