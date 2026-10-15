import "server-only";

import { publicDataCache, PUBLIC_DATA_CACHE_REVALIDATE_SECONDS } from "./publicData.cache";
import { publicSubstanceGalleryTag, PUBLIC_DATA_CACHE_TAGS } from "./publicData.cacheTags";
import { cache } from "react";
import { contributorMatchNames, findContributorProfileByAuthorName } from "../contributorProfileIdentity";
import { getPublicDataReadAdapter } from "./publicData.reads";
import type { NormalizedUserProfile } from "../../src/data/userProfiles";
import {
  isPublishableReplication,
  type GalleryReplication,
  type PublicGalleryReplicationPreview,
  type PublicReplicationArtistTaxonomy,
  type ReplicationWithUrl,
} from "../../src/types/replications";
import { getPublicReplicationBySlug, getPublicReplications } from "./publicData.effects";
import { getPublicReplicationsBySlugs } from "./publicData.replicationDetails";
import { getPublicContributorIdentities } from "./publicData.contributors";
import {
  includeDirectlyAssociatedRows,
  matchSubstanceGalleryReplications,
  mergeCuratedGallery,
  substanceGalleryTargetOf,
  type PublicSubstanceGallery,
  type SubstanceGalleryItem,
  type SubstanceGalleryMatchProvenance,
  type SubstanceGalleryMatchableRow,
} from "../../src/data/substanceReplicationGallery";
import { getPublicSubstanceBySlug } from "./publicData.substances";

export type { PublicSubstanceGallery, SubstanceGalleryItem, SubstanceGalleryMatchProvenance };

const PUBLIC_MATCHABLE_CORPUS_MAX_PAGES = 512;
const PUBLIC_MATCHABLE_CORPUS_MAX_ROWS = 20_000;

const getPublicReplicationArtistTaxonomyBatch = cache(publicDataCache(async (
  keys: string[],
) => getPublicDataReadAdapter().getPublicReplicationArtistsByKeys(keys), [
  "data-public-replication-artist-taxonomy-batch-v1",
], {
  revalidate: PUBLIC_DATA_CACHE_REVALIDATE_SECONDS,
  awaitRefresh: true,
  tags: [PUBLIC_DATA_CACHE_TAGS.all, PUBLIC_DATA_CACHE_TAGS.replications],
}));

export const getReplicationsByContributor = cache(publicDataCache(async (
  profile: NormalizedUserProfile,
): Promise<ReplicationWithUrl[]> => {
  const artistNames = contributorMatchNames(profile);
  if (artistNames.length === 0) {
    return [];
  }

  return (await getPublicDataReadAdapter().getPublicReplicationsByArtistNames(artistNames)).filter(
    isPublishableReplication,
  );
}, ["data-public-replications-by-contributor"], {
  revalidate: PUBLIC_DATA_CACHE_REVALIDATE_SECONDS,
  tags: [
    PUBLIC_DATA_CACHE_TAGS.all,
    PUBLIC_DATA_CACHE_TAGS.replications,
    PUBLIC_DATA_CACHE_TAGS.contributors,
  ],
}));

const getPublicMatchableReplicationCorpusPage = cache(publicDataCache(async (
  cursor?: string,
) => {
  return await getPublicDataReadAdapter().getPublicMatchableReplicationPage(cursor);
}, ["data-public-matchable-replication-corpus-page-v1"], {
  revalidate: PUBLIC_DATA_CACHE_REVALIDATE_SECONDS,
  awaitRefresh: true,
  tags: [PUBLIC_DATA_CACHE_TAGS.all, PUBLIC_DATA_CACHE_TAGS.replications],
}));

const getPublicMatchableReplicationCorpus = cache(async (): Promise<SubstanceGalleryMatchableRow[]> => {
  const rows: SubstanceGalleryMatchableRow[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | undefined;

  for (
    let pageNumber = 1;
    pageNumber <= PUBLIC_MATCHABLE_CORPUS_MAX_PAGES;
    pageNumber += 1
  ) {
    const page = await getPublicMatchableReplicationCorpusPage(cursor);
    rows.push(...page.items);
    if (rows.length > PUBLIC_MATCHABLE_CORPUS_MAX_ROWS) {
      throw new Error(
        `Public matchable replication corpus exceeded maxRows (${PUBLIC_MATCHABLE_CORPUS_MAX_ROWS}).`,
      );
    }
    if (page.isDone) {
      return rows;
    }
    if (
      typeof page.cursor !== "string" ||
      page.cursor.length === 0 ||
      seenCursors.has(page.cursor)
    ) {
      throw new Error("Public matchable replication corpus pagination did not advance.");
    }
    seenCursors.add(page.cursor);
    cursor = page.cursor;
  }

  throw new Error(
    `Public matchable replication corpus exceeded maxPages (${PUBLIC_MATCHABLE_CORPUS_MAX_PAGES}).`,
  );
});

const getPublicSubstanceGalleryCuration = cache(publicDataCache(async (
  substanceSlug: string,
) => {
  return await getPublicDataReadAdapter().getPublicSubstanceGalleryCuration(substanceSlug);
}, ["data-public-substance-gallery-curation-v2"], {
  revalidate: PUBLIC_DATA_CACHE_REVALIDATE_SECONDS,
  tags: (slug) => [
    PUBLIC_DATA_CACHE_TAGS.all,
    PUBLIC_DATA_CACHE_TAGS.replications,
    PUBLIC_DATA_CACHE_TAGS.substances,
    publicSubstanceGalleryTag(slug),
  ],
}));

const readPublicSubstanceGalleryFastPath = cache(publicDataCache(async (
  substanceSlug: string,
): Promise<PublicSubstanceGallery | null> => {
  return await getPublicDataReadAdapter().getPublicSubstanceGallery(substanceSlug);
}, ["data-public-substance-gallery-v2"], {
  revalidate: PUBLIC_DATA_CACHE_REVALIDATE_SECONDS,
  tags: (slug) => [
    PUBLIC_DATA_CACHE_TAGS.all,
    PUBLIC_DATA_CACHE_TAGS.replications,
    PUBLIC_DATA_CACHE_TAGS.substances,
    publicSubstanceGalleryTag(slug),
  ],
}));

const assemblePublicSubstanceGalleryFromCorpus = cache(async (
  substance: NonNullable<Awaited<ReturnType<typeof getPublicSubstanceBySlug>>>,
): Promise<PublicSubstanceGallery> => {
  const [corpus, curation] = await Promise.all([
    getPublicMatchableReplicationCorpus(),
    substance.slug ? getPublicSubstanceGalleryCuration(substance.slug) : null,
  ]);

  const target = substanceGalleryTargetOf(substance);
  const matches = target
    ? matchSubstanceGalleryReplications(corpus, target).matches
    : [];
  const available = includeDirectlyAssociatedRows(corpus, matches, curation);
  const merged = mergeCuratedGallery(available, curation);
  if (merged.length === 0) {
    return { items: [] };
  }

  const resolved = await getPublicReplicationsBySlugs(merged.map(({ row }) => row.slug));
  const resolvedBySlug = new Map(resolved.map((row) => [row.slug, row]));
  const items: SubstanceGalleryItem[] = [];
  for (const { row, provenance } of merged) {
    const replication = resolvedBySlug.get(row.slug);
    if (replication && isPublishableReplication(replication)) {
      items.push({ replication, provenance });
    }
  }
  return { items, carouselOrder: curation?.carousel_order ?? [] };
});

let hasWarnedAboutSubstanceGalleryFastPath = false;

export const getPublicReplicationsForSubstance = cache(async (
  substanceSlug: string,
): Promise<PublicSubstanceGallery> => {
  const substance = await getPublicSubstanceBySlug(substanceSlug);
  if (!substance) {
    return { items: [] };
  }

  try {
    const gallery = await readPublicSubstanceGalleryFastPath(substanceSlug);
    if (gallery) {
      return {
        carouselOrder: gallery.carouselOrder,
        items: gallery.items.filter((item) => isPublishableReplication(item.replication)),
      };
    }
  } catch (error) {
    if (!hasWarnedAboutSubstanceGalleryFastPath) {
      hasWarnedAboutSubstanceGalleryFastPath = true;
      console.warn(
        `[publicData] substanceGalleries:getPublicGalleryBySubstance failed for "${substanceSlug}"; falling back to the paged matchable corpus.`,
        error,
      );
    }
  }

  return await assemblePublicSubstanceGalleryFromCorpus(substance);
});

export const getPublicFeaturedReplicationSlugs = cache(publicDataCache(async (): Promise<string[] | null> => {
  return await getPublicDataReadAdapter().getPublicFeaturedReplicationSlugs();
}, ["data-public-featured-replications"], {
  revalidate: PUBLIC_DATA_CACHE_REVALIDATE_SECONDS,
  tags: [PUBLIC_DATA_CACHE_TAGS.all, PUBLIC_DATA_CACHE_TAGS.replications, PUBLIC_DATA_CACHE_TAGS.featuredReplications],
}));

export function dropGalleryExcludedArtistWorks<T extends { artist: string }>(
  items: readonly T[],
  profiles: readonly NormalizedUserProfile[],
): T[] {
  if (!profiles.some((profile) => profile.exclude_from_gallery === true)) {
    return [...items];
  }

  const hiddenByArtist = new Map<string, boolean>();

  return items.filter((item) => {
    let hidden = hiddenByArtist.get(item.artist);
    if (hidden === undefined) {
      hidden = findContributorProfileByAuthorName(profiles, item.artist)?.exclude_from_gallery === true;
      hiddenByArtist.set(item.artist, hidden);
    }
    return !hidden;
  });
}

export function projectPublicGalleryReplicationPreview(
  replication: GalleryReplication,
): PublicGalleryReplicationPreview {
  return {
    _id: replication._id,
    slug: replication.slug,
    title: replication.title,
    artist: replication.artist,
    artist_url: replication.artist_url ?? undefined,
    type: replication.type,
    format: replication.format,
    effect_slug: replication.effect_slug ?? undefined,
    effect_tags: replication.effect_tags ?? undefined,
    viewing_mode_tags: replication.viewing_mode_tags ?? undefined,
    title_drugs: replication.title_drugs?.map(({ slug, name }) => ({
      slug,
      name,
    })),
    drug_classes: replication.drug_classes ?? undefined,
    content_family: replication.content_family ?? undefined,
    artist_type_tags: replication.artist_type_tags ?? undefined,
    url: replication.url,
    thumbnail_url: replication.thumbnail_url ?? undefined,
    preview_url: replication.preview_url ?? undefined,
    motion_url: replication.motion_url ?? undefined,
    motion_poster_url: replication.motion_poster_url ?? undefined,
    width: replication.width ?? undefined,
    height: replication.height ?? undefined,
    duration: replication.duration ?? undefined,
    has_audio: replication.has_audio ?? undefined,
    created_at: replication.created_at,
    date_info: replication.date_info
      ? { value: replication.date_info.value, kind: replication.date_info.kind }
      : undefined,
    effect_order_index: replication.effect_order_index ?? undefined,
  };
}

export const getPublicGalleryReplications = cache(async (): Promise<PublicGalleryReplicationPreview[]> =>
  getPublicDataReadAdapter().getPublicGalleryMembershipRows(),
);

const getPublicArtistCreditRecords = cache(publicDataCache(
  async () => getPublicDataReadAdapter().getPublicArtistCreditRows(),
  ["data-public-artist-credit-rows"],
  {
    revalidate: PUBLIC_DATA_CACHE_REVALIDATE_SECONDS,
    tags: [PUBLIC_DATA_CACHE_TAGS.all, PUBLIC_DATA_CACHE_TAGS.replications],
  },
));

export const getPublicArtistCreditRows = cache(async () => {
  const [rows, profiles] = await Promise.all([
    getPublicArtistCreditRecords(), getPublicContributorIdentities(),
  ]);
  return dropGalleryExcludedArtistWorks(rows, profiles);
});

export const getPublicGalleryReplicationBySlug = cache(async (
  slug: string,
): Promise<PublicGalleryReplicationPreview | null> => {
  const [replication, profiles] = await Promise.all([
    getPublicReplicationBySlug(slug),
    getPublicContributorIdentities(),
  ]);
  if (
    !replication ||
    !isPublishableReplication(replication) ||
    dropGalleryExcludedArtistWorks([replication], profiles).length === 0
  ) {
    return null;
  }

  const artistKey = replication.artist.trim().toLowerCase();
  const [artist] = artistKey
    ? await getPublicReplicationArtistTaxonomyBatch([artistKey])
    : [];
  return projectPublicGalleryReplicationPreview({
    ...replication,
    ...(artist ? { artist_type_tags: artist.artist_type_tags } : {}),
  });
});

export const getPublicGalleryReplicationsBySlugs = cache(async (
  slugs: string[],
): Promise<PublicGalleryReplicationPreview[]> => {
  if (slugs.length > 65) throw new Error("A gallery page accepts at most 65 works.");
  const [replications, profiles] = await Promise.all([
    getPublicReplicationsBySlugs(slugs),
    getPublicContributorIdentities(),
  ]);
  const visible = dropGalleryExcludedArtistWorks(replications.filter(isPublishableReplication), profiles);
  const artistKeys = [...new Set(visible.map((row) => row.artist.trim().toLowerCase()).filter(Boolean))];
  const artists = artistKeys.length ? await getPublicReplicationArtistTaxonomyBatch(artistKeys) : [];
  const artistByKey = new Map(artists.map((artist) => [artist.key, artist]));
  const bySlug = new Map(visible.map((row) => [row.slug, row]));
  return slugs.flatMap((slug) => {
    const row = bySlug.get(slug);
    if (!row) return [];
    const artist = artistByKey.get(row.artist.trim().toLowerCase());
    return [projectPublicGalleryReplicationPreview({
      ...row,
      ...(artist ? { artist_type_tags: artist.artist_type_tags } : {}),
    })];
  });
});

