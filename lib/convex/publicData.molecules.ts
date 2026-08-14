import "server-only";

import { cache } from "react";
import { api } from "../../convex/_generated/api";
import { getServerConvexReadClient } from "./serverClient";

/** Map of molecule slug → published `updatedAt`, used to cache-bust image URLs. */
export type MoleculeOverrideIndex = Map<string, string>;

/**
 * The canonical Convex depiction index, cached per render. It resolves to an
 * empty map if Convex is unavailable; substances then render without a
 * depiction (chemical-class Markush skeletons keep their static files).
 */
export const getMoleculeOverrideIndex = cache(async (): Promise<MoleculeOverrideIndex> => {
  try {
    const rows = await getServerConvexReadClient().query(api.moleculeOverrides.listSlugs, {});
    return new Map(rows.map((row) => [row.slug, row.updatedAt]));
  } catch {
    return new Map();
  }
});

/** One slug's published version; null means the article has no depiction. */
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

export {
  classStructureOverrideImageUrl,
  moleculeOverrideImageUrl,
} from "../../src/data/mappings/moleculeOverrideUrl";
