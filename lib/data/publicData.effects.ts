import "server-only";

import { publicDataCache, publicEffectTag } from "./publicData.cache";
import { cache } from "react";
import { contributorMatchNames, profileMatchesName } from "../contributorProfileIdentity";
import type { NormalizedUserProfile } from "../../src/data/userProfiles";
import type { ContributorEffectCredit } from "../../src/types/effectCredits";
import { isPublishableReplication, depictsEffect, type GalleryReplication, type ReplicationWithUrl } from "../../src/types/replications";
import { PUBLIC_DATA_CACHE_REVALIDATE_SECONDS, PUBLIC_DATA_CACHE_TAGS } from "./publicData.cache";
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

/**
 * Every effect article credited to one contributor, alphabetically.
 *
 * `subjectiveEffects.contributors[]` is the only contributor field the public
 * corpus has: substance articles carry none, and `effectIndexArticles.authors[]`
 * holds one opaque Mongo ObjectId repeated across every row, which names nobody
 * (see `src/data/contributorRoster` for the same exclusion). So effect articles
 * are the whole of a contributor's article credits.
 *
 * The compact credit projection carries names and destinations only, never
 * effect article narratives. Identity matching remains shared with reports.
 * `profileMatchesName` is the app's single definition of "this name is that
 * contributor", shared with the replication and trip-report joins, so a
 * profile's articles, works and reports can never disagree about which credits
 * are theirs. It is exact on normalized whole names, which is why `Josie` and
 * `josie` both land on JOSIE (alias `josie`) and `Kaylee` lands on KAYTWO
 * (alias `kaylee`), while a credit with no profile at all — `liv`, `Nicole`,
 * `Kat`, `chemi`, `Brack` — simply appears on no profile page.
 */
export const getEffectArticlesByContributor = cache(async (
  profile: NormalizedUserProfile,
): Promise<ContributorEffectCredit[]> => {
  // A profile with no matchable name can credit nothing, so it skips the corpus
  // read entirely rather than filtering 233 articles down to none.
  if (contributorMatchNames(profile).length === 0) {
    return [];
  }

  const effects = await getPublicEffectContributorCredits(contributorMatchNames(profile));

  return effects
    .filter((effect) =>
      (effect.contributors ?? []).some((contributor) => profileMatchesName(profile, contributor)),
    )
    .map((effect) => ({ slug: effect.slug, name: effect.name }))
    // Alphabetical, because the reader scans this list for a name rather than
    // reading it in order; a 225-entry list sorted by anything else is a haystack.
    .sort((left, right) => left.name.localeCompare(right.name));
});

/**
 * WHERE THE FIGURE / UNRENDERABLE-MEDIA GATE LIVES, AND WHY IT IS HERE
 * --------------------------------------------------------------------
 * `isPublishableReplication` is applied to these two list reads and to
 * `getReplicationsByContributor` and `getPublicReplicationsForSubstance` in
 * `publicData.replications`. Between them those four are the whole of the
 * public replication call graph:
 *
 *   getPublicReplications        → the /effects gallery explorer (and its
 *                                  spotlight, rails, tiles and "N works ·
 *                                  N artists · N effects" counts), the Effect
 *                                  Index homepage panel, the public route plan
 *                                  (so `generateStaticParams` *and* the
 *                                  sitemap), `/api/v1/replications` and
 *                                  `/api/v1/replications/[slug]`, and the About
 *                                  page's contributor reference counts.
 *   getPublicReplicationsByEffect → the effect article's Replications section,
 *                                  `/api/v1/effects/[slug]/replications`, and
 *                                  the permalink's effect walk.
 *   getReplicationsByContributor → the contributor profile's works rail and the
 *                                  permalink's artist walk.
 *   getPublicReplicationsForSubstance → the substance article's Replication
 *                                  Showcase and the Replication Studio's
 *                                  substance curation portal (whose matcher
 *                                  applies the same gate inside Postgres; the
 *                                  filter here is the belt to that suspender).
 *
 * Filtering inside `server/replications.ts` instead would be one edit rather
 * than three, and it was rejected for two reasons. It would hide figures from
 * the maintenance scripts that read those same Postgres queries directly
 * (`scripts/replications/audit-provenance.mjs`, `archive-replication-masters`,
 * `repoint-renditions`) — a rights-tracked asset invisible to the rights audit
 * is the wrong failure — and it would only take effect on a Postgres deploy,
 * leaving the site publishing figures until that deploy happened, whereas this
 * ships with the build that introduces it.
 *
 * `getPublicReplicationBySlug` below is deliberately *not* filtered: it is a
 * plain single-row read, and its only caller — `loadReplicationRoute` — already
 * owns the "does this row have a page?" decision for `url` and now answers it
 * for `role` and `type` in the same place.
 */
/**
 * Exact depicted-effect membership, shared with the gallery filter: owner OR
 * explicit additional tag, never ancestors or artist-display exclusions.
 * Keep this request-scoped: persisting the assembled collection would bypass
 * the bounded corpus-page and detail-batch caches below it.
 */
export const getPublicReplicationsByEffect = cache(async (
  effectSlug: string,
): Promise<ReplicationWithUrl[]> => {
  const slugs = new Set<string>();
  for (const row of await readPublicReplicationCorpus(effectSlug)) {
    if (depictsEffect(row, effectSlug)) slugs.add(row.slug);
  }
  const details = await getPublicReplicationsBySlugs([...slugs]);
  const bySlug = new Map(details.map((row) => [row.slug, row]));
  // Hydration can return a different order or newer taxonomy/publication state.
  // Preserve corpus order while withholding stale associations and missing rows.
  const collection: ReplicationWithUrl[] = [];
  for (const slug of slugs) {
    const row = bySlug.get(slug);
    if (row && depictsEffect(row, effectSlug)) collection.push(row);
  }
  return collection;
});

/**
 * Cache bounded corpus pages, never the assembled replication corpus.
 *
 * The full public gallery is larger than Next's 2 MB data-cache entry limit.
 * Caching that aggregate made every build worker miss the cache and drain the
 * entire paginated Postgres feed again. Individual 64-row pages remain safely
 * cacheable and can be shared across workers; React's request cache then
 * deduplicates the cheap in-memory assembly for each render.
 *
 * The page cache only works because `getPublicReplications` below is React
 * `cache()` and not `unstable_cache`: Next bypasses an `unstable_cache` reached
 * from inside another `unstable_cache` callback, so any persisted wrapper above
 * this drain would turn every one of its misses into a full Postgres re-drain.
 */
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
