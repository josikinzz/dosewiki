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
import { getPublicReplications } from "./publicData.effects";
import { getPublicContributorProfiles } from "./publicData.contributors";
import type {
  PublicSubstanceGallery,
  SubstanceGalleryItem,
  SubstanceGalleryMatchProvenance,
} from "../../src/data/substanceReplicationGallery";

export type { PublicSubstanceGallery, SubstanceGalleryItem, SubstanceGalleryMatchProvenance };

const PUBLIC_ARTIST_TAXONOMY_BATCH_SIZE = 175;

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
 * The substance article's Replication Showcase: the substance's visual-effect
 * names matched against the corpus, ordered and filtered by its
 * `substanceGalleries` curation row. Matching, merge, and provenance rules
 * live in `src/data/substanceReplicationGallery`; Convex applies them so the
 * curated order and the write-path prune can never disagree.
 *
 * Zero matches are an empty gallery, never an error — an unmatched substance
 * renders today's page unchanged.
 *
 * The publishability gate is re-applied here like the other public replication
 * list reads (see the long note in `publicData.effects`): the Convex matcher
 * already refuses figures and audio, but this layer's filter ships with the
 * build that defines publishability rather than waiting on a Convex deploy.
 *
 * Tagged `replications` (curation saves revalidate it) and `substances`
 * (editing an article's visual effects changes what matches).
 */
export const getPublicReplicationsForSubstance = cache(unstable_cache(async (
  substanceSlug: string,
): Promise<PublicSubstanceGallery> => {
  const gallery = await getPublicDataReadAdapter().getPublicReplicationsForSubstance(substanceSlug);
  return {
    ...gallery,
    items: gallery.items.filter((item) => isPublishableReplication(item.replication)),
  };
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
 * Drops storage IDs, `_creationTime`, `effect_tags`, `format`, `file_size`,
 * `role`, and the seven rights-metadata fields: none of them are read by the
 * explorer, the focus views, the swipe deck, or the sitemap's focus families,
 * and the corpus is serialized wholesale into the /replications RSC payload.
 * Rights attribution lives on the permalink, which reads the full record.
 */
export function projectPublicGalleryReplicationPreview(
  replication: GalleryReplication,
): PublicGalleryReplicationPreview {
  return {
    _id: replication._id,
    slug: replication.slug,
    title: replication.title,
    artist: replication.artist,
    artist_url: replication.artist_url,
    type: replication.type,
    format: replication.format,
    effect_slug: replication.effect_slug,
    replication_status: replication.replication_status,
    viewing_mode: replication.viewing_mode,
    viewing_mode_tags: replication.viewing_mode_tags,
    title_drugs: replication.title_drugs,
    drug_classes: replication.drug_classes,
    content_family: replication.content_family,
    content_tags: replication.content_tags,
    artist_primary_type: replication.artist_primary_type,
    artist_type_tags: replication.artist_type_tags,
    url: replication.url,
    thumbnail_url: replication.thumbnail_url,
    preview_url: replication.preview_url,
    motion_url: replication.motion_url,
    motion_poster_url: replication.motion_poster_url,
    width: replication.width,
    height: replication.height,
    duration: replication.duration,
    has_audio: replication.has_audio,
    created_at: replication.created_at,
    date_info: replication.date_info,
    order_index: replication.order_index,
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
      ...(artist
        ? {
            artist_primary_type: artist.primary_type,
            artist_type_tags: artist.artist_type_tags,
          }
        : {}),
    });
  });
});
