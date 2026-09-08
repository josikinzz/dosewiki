import "server-only";

import { cache } from "react";
import { api } from "../../convex/_generated/api";
import {
  PUBLIC_CONVEX_CACHE_REVALIDATE_SECONDS,
  PUBLIC_CONVEX_CACHE_TAGS,
  publicDataCache,
  publicMoleculeTag,
} from "./publicData.cache";
import { getServerConvexReadClient } from "./serverClient";

/** Map of molecule slug → published `updatedAt`, used to cache-bust image URLs. */
export type MoleculeOverrideIndex = Map<string, string>;

// The persisted leaves hold JSON rows, never the assembled Map: Next stores
// values as JSON, and a Map round-trips to an empty object. Transport failures
// must propagate so neither the data cache nor rendered pages publish absence.
const readMoleculeOverrideIndex = publicDataCache(
  async () => await getServerConvexReadClient().query(api.moleculeOverrides.listSlugs, {}),
  ["convex-public-molecule-override-index"],
  {
    revalidate: PUBLIC_CONVEX_CACHE_REVALIDATE_SECONDS,
    tags: [PUBLIC_CONVEX_CACHE_TAGS.all, PUBLIC_CONVEX_CACHE_TAGS.molecules],
  },
);

const readMoleculeUpdatedAt = publicDataCache(
  async (slug: string): Promise<string | null> => {
    const row = await getServerConvexReadClient().query(
      api.moleculeOverrides.getMetadataBySlug,
      { slug },
    );
    return row?.updatedAt ?? null;
  },
  ["convex-public-molecule-updated-at"],
  {
    revalidate: PUBLIC_CONVEX_CACHE_REVALIDATE_SECONDS,
    tags: (slug) => [
      PUBLIC_CONVEX_CACHE_TAGS.all,
      PUBLIC_CONVEX_CACHE_TAGS.molecules,
      publicMoleculeTag(slug),
    ],
  },
);

/**
 * The canonical Convex depiction index, cached per render on top of the
 * persistent leaf. Only a successful empty result means no depictions exist.
 */
export const getMoleculeOverrideIndex = cache(async (): Promise<MoleculeOverrideIndex> => {
  const rows = await readMoleculeOverrideIndex();
  return new Map(rows.map((row) => [row.slug, row.updatedAt]));
});

/** One slug's published version; null means the article has no depiction. */
export const getMoleculeUpdatedAt = cache(readMoleculeUpdatedAt);

export type PublicMolecule = { svg: string; updatedAt: string };

/**
 * One published depiction and its saved revision, read atomically for the image
 * endpoints. Class Markush drawings share this leaf under `class:<key>`.
 * Transport failures propagate rather than becoming a cached missing depiction.
 */
export const getPublicMolecule = cache(publicDataCache(
  async (slug: string): Promise<PublicMolecule | null> => {
    const override = await getServerConvexReadClient().query(
      api.moleculeOverrides.getBySlug,
      { slug },
    );
    return override ? { svg: override.svg, updatedAt: override.updatedAt } : null;
  },
  ["convex-public-molecule"],
  {
    revalidate: PUBLIC_CONVEX_CACHE_REVALIDATE_SECONDS,
    tags: (slug) => [
      PUBLIC_CONVEX_CACHE_TAGS.all,
      PUBLIC_CONVEX_CACHE_TAGS.molecules,
      publicMoleculeTag(slug),
    ],
  },
));

export {
  classStructureOverrideImageUrl,
  moleculeOverrideImageUrl,
} from "../../src/data/mappings/moleculeOverrideUrl";
