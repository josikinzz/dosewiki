import "server-only";

import { cache } from "react";
import { PUBLIC_DATA_CACHE_REVALIDATE_SECONDS, publicDataCache } from "./publicData.cache";
import { PUBLIC_DATA_CACHE_TAGS, publicMoleculeTag } from "./publicData.cacheTags";
import { getPublicDataReadAdapter } from "./publicData.reads";
import type { PublicMolecule } from "./publicData.shared";

export type { PublicMolecule } from "./publicData.shared";

export type MoleculeOverrideIndex = Map<string, string>;

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

export const getMoleculeOverrideIndex = cache(async (): Promise<MoleculeOverrideIndex> => {
  const rows = await readMoleculeOverrideIndex();
  return new Map(rows.map((row) => [row.slug, row.updatedAt]));
});

export const getMoleculeUpdatedAt = cache(readMoleculeUpdatedAt);

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
