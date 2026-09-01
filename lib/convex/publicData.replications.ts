import "server-only";

import { unstable_cache } from "next/cache";
import { cache } from "react";
import { contributorMatchNames, findContributorProfileByAuthorName } from "../contributorProfileIdentity";
import { PUBLIC_CONVEX_CACHE_REVALIDATE_SECONDS, PUBLIC_CONVEX_CACHE_TAGS } from "./publicData.cache";
import { getPublicDataReadAdapter } from "./publicData.reads";
import type { NormalizedUserProfile } from "../../src/data/userProfiles";
import {
  isPublishableReplication,
  type GalleryReplication,
  type PublicGalleryReplicationPreview,
  type ReplicationWithUrl,
} from "../../src/types/replications";
import { getPublicReplicationBySlug, getPublicReplications } from "./publicData.effects";
import { getPublicContributorProfiles } from "./publicData.contributors";
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

const PUBLIC_ARTIST_TAXONOMY_BATCH_SIZE = 175;

/** Same runaway-pagination guards as the gallery corpus in `publicData.effects`. */
const PUBLIC_MATCHABLE_CORPUS_MAX_PAGES = 512;
const PUBLIC_MATCHABLE_CORPUS_MAX_ROWS = 20_000;

function batches<T>(items: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

/**
 * Every replication credited to one contributor.
 *
 * The join is resolved inside Convex (`replications:getByArtistNames`) rather
 * than by filtering a whole-table read here, so only the contributor's own works
 * cross the wire and only they pay storage URL resolution.
 *
 * `contributorMatchNames` is the app's single definition of "this name is that
 * contributor" and is shared with the trip-report join, so a profile's works and
 * their reports can never disagree about which credits belong to them.
 *
 * A figure credited to the same person is not one of their works: the rail is
 * headed "Replications" and a diagram under it would also inflate the count
 * beside that heading and add a step to the permalink's artist walk. See the
 * note on `getPublicReplications` in `publicData.effects` for why the gate sits
 * on this side of Convex.
 */
export const getReplicationsByContributor = cache(unstable_cache(async (
  profile: NormalizedUserProfile,
): Promise<ReplicationWithUrl[]> => {
  const artistNames = contributorMatchNames(profile);
  if (artistNames.length === 0) {
    return [];
  }

  return (await getPublicDataReadAdapter().getPublicReplicationsByArtistNames(artistNames)).filter(
    isPublishableReplication,
  );
}, ["convex-public-replications-by-contributor"], {
  revalidate: PUBLIC_CONVEX_CACHE_REVALIDATE_SECONDS,
  tags: [
    PUBLIC_CONVEX_CACHE_TAGS.all,
    PUBLIC_CONVEX_CACHE_TAGS.replications,
    PUBLIC_CONVEX_CACHE_TAGS.contributors,
  ],
}));

/**
 * Cache bounded matchable-corpus pages, never the assembled corpus.
 *
 * Same doctrine as `getPublicReplicationCorpusPage` in `publicData.effects`:
 * an assembled aggregate would court Next's 2 MB data-cache entry limit and
 * turn every miss into a full re-drain. One 256-row slim page (nine
 * placement-policy fields, no URLs) stays a few tens of kilobytes, remains
 * individually cacheable, and is shared by every substance article; React's
 * request cache deduplicates the in-memory assembly per render.
 */
const getPublicMatchableReplicationCorpusPage = cache(unstable_cache(async (
  cursor?: string,
) => {
  return await getPublicDataReadAdapter().getPublicMatchableReplicationPage(cursor);
}, ["convex-public-matchable-replication-corpus-page-v1"], {
  revalidate: PUBLIC_CONVEX_CACHE_REVALIDATE_SECONDS,
  tags: [PUBLIC_CONVEX_CACHE_TAGS.all, PUBLIC_CONVEX_CACHE_TAGS.replications],
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

/**
 * The substance article's Replication Showcase: exact-drug and permitted
 * general-class placements, plus stored editorial ordering, direct
 * associations, and per-article exclusions. Placement and merge rules live in
 * `src/data/substanceReplicationGallery`, shared with the Convex curation
 * portal so public reads and editorial writes cannot drift.
 *
 * PERF: this used to drain a per-substance Convex scan of the whole
 * replications table (with per-row storage-URL resolution) for every article.
 * It is now assembled here from a shared cached slim corpus plus two small
 * reads and one indexed batch:
 *
 *   1. the matchable corpus pages above, cached once for all substances;
 *   2. the substance record (already cached by `getPublicSubstanceBySlug`;
 *      it retains `slug` and `classification.psychoactive_class`, which is
 *      everything `substanceGalleryTargetOf` reads);
 *   3. the stored curation row (`substanceGalleries:getBySubstance`);
 *   4. `replications:getBySlugs` URL-resolution for only the merged winners.
 *
 * A missing substance is an empty gallery — exactly the retired Convex
 * handler's semantics — and zero matches are an empty gallery, never an
 * error. Merged order is preserved; slugs the indexed resolution does not
 * return are dropped.
 *
 * The publishability gate is re-applied here like the other public replication
 * list reads: the matcher already refuses figures and audio, but this layer's
 * filter ships with the build that defines publishability rather than waiting
 * on a Convex deploy.
 *
 * Tagged `replications` and `substances`.
 */
export const getPublicReplicationsForSubstance = cache(unstable_cache(async (
  substanceSlug: string,
): Promise<PublicSubstanceGallery> => {
  const substance = await getPublicSubstanceBySlug(substanceSlug);
  if (!substance) {
    return { items: [] };
  }

  const [corpus, curation] = await Promise.all([
    getPublicMatchableReplicationCorpus(),
    getPublicDataReadAdapter().getPublicSubstanceGalleryCuration(substanceSlug),
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
  return { items };
}, ["convex-public-replications-for-substance"], {
  revalidate: PUBLIC_CONVEX_CACHE_REVALIDATE_SECONDS,
  tags: [
    PUBLIC_CONVEX_CACHE_TAGS.all,
    PUBLIC_CONVEX_CACHE_TAGS.replications,
    PUBLIC_CONVEX_CACHE_TAGS.substances,
  ],
}));

/**
 * The Effect Index homepage's curated featured replications, as stored slugs.
 *
 * `null` is not an empty carousel: it means this deployment carries no curated
 * document at all, and the caller falls back to the checked-in JSON list. An
 * empty array is a decision — an editor cleared the selection — and is returned
 * as such, so the two cases stay distinguishable at the call site rather than
 * collapsing into "no slugs".
 *
 * Tagged `replications` so saving a selection can revalidate it with the same
 * tag the rest of the replication surface already uses.
 */
export const getPublicFeaturedReplicationSlugs = cache(unstable_cache(async (): Promise<string[] | null> => {
  return await getPublicDataReadAdapter().getPublicFeaturedReplicationSlugs();
}, ["convex-public-featured-replications"], {
  revalidate: PUBLIC_CONVEX_CACHE_REVALIDATE_SECONDS,
  tags: [PUBLIC_CONVEX_CACHE_TAGS.all, PUBLIC_CONVEX_CACHE_TAGS.replications],
}));

/**
 * Drop every work whose credit line resolves to a contributor who opted out of
 * the /replications gallery (`contributorProfiles.exclude_from_gallery`).
 *
 * Resolution goes through `findContributorProfileByAuthorName` — the app's one
 * definition of "this name is that contributor" — against the *full* profile
 * list, so an alias shared with a non-excluded profile resolves exactly as it
 * does everywhere else. A credit that resolves to no profile is untouched.
 */
export function dropGalleryExcludedArtistWorks<T extends { artist: string }>(
  items: readonly T[],
  profiles: readonly NormalizedUserProfile[],
): T[] {
  if (!profiles.some((profile) => profile.exclude_from_gallery === true)) {
    return [...items];
  }

  // One resolution per distinct credit line, not per work.
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

/**
 * Project a raw gallery row down to the fields the gallery surfaces render —
 * same convention as `projectPublicSubstancePreview` (publicData.reads.ts).
 * Drops storage IDs, `_creationTime`, `file_size`, `role`, the seven
 * rights-metadata fields, and the studio-only classification fields
 * (`replication_status`, `viewing_mode`, `content_tags`,
 * `artist_primary_type`): none of them are read by the explorer, the focus
 * views, the swipe deck, or the sitemap's focus families, and the corpus is
 * serialized wholesale into the /replications RSC payload. The taxonomy
 * filters match on the tag arrays (`viewing_mode_tags`, `artist_type_tags`),
 * never the scalar summaries. `effect_tags` stays: the explorer's
 * depicted-effect filter matches on it alongside the owning `effect_slug`.
 * `title_drugs` narrows to the `{slug, name}` pair the drug filter reads and
 * `date_info` to the `{kind, value}` pair `workDateMs` parses. Rights
 * attribution lives on the permalink, which reads the full record.
 */
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
    order_index: replication.order_index ?? undefined,
  };
}

/**
 * The /replications gallery corpus: `getPublicReplications` minus the works of
 * artists excluded via their contributor profile, projected down to the slim
 * `PublicGalleryReplicationPreview` shape. This feeds ONLY the gallery
 * surface — the main explorer, its artist/effect focus views, and the focus
 * families in the sitemap. Effect-article replication sections, substance
 * showcases, contributor profile pages, permalinks, and the public API all stay
 * on the unfiltered, full-fidelity reads; the exclusion is a
 * gallery-presentation choice, not an unpublication, and the projection is a
 * payload choice, not a data change.
 *
 * Composed from two tagged caches rather than being an `unstable_cache` of its
 * own: the filter and projection are cheap, and this way revalidating either
 * `replications` (corpus changes) or `contributors` (an exclusion toggles)
 * refreshes it.
 */
export const getPublicGalleryReplications = cache(async (): Promise<PublicGalleryReplicationPreview[]> => {
  const [replications, profiles] = await Promise.all([
    getPublicReplications(),
    getPublicContributorProfiles(),
  ]);

  const visible = dropGalleryExcludedArtistWorks(replications, profiles);
  const artistKeys = [...new Set(visible.map((row) => row.artist.trim().toLowerCase()).filter(Boolean))];
  const artistTaxonomy = (
    await Promise.all(
      batches(artistKeys, PUBLIC_ARTIST_TAXONOMY_BATCH_SIZE).map((keys) =>
        getPublicDataReadAdapter().getPublicReplicationArtistsByKeys(keys),
      ),
    )
  ).flat();
  const artistByKey = new Map(artistTaxonomy.map((row) => [row.key, row]));

  return visible.map((replication) => {
    const artist = artistByKey.get(replication.artist.trim().toLowerCase());
    return projectPublicGalleryReplicationPreview({
      ...replication,
      // Only the tag array joins in: the taxonomy filter matches on
      // `artist_type_tags`, and the scalar `primary_type` renders nowhere.
      ...(artist ? { artist_type_tags: artist.artist_type_tags } : {}),
    });
  });
});

/**
 * One indexed public-gallery lookup for an immersive-view deep link.
 *
 * This deliberately reuses the existing `by_slug` Convex read rather than
 * walking gallery pages. The row still passes the gallery's publication and
 * contributor opt-out gates before its slim projection crosses into page
 * props.
 */
export const getPublicGalleryReplicationBySlug = cache(async (
  slug: string,
): Promise<PublicGalleryReplicationPreview | null> => {
  const [replication, profiles] = await Promise.all([
    getPublicReplicationBySlug(slug),
    getPublicContributorProfiles(),
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
    ? await getPublicDataReadAdapter().getPublicReplicationArtistsByKeys([
        artistKey,
      ])
    : [];
  return projectPublicGalleryReplicationPreview({
    ...replication,
    ...(artist ? { artist_type_tags: artist.artist_type_tags } : {}),
  });
});

/** Resolve only the detail rows selected from a slim catalog page. */
export const getPublicReplicationsBySlugs = cache(async (
  slugs: string[],
): Promise<ReplicationWithUrl[]> => {
  const uniqueSlugs = [...new Set(slugs)];
  if (uniqueSlugs.length === 0) return [];
  const rows = (
    await Promise.all(
      batches(uniqueSlugs, 100).map((batch) =>
        getPublicDataReadAdapter().getPublicReplicationsBySlugs(batch),
      ),
    )
  ).flat();
  return rows.filter(isPublishableReplication);
});
