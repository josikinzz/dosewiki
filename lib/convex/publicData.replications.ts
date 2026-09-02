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
 * One batch of artist taxonomy rows, persisted like the corpus pages it joins
 * onto. The gallery read resolves ~2,000 artists in batches of 175, so without
 * this every render of the index — and every hit on the gallery API — paid a
 * dozen live Convex queries before its first byte. Keyed by the batch's exact
 * key list; a degraded read (older deployment without the function) caches
 * its empty answer for the window, which is the harmless direction and clears
 * with the deploy that adds the function.
 */
const getPublicReplicationArtistTaxonomyBatch = cache(unstable_cache(async (
  keys: string[],
) => getPublicDataReadAdapter().getPublicReplicationArtistsByKeys(keys), [
  "convex-public-replication-artist-taxonomy-batch-v1",
], {
  revalidate: PUBLIC_CONVEX_CACHE_REVALIDATE_SECONDS,
  tags: [PUBLIC_CONVEX_CACHE_TAGS.all, PUBLIC_CONVEX_CACHE_TAGS.replications],
}));

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
 * individually cacheable, and is shared by every substance article.
 *
 * This MUST stay a top-level `unstable_cache`: Next bypasses any
 * `unstable_cache` reached from inside another `unstable_cache` callback, so
 * nothing above it in the call graph may be an `unstable_cache` of its own.
 * `getPublicMatchableReplicationCorpus` and `getPublicReplicationsForSubstance`
 * below are therefore React `cache()` (request dedupe) only.
 */
const getPublicMatchableReplicationCorpusPage = cache(unstable_cache(async (
  cursor?: string,
) => {
  return await getPublicDataReadAdapter().getPublicMatchableReplicationPage(cursor);
}, ["convex-public-matchable-replication-corpus-page-v1"], {
  revalidate: PUBLIC_CONVEX_CACHE_REVALIDATE_SECONDS,
  tags: [PUBLIC_CONVEX_CACHE_TAGS.all, PUBLIC_CONVEX_CACHE_TAGS.replications],
}));

/**
 * The whole slim corpus, assembled once per request from the cached pages.
 * Request-scoped only: the persisted unit is the page above.
 */
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
 * The stored curation row for one substance. Small, keyed per substance, and
 * a leaf: it reads the adapter directly, so it is safe as a top-level
 * `unstable_cache`.
 */
const getPublicSubstanceGalleryCuration = cache(unstable_cache(async (
  substanceSlug: string,
) => {
  return await getPublicDataReadAdapter().getPublicSubstanceGalleryCuration(substanceSlug);
}, ["convex-public-substance-gallery-curation-v1"], {
  revalidate: PUBLIC_CONVEX_CACHE_REVALIDATE_SECONDS,
  tags: [
    PUBLIC_CONVEX_CACHE_TAGS.all,
    PUBLIC_CONVEX_CACHE_TAGS.replications,
    PUBLIC_CONVEX_CACHE_TAGS.substances,
  ],
}));

/** Thrown inside the fast-path cache so an undeployed query is never persisted as an empty gallery. */
class PublicSubstanceGalleryFastPathUnavailableError extends Error {
  constructor() {
    super("substanceGalleries:getPublicGalleryBySubstance is not deployed");
    this.name = "PublicSubstanceGalleryFastPathUnavailableError";
  }
}

/**
 * The single-round-trip showcase read (`substanceGalleries:getPublicGalleryBySubstance`),
 * persisted per substance. The merged gallery is at most a few hundred
 * URL-resolved rows, well inside the data-cache entry limit. A deployment
 * that lacks the query throws instead of returning, so nothing is cached and
 * the next request tries again rather than sitting on an empty entry for a
 * whole revalidate window.
 */
const readPublicSubstanceGalleryFastPath = cache(unstable_cache(async (
  substanceSlug: string,
): Promise<PublicSubstanceGallery> => {
  const gallery = await getPublicDataReadAdapter().getPublicSubstanceGallery(substanceSlug);
  if (!gallery) {
    throw new PublicSubstanceGalleryFastPathUnavailableError();
  }
  return gallery;
}, ["convex-public-substance-gallery-v1"], {
  revalidate: PUBLIC_CONVEX_CACHE_REVALIDATE_SECONDS,
  tags: [
    PUBLIC_CONVEX_CACHE_TAGS.all,
    PUBLIC_CONVEX_CACHE_TAGS.replications,
    PUBLIC_CONVEX_CACHE_TAGS.substances,
  ],
}));

/**
 * The corpus path: match the substance against the shared slim corpus, merge
 * the stored curation, and hydrate only the winners. Every persisted read it
 * touches is a top-level `unstable_cache`; this function itself is
 * request-scoped so those caches are actually consulted.
 */
const assemblePublicSubstanceGalleryFromCorpus = cache(async (
  substance: NonNullable<Awaited<ReturnType<typeof getPublicSubstanceBySlug>>>,
): Promise<PublicSubstanceGallery> => {
  const [corpus, curation] = await Promise.all([
    getPublicMatchableReplicationCorpus(),
    getPublicSubstanceGalleryCuration(substance.slug),
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
});

/**
 * The substance article's Replication Showcase: exact-drug and permitted
 * general-class placements, plus stored editorial ordering, direct
 * associations, and per-article exclusions. Placement and merge rules live in
 * `src/data/substanceReplicationGallery`, shared with the Convex curation
 * portal and the one-shot public query so public reads and editorial writes
 * cannot drift.
 *
 * PERF, cold article render. Two paths, fastest first:
 *
 *   1. `substanceGalleries:getPublicGalleryBySubstance`: one Convex round trip
 *      that runs the matcher beside the data and returns the merged,
 *      URL-resolved rows. Persisted per substance
 *      (`readPublicSubstanceGalleryFastPath`).
 *   2. Corpus fallback, used while that query is not deployed or if it fails:
 *      the shared slim corpus (28 pages for the live table, each a top-level
 *      cache entry shared by every article), the per-substance curation row,
 *      and one indexed `replications:getBySlugs` batch per 100 winners.
 *
 * This function is deliberately NOT an `unstable_cache`. It used to be, and
 * Next bypasses every `unstable_cache` called from inside another one, so the
 * corpus pages were never persisted and each cold article re-drained the whole
 * corpus from Convex. The persisted units are the leaves above; this layer is
 * React `cache()` for request dedupe only.
 *
 * A missing substance is an empty gallery without touching Convex, and zero
 * matches are an empty gallery, never an error. Merged order is preserved.
 *
 * The publishability gate is re-applied here like the other public replication
 * list reads: the matcher already refuses figures and audio, but this layer's
 * filter ships with the build that defines publishability rather than waiting
 * on a Convex deploy.
 */
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
    return {
      items: gallery.items.filter((item) => isPublishableReplication(item.replication)),
    };
  } catch (error) {
    if (
      !(error instanceof PublicSubstanceGalleryFastPathUnavailableError) &&
      !hasWarnedAboutSubstanceGalleryFastPath
    ) {
      // Once per process: before the query is deployed every article would
      // otherwise repeat this line, and a build prerenders hundreds of them.
      hasWarnedAboutSubstanceGalleryFastPath = true;
      console.warn(
        `[publicData] substanceGalleries:getPublicGalleryBySubstance failed for "${substanceSlug}"; falling back to the paged matchable corpus.`,
        error,
      );
    }
  }

  return await assemblePublicSubstanceGalleryFromCorpus(substance);
});

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
        getPublicReplicationArtistTaxonomyBatch(keys),
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
    ? await getPublicReplicationArtistTaxonomyBatch([artistKey])
    : [];
  return projectPublicGalleryReplicationPreview({
    ...replication,
    ...(artist ? { artist_type_tags: artist.artist_type_tags } : {}),
  });
});

/**
 * One indexed batch of at most 100 detail rows, persisted under its slug list.
 * A leaf read, so it is a top-level `unstable_cache`; the corpus fallback in
 * `getPublicReplicationsForSubstance` reaches it through request-scoped
 * functions only.
 */
const getPublicReplicationsBySlugBatch = cache(unstable_cache(async (
  slugs: string[],
): Promise<ReplicationWithUrl[]> => {
  return await getPublicDataReadAdapter().getPublicReplicationsBySlugs(slugs);
}, ["convex-public-replications-by-slug-batch-v1"], {
  revalidate: PUBLIC_CONVEX_CACHE_REVALIDATE_SECONDS,
  tags: [PUBLIC_CONVEX_CACHE_TAGS.all, PUBLIC_CONVEX_CACHE_TAGS.replications],
}));

/** Resolve only the detail rows selected from a slim catalog page. */
export const getPublicReplicationsBySlugs = cache(async (
  slugs: string[],
): Promise<ReplicationWithUrl[]> => {
  const uniqueSlugs = [...new Set(slugs)];
  if (uniqueSlugs.length === 0) return [];
  const rows = (
    await Promise.all(
      batches(uniqueSlugs, 100).map((batch) => getPublicReplicationsBySlugBatch(batch)),
    )
  ).flat();
  return rows.filter(isPublishableReplication);
});
