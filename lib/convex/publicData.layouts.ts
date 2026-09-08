import "server-only";

import { publicDataCache } from "./publicData.cache"
import { cache } from "react";
import { PUBLIC_CONVEX_CACHE_REVALIDATE_SECONDS, PUBLIC_CONVEX_CACHE_TAGS } from "./publicData.cache";
import { getPublicAboutData } from "./publicData.about";
import { getPublicEffects, getPublicReplications } from "./publicData.effects";
import { getPublicReports } from "./publicData.reports";
import { getPublicSubstances } from "./publicData.substances";
import { getPublicDataReadAdapter } from "./publicData.reads";
import type { IndexLayoutRecord, IndexLayoutType } from "./publicData.shared";

export const getIndexLayoutByType = cache(publicDataCache(async (type: IndexLayoutType): Promise<IndexLayoutRecord | null> => {
  return await getPublicDataReadAdapter().getPublicIndexLayoutByType(type);
}, ["convex-public-index-layout-by-type"], {
  revalidate: PUBLIC_CONVEX_CACHE_REVALIDATE_SECONDS,
  tags: [PUBLIC_CONVEX_CACHE_TAGS.all, PUBLIC_CONVEX_CACHE_TAGS.layouts],
}));

export const getPublicDataOverview = cache(async () => {
  const [substances, effects, reports, replications, about, psychoactiveLayout] = await Promise.all([
    getPublicSubstances(),
    getPublicEffects(),
    getPublicReports(),
    getPublicReplications(),
    getPublicAboutData(),
    getIndexLayoutByType("psychoactive"),
  ]);

  return {
    // Listed articles only. `low` (which also covers stored `hide_for_now`)
    // marks unfinished or deliberately unlisted drafts; the substance index
    // and the open-data export both leave them out, so the site-wide figure
    // must match.
    substanceCount: substances.filter((substance) => substance.priority !== "low").length,
    effectCount: effects.length,
    reportCount: reports.length,
    replicationCount: replications.length,
    aboutConfigured: about.markdown.length > 0 || about.subtitle.length > 0,
    psychoactiveCategoryCount: psychoactiveLayout?.categories.length ?? 0,
  };
});
