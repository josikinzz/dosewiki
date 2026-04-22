import "server-only";

import { cache } from "react";
import { getPublicAboutData } from "./publicData.about";
import { getPublicEffects } from "./publicData.effects";
import { getPublicReports } from "./publicData.reports";
import { getPublicSubstances } from "./publicData.substances";
import { queryConvex } from "./serverClient";
import type { IndexLayoutRecord, IndexLayoutType } from "./publicData.shared";

export const getIndexLayoutByType = cache(async (type: IndexLayoutType): Promise<IndexLayoutRecord | null> => {
  return await queryConvex<IndexLayoutRecord | null, { type: IndexLayoutType }>("indexLayouts:getByType", {
    type,
  });
});

export const getPublicDataOverview = cache(async () => {
  const [substances, effects, reports, about, psychoactiveLayout] = await Promise.all([
    getPublicSubstances(),
    getPublicEffects(),
    getPublicReports(),
    getPublicAboutData(),
    getIndexLayoutByType("psychoactive"),
  ]);

  return {
    substanceCount: substances.length,
    effectCount: effects.length,
    reportCount: reports.length,
    aboutConfigured: about.markdown.length > 0 || about.subtitle.length > 0,
    psychoactiveCategoryCount: psychoactiveLayout?.categories.length ?? 0,
  };
});
