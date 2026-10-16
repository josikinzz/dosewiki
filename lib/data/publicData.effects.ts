import "server-only";

import { publicDataCache, PUBLIC_DATA_CACHE_REVALIDATE_SECONDS } from "./publicData.cache";
import { publicEffectTag, PUBLIC_DATA_CACHE_TAGS } from "./publicData.cacheTags";
import { cache } from "react";
import { contributorMatchNames, profileMatchesName } from "../contributorProfileIdentity";
import type { NormalizedUserProfile } from "../../src/data/userProfiles";
import type { ContributorEffectCredit } from "../../src/types/effectCredits";
import { isPublishableReplication, depictsEffect, type GalleryReplication, type ReplicationWithUrl } from "../../src/types/replications";
import { getPublicDataReadAdapter } from "./publicData.reads";
import { getPublicReplicationsBySlugs } from "./publicData.replicationDetails";
import {
  type PublicEffectArticle,
  type PublicEffectPreview,
  type PublicEffectIndexEntry,
  type SubjectiveEffectDetailRecord,
} from "./publicData.shared";

const PUBLIC_REPLICATION_PAGE_LIMIT = 64;
const PUBLIC_REPLICATION_MAX_PAGES = 512;
const PUBLIC_REPLICATION_MAX_ROWS = 20_000;


export const getPublicEffects = cache(publicDataCache(async (): Promise<PublicEffectPreview[]> => {
  return await getPublicDataReadAdapter().getPublicEffects();
}, ["data-public-effect-previews"], {
  revalidate: PUBLIC_DATA_CACHE_REVALIDATE_SECONDS,
  tags: [PUBLIC_DATA_CACHE_TAGS.all, PUBLIC_DATA_CACHE_TAGS.effects],
}));

export const getPublicEffectIndex = cache(publicDataCache(async (): Promise<PublicEffectIndexEntry[]> => {
  return await getPublicDataReadAdapter().getPublicEffectIndex();
}, ["data-public-effect-index"], {
  revalidate: PUBLIC_DATA_CACHE_REVALIDATE_SECONDS,
  tags: [PUBLIC_DATA_CACHE_TAGS.all, PUBLIC_DATA_CACHE_TAGS.effects],
}));

export const getFeaturedEffects = cache(async (limit = 8) => {
  return (await getPublicEffects()).slice(0, limit);
});

export const getPublicEffectBySlug = cache(publicDataCache(async (slug: string): Promise<SubjectiveEffectDetailRecord | null> => {
  return await getPublicDataReadAdapter().getPublicEffectBySlug(slug);
}, ["data-public-effect-by-slug"], {
  revalidate: PUBLIC_DATA_CACHE_REVALIDATE_SECONDS,
  tags: (slug) => [PUBLIC_DATA_CACHE_TAGS.all, PUBLIC_DATA_CACHE_TAGS.effects, publicEffectTag(slug)],
}));

export const getPublicEffectArticles = cache(publicDataCache(async (): Promise<PublicEffectArticle[]> => {
  return await getPublicDataReadAdapter().getPublicEffectArticles();
}, ["data-public-effect-articles"], {
  revalidate: PUBLIC_DATA_CACHE_REVALIDATE_SECONDS,
  tags: [PUBLIC_DATA_CACHE_TAGS.all, PUBLIC_DATA_CACHE_TAGS.effects],
}));

export const getPublicEffectSlugs = cache(publicDataCache(async (): Promise<string[]> => {
  return getPublicDataReadAdapter().getPublicEffectSlugs();
}, ["data-public-effect-slugs"], {
  revalidate: PUBLIC_DATA_CACHE_REVALIDATE_SECONDS,
  tags: [PUBLIC_DATA_CACHE_TAGS.all, PUBLIC_DATA_CACHE_TAGS.effects],
}));

export const getPublicEffectSummariesBySlugs = cache(publicDataCache(
  async (slugs: string[]) => getPublicDataReadAdapter().getPublicEffectSummariesBySlugs(slugs),
  ["data-public-effect-summaries-by-slugs"],
  { revalidate: PUBLIC_DATA_CACHE_REVALIDATE_SECONDS, tags: [PUBLIC_DATA_CACHE_TAGS.all, PUBLIC_DATA_CACHE_TAGS.effects] },
));

export const getPublicEffectAudioIndex = cache(publicDataCache(
  async () => getPublicDataReadAdapter().getPublicEffectAudioIndex(),
  ["data-public-effect-audio-index"],
  { revalidate: PUBLIC_DATA_CACHE_REVALIDATE_SECONDS, tags: [PUBLIC_DATA_CACHE_TAGS.all, PUBLIC_DATA_CACHE_TAGS.effects] },
));

export const getPublicEffectContributorCredits = cache(publicDataCache(
  async (names?: string[]) => getPublicDataReadAdapter().getPublicEffectContributorCredits(names),
  ["data-public-effect-contributor-credits"],
  { revalidate: PUBLIC_DATA_CACHE_REVALIDATE_SECONDS, tags: [PUBLIC_DATA_CACHE_TAGS.all, PUBLIC_DATA_CACHE_TAGS.effects] },
));

export const getEffectsByCategory = cache(publicDataCache(async (category: string): Promise<PublicEffectPreview[]> => {
  return await getPublicDataReadAdapter().getPublicEffectsByCategory(category);
}, ["data-public-effects-by-category"], {
  revalidate: PUBLIC_DATA_CACHE_REVALIDATE_SECONDS,
  tags: [PUBLIC_DATA_CACHE_TAGS.all, PUBLIC_DATA_CACHE_TAGS.effects],
}));

export const getEffectArticlesByContributor = cache(async (
  profile: NormalizedUserProfile,
): Promise<ContributorEffectCredit[]> => {
  if (contributorMatchNames(profile).length === 0) {
    return [];
  }

  const effects = await getPublicEffectContributorCredits(contributorMatchNames(profile));

  return effects
    .filter((effect) =>
      (effect.contributors ?? []).some((contributor) => profileMatchesName(profile, contributor)),
    )
    .map((effect) => ({ slug: effect.slug, name: effect.name }))
    .sort((left, right) => left.name.localeCompare(right.name));
});

export const getPublicReplicationsByEffect = cache(async (
  effectSlug: string,
): Promise<ReplicationWithUrl[]> => {
  const slugs = new Set<string>();
  for (const row of await readPublicReplicationCorpus(effectSlug)) {
    if (depictsEffect(row, effectSlug)) slugs.add(row.slug);
  }
  const details = await getPublicReplicationsBySlugs([...slugs]);
  const bySlug = new Map(details.map((row) => [row.slug, row]));
  const collection: ReplicationWithUrl[] = [];
  for (const slug of slugs) {
    const row = bySlug.get(slug);
    if (row && depictsEffect(row, effectSlug)) collection.push(row);
  }
  return collection;
});

const getPublicReplicationCorpusPage = cache(publicDataCache(async (
  cursor?: string,
  effectSlug?: string,
) => {
  return await getPublicDataReadAdapter().getPublicGalleryReplicationPage(
    cursor,
    PUBLIC_REPLICATION_PAGE_LIMIT,
    effectSlug,
  );
}, ["data-public-replication-corpus-page-v1"], {
  revalidate: PUBLIC_DATA_CACHE_REVALIDATE_SECONDS,
  awaitRefresh: true,
  tags: [PUBLIC_DATA_CACHE_TAGS.all, PUBLIC_DATA_CACHE_TAGS.replications],
}));

async function readPublicReplicationCorpus(effectSlug?: string): Promise<GalleryReplication[]> {
  const items: GalleryReplication[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | undefined;

  for (
    let pageNumber = 1;
    pageNumber <= PUBLIC_REPLICATION_MAX_PAGES;
    pageNumber += 1
  ) {
    const page = await getPublicReplicationCorpusPage(cursor, effectSlug);
    items.push(...(page.items as GalleryReplication[]));
    if (items.length > PUBLIC_REPLICATION_MAX_ROWS) {
      throw new Error(
        `Public replication corpus exceeded maxRows (${PUBLIC_REPLICATION_MAX_ROWS}).`,
      );
    }
    if (page.isDone) {
      return items.filter(isPublishableReplication);
    }
    if (
      typeof page.cursor !== "string" ||
      page.cursor.length === 0 ||
      seenCursors.has(page.cursor)
    ) {
      throw new Error("Public replication corpus pagination did not advance.");
    }
    seenCursors.add(page.cursor);
    cursor = page.cursor;
  }

  throw new Error(
    `Public replication corpus exceeded maxPages (${PUBLIC_REPLICATION_MAX_PAGES}).`,
  );
}

export const getPublicReplications = cache(async (): Promise<GalleryReplication[]> =>
  readPublicReplicationCorpus(),
);

export const getPublicReplicationBySlug = cache(publicDataCache(async (slug: string): Promise<ReplicationWithUrl | null> => {
  return await getPublicDataReadAdapter().getPublicReplicationBySlug(slug);
}, ["data-public-replication-by-slug"], {
  revalidate: PUBLIC_DATA_CACHE_REVALIDATE_SECONDS,
  tags: [PUBLIC_DATA_CACHE_TAGS.all, PUBLIC_DATA_CACHE_TAGS.replications],
}));
