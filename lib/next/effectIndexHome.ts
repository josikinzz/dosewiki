import "server-only";

import { cache } from "react";

import {
  getPublicEffects,
  getPublicFeaturedReplicationSlugs,
  getPublicReplicationsBySlugs,
  getPublicReports,
  getPublishedPublicationIndex,
} from "@server/data/publicData";
import featuredReplicationsConfig from "@data/effects/effectIndexFeaturedReplications.json";
import { articleReadMinutes } from "../../src/features/articles/domain/articlesIndex";
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
 * No Postgres schema change and no database deploy is involved: every panel is served from a
 * read that already exists.
 *
 *  - Featured Effects  — `getPublicEffects()` already projects the `featured` flag and tags.
 *  - Featured Reports  — `getPublicReports()` already projects `featured`.
 *  - Featured Article  — `effectIndexArticles` holds `featured` but has no `by_featured`
 *                        index. Adding one (or a Postgres query that used it) would need a
 *                        production deploy, and the table is small enough that filtering
 *                        after the existing list read costs nothing.
 *  - Featured
 *    Replications      — "Featured" here is an *ordered* editorial selection rather than a
 *                        property of a row, so it is stored as one `siteConfig` document the
 *                        Replication Studio edits, and resolved against the existing gallery
 *                        read. The checked-in
 *                        `data/effects/effectIndexFeaturedReplications.json` remains the
 *                        fallback for a deployment that has never been curated (or that
 *                        predates the Postgres functions), so the carousel is never blank
 *                        merely because a database is fresh.
 *
 * All four reads are already `unstable_cache`d with the shared public-data revalidation
 * window, so this loader adds no caching of its own beyond per-request memoisation.
 */

/**
 * The fallback slug list, plus the note recording why 33 legacy entries were left out.
 *
 * This is what the carousel shows before anybody curates in the portal. Once a selection is
 * stored it wins outright, including when it is empty — an editor who clears the selection
 * means "show nothing I did not choose", and quietly restoring this list would overrule them.
 */
export const EFFECT_INDEX_FEATURED_REPLICATION_SLUGS: readonly string[] =
  featuredReplicationsConfig.slugs;

/**
 * Which list the carousel runs on. Separated from the loader so the precedence rule is
 * testable without a database: a stored selection wins, `null` (never curated, or a
 * deployment without the functions) falls back to the checked-in list.
 */
export function resolveFeaturedReplicationSlugs(
  stored: readonly string[] | null,
  fallback: readonly string[] = EFFECT_INDEX_FEATURED_REPLICATION_SLUGS,
): readonly string[] {
  return stored ?? fallback;
}

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
    const featuredSlugsPromise = getPublicFeaturedReplicationSlugs().then(
      (stored) => [...resolveFeaturedReplicationSlugs(stored)],
    );
    const [effects, articles, reports, replications, featuredSlugs] = await Promise.all([
      getPublicEffects(),
      getPublishedPublicationIndex("article"),
      getPublicReports(),
      featuredSlugsPromise.then((slugs) => getPublicReplicationsBySlugs(slugs)),
      featuredSlugsPromise,
    ]);

    const effectNamesBySlug = new Map(effects.map((effect) => [effect.slug, effect.name]));

    return {
      effectCount: effects.length,
      effectGroups: selectFeaturedEffectGroups(effects),
      featuredArticle: selectFeaturedArticle(articles, seed, (body) => {
        // Effect Index has no locale mirror, so its read time stays English here.
        const minutes = articleReadMinutes(body);
        return minutes ? `${minutes} min read` : undefined;
      }),
      featuredReports: selectFeaturedReports(reports, seed),
      featuredReplications: resolveFeaturedReplications(
        featuredSlugs,
        replications,
        effectNamesBySlug,
        seed,
      ),
    };
  },
);
