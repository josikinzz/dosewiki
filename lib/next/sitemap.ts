import "server-only";

import type { MetadataRoute } from "next";
import { slugify } from "../../src/utils/slug";
import { profilesByKey } from "../../src/data/userProfiles";
import { getPublicLibrary } from "../convex/publicLibrary";
import { getPublicEffects, getPublicReports, getPublicSubstances } from "../convex/publicData";

const STATIC_PUBLIC_PATHS = ["/", "/substances", "/effects", "/reports", "/about"] as const;
const EFFECT_CATEGORY_PATHS = [
  "sensory",
  "cognitive",
  "physical",
  "visual",
  "auditory",
  "tactile",
  "smell-and-taste",
  "multisensory",
  "amplification",
  "suppression",
  "distortion",
  "geometric",
  "hallucinatory",
] as const;
const SITE_URL = "https://dose.wiki";

export async function getSitemapPlanningData() {
  const [substances, effects, reports, library] = await Promise.all([
    getPublicSubstances(),
    getPublicEffects(),
    getPublicReports(),
    getPublicLibrary(),
  ]);

  const chemicalClassPaths = new Set<string>();
  const psychoactiveClassPaths = new Set<string>();

  for (const substance of substances) {
    const fullSubstancePath = `/${substance.slug}`;
    void fullSubstancePath;
  }

  for (const article of library.articles) {
    article.classification.chemical_class.forEach((label) => chemicalClassPaths.add(`/chemical/${slugify(label)}`));
    article.classification.psychoactive_class.forEach((label) => psychoactiveClassPaths.add(`/psychoactive/${slugify(label)}`));
  }

  return {
    staticPaths: [...STATIC_PUBLIC_PATHS],
    plannedDynamicPaths: {
      substances: substances.map((substance) => `/${substance.slug}`),
      categories: library.dosageCategoryGroups.map((group) => `/category/${group.key}`),
      effects: effects.map((effect) => `/effects/${effect.slug}`),
      effectCategories: EFFECT_CATEGORY_PATHS.map((slug) => `/effects/category/${slug}`),
      mechanisms: library.mechanismSummaries.flatMap((mechanism) => {
        const detail = library.getMechanismDetail(mechanism.slug);
        if (!detail) {
          return [];
        }

        return [
          `/mechanism/${mechanism.slug}`,
          ...detail.qualifiers
            .filter((qualifier) => qualifier.key !== detail.defaultQualifierKey)
            .map((qualifier) => `/mechanism/${mechanism.slug}/${qualifier.key}`),
        ];
      }),
      chemicalClasses: Array.from(chemicalClassPaths),
      psychoactiveClasses: Array.from(psychoactiveClassPaths),
      reports: reports.map((report) => `/reports/${report.slug}`),
      contributors: Array.from(profilesByKey.keys()).map((key) => `/contributors/${encodeURIComponent(key)}`),
    },
  };
}

export async function buildSitemapEntries(): Promise<MetadataRoute.Sitemap> {
  const planningData = await getSitemapPlanningData();
  const allPaths = [
    ...planningData.staticPaths,
    ...planningData.plannedDynamicPaths.substances,
    ...planningData.plannedDynamicPaths.categories,
    ...planningData.plannedDynamicPaths.effects,
    ...planningData.plannedDynamicPaths.effectCategories,
    ...planningData.plannedDynamicPaths.mechanisms,
    ...planningData.plannedDynamicPaths.chemicalClasses,
    ...planningData.plannedDynamicPaths.psychoactiveClasses,
    ...planningData.plannedDynamicPaths.reports,
    ...planningData.plannedDynamicPaths.contributors,
  ];

  return Array.from(new Set(allPaths)).map((path) => ({
    url: new URL(path, SITE_URL).toString(),
    changeFrequency: path === "/" ? "daily" : "weekly",
    priority: path === "/" ? 1 : path.startsWith("/reports/") ? 0.6 : 0.8,
  }));
}
