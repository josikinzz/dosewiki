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

export const EFFECT_INDEX_FEATURED_REPLICATION_SLUGS: readonly string[] =
  featuredReplicationsConfig.slugs;

export function resolveFeaturedReplicationSlugs(
  stored: readonly string[] | null,
  fallback: readonly string[] = EFFECT_INDEX_FEATURED_REPLICATION_SLUGS,
): readonly string[] {
  return stored ?? fallback;
}

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
