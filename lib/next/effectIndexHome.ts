import "server-only";

import { cache } from "react";

import {
  getPublicEffects,
  getPublicReplications,
  getPublicReports,
  getPublishedEffectIndexArticles,
} from "@server/convex/publicData";
import featuredReplicationsConfig from "../../src/data/config/effectIndexFeaturedReplications.json";
import { formatArticleLengthLabel } from "../../src/features/articles/domain/articlesIndex";
import {
  resolveFeaturedReplications,
  selectFeaturedArticle,
  selectFeaturedEffectGroups,
  selectFeaturedReports,
  type EffectIndexHomeData,
} from "../../src/features/effect-index/home/homeModel";

/**
 * Data for the Effect Index homepage panels.
 *
 * No Convex schema change and no database deploy is involved: every panel is served from a
 * read that already exists.
 *
 *  - Featured Effects  — `getPublicEffects()` already projects the `featured` flag and tags.
 *  - Featured Reports  — `getPublicReports()` already projects `featured`.
 *  - Featured Article  — `effectIndexArticles` holds `featured` but has no `by_featured`
 *                        index. Adding one (or a Convex query that used it) would need a
 *                        production deploy, and the table is small enough that filtering
 *                        after the existing list read costs nothing.
 *  - Featured
 *    Replications      — the `replications` table has no `featured` field at all. "Featured"
 *                        there is editorial curation, so the list is checked in as
 *                        `src/data/config/effectIndexFeaturedReplications.json` and resolved
 *                        against the existing gallery read.
 *
 * All four reads are already `unstable_cache`d with the shared public-data revalidation
 * window, so this loader adds no caching of its own beyond per-request memoisation.
 */

/** The curated slug list, plus the note recording why 33 legacy entries were left out. */
export const EFFECT_INDEX_FEATURED_REPLICATION_SLUGS: readonly string[] =
  featuredReplicationsConfig.slugs;

/**
 * Varies which featured article, report ordering and replication leads the page between
 * builds, the way the original's per-render shuffle did. The selection functions are pure in
 * the seed so the server and the hydrated client always agree.
 */
function createDisplaySeed(): number {
  return Math.floor(Math.random() * 1_000_000);
}

export const loadEffectIndexHomeData = cache(
  async (seed: number = createDisplaySeed()): Promise<EffectIndexHomeData> => {
    const [effects, articles, reports, replications] = await Promise.all([
      getPublicEffects(),
      getPublishedEffectIndexArticles(),
      getPublicReports(),
      getPublicReplications(),
    ]);

    const effectNamesBySlug = new Map(effects.map((effect) => [effect.slug, effect.name]));

    return {
      effectCount: effects.length,
      effectGroups: selectFeaturedEffectGroups(effects),
      featuredArticle: selectFeaturedArticle(articles, seed, formatArticleLengthLabel),
      featuredReports: selectFeaturedReports(reports, seed),
      featuredReplications: resolveFeaturedReplications(
        EFFECT_INDEX_FEATURED_REPLICATION_SLUGS,
        replications,
        effectNamesBySlug,
        seed,
      ),
    };
  },
);
