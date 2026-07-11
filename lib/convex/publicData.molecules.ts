import "server-only";

import { cache } from "react";
import { api } from "../../convex/_generated/api";
import { getServerConvexReadClient } from "./serverClient";

/** Map of molecule slug → published `updatedAt`, used to cache-bust image URLs. */
export type MoleculeOverrideIndex = Map<string, string>;

/**
 * The canonical Convex depiction index, cached per render. It resolves to an
 * empty map if Convex is unavailable, so lookup failure keeps legacy static
 * assets instead of breaking public pages.
 */
export const getMoleculeOverrideIndex = cache(async (): Promise<MoleculeOverrideIndex> => {
  try {
    const rows = await getServerConvexReadClient().query(api.moleculeOverrides.listSlugs, {});
    return new Map(rows.map((row) => [row.slug, row.updatedAt]));
  } catch {
    return new Map();
  }
});

/** One slug's published version; null preserves the static fallback on misses/errors. */
export const getMoleculeUpdatedAt = cache(async (slug: string): Promise<string | null> => {
  try {
    const row = await getServerConvexReadClient().query(
      api.moleculeOverrides.getMetadataBySlug,
      { slug },
    );
    return row?.updatedAt ?? null;
  } catch {
    return null;
  }
});

/** The public image-route URL for a slug's override, busted by `updatedAt`. */
export function moleculeOverrideImageUrl(slug: string, updatedAt: string): string {
  return `/api/molecules/${slug}?v=${encodeURIComponent(updatedAt)}`;
}

/** The public image-route URL for a chemical class override, busted by `updatedAt`. */
export function classStructureOverrideImageUrl(key: string, updatedAt: string): string {
  return `/api/molecules/classes/${key}?v=${encodeURIComponent(updatedAt)}`;
}
