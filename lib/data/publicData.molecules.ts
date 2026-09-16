import "server-only";

import { cache } from "react";
import {
  PUBLIC_DATA_CACHE_REVALIDATE_SECONDS,
  PUBLIC_DATA_CACHE_TAGS,
  publicDataCache,
  publicMoleculeTag,
} from "./publicData.cache";
import { getPublicDataReadAdapter } from "./publicData.reads";
import type { PublicMolecule } from "./publicData.shared";

export type { PublicMolecule } from "./publicData.shared";

/** Map of molecule slug → published `updatedAt`, used to cache-bust image URLs. */
export type MoleculeOverrideIndex = Map<string, string>;

// The persisted leaves hold JSON rows, never the assembled Map: Next stores
// values as JSON, and a Map round-trips to an empty object. Transport failures
// must propagate so neither the data cache nor rendered pages publish absence.
const readMoleculeOverrideIndex = publicDataCache(
  async () => await getPublicDataReadAdapter().getPublicMoleculeOverrideSummaries(),
  ["data-public-molecule-override-index"],
  {
    revalidate: PUBLIC_DATA_CACHE_REVALIDATE_SECONDS,
    tags: [PUBLIC_DATA_CACHE_TAGS.all, PUBLIC_DATA_CACHE_TAGS.molecules],
  },
);

const readMoleculeUpdatedAt = publicDataCache(
  async (slug: string): Promise<string | null> =>
    await getPublicDataReadAdapter().getPublicMoleculeUpdatedAt(slug),
  ["data-public-molecule-updated-at"],
  {
    revalidate: PUBLIC_DATA_CACHE_REVALIDATE_SECONDS,
    tags: (slug) => [
      PUBLIC_DATA_CACHE_TAGS.all,
      PUBLIC_DATA_CACHE_TAGS.molecules,
      publicMoleculeTag(slug),
    ],
  },
);

/**
 * The canonical depiction index, cached per render on top of the persistent
 * leaf. Only a successful empty result means no depictions exist.
 */
export const getMoleculeOverrideIndex = cache(async (): Promise<MoleculeOverrideIndex> => {
  const rows = await readMoleculeOverrideIndex();
  return new Map(rows.map((row) => [row.slug, row.updatedAt]));
});

/** One slug's published version; null means the article has no depiction. */
export const getMoleculeUpdatedAt = cache(readMoleculeUpdatedAt);

/**
 * One published depiction and its saved revision, read atomically for the image
 * endpoints. Class Markush drawings share this leaf under `class:<key>`.
 * Transport failures propagate rather than becoming a cached missing depiction.
 */
export const getPublicMolecule = cache(publicDataCache(
  async (slug: string): Promise<PublicMolecule | null> =>
    await getPublicDataReadAdapter().getPublicMoleculeBySlug(slug),
  ["data-public-molecule"],
  {
    revalidate: PUBLIC_DATA_CACHE_REVALIDATE_SECONDS,
    tags: (slug) => [
      PUBLIC_DATA_CACHE_TAGS.all,
      PUBLIC_DATA_CACHE_TAGS.molecules,
      publicMoleculeTag(slug),
    ],
  },
));

export {
  classStructureOverrideImageUrl,
  moleculeOverrideImageUrl,
} from "../../src/data/mappings/moleculeOverrideUrl";
