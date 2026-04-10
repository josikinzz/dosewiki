import type { SubstanceRecord } from "@/data/builders/contentBuilder";
import { slugify } from "@/utils/slug";
import type {
  ManualCategorySection,
  ManualDatasetKey,
  ManualIndexConfig,
  SlugIssue,
  SlugStatus,
} from "./types";

const COMMON_TAG = "common";

const normalizeTag = (value: string): string => value.trim().toLowerCase();

type LayoutDataHelpers = {
  sortSlugsWithCommonPriority: (slugs: readonly string[]) => string[];
  sortSlugsForDataset: (dataset: ManualDatasetKey, slugs: readonly string[]) => string[];
  sortSectionsForDataset: (
    dataset: ManualDatasetKey,
    sections: readonly ManualCategorySection[],
  ) => ManualCategorySection[];
  resolveSlugStatus: (slug: string, counts: Map<string, number>) => SlugStatus;
  organizeManualEntries: (dataset: ManualDatasetKey, manual: ManualIndexConfig) => ManualIndexConfig;
  normalizeManualOrdering: (dataset: ManualDatasetKey, manual: ManualIndexConfig) => ManualIndexConfig;
};

export function createLayoutDataHelpers(
  allSubstanceRecords: readonly SubstanceRecord[],
  allSubstancesBySlug: ReadonlyMap<string, SubstanceRecord>,
): LayoutDataHelpers {
  const commonSlugSet = new Set<string>(
    allSubstanceRecords
      .filter((record) => {
        const candidates = [
          ...(record.categories ?? []),
          ...(record.indexCategories ?? []),
        ];
        return candidates.some((category) => normalizeTag(category) === COMMON_TAG);
      })
      .map((record) => record.slug),
  );

  const isCommonSlug = (slug: string): boolean => {
    if (commonSlugSet.has(slug)) {
      return true;
    }

    const record = allSubstancesBySlug.get(slug);
    if (!record) {
      return false;
    }

    const candidates = [
      ...(record.categories ?? []),
      ...(record.indexCategories ?? []),
    ];
    const matches = candidates.some((category) => normalizeTag(category) === COMMON_TAG);
    if (matches) {
      commonSlugSet.add(slug);
    }
    return matches;
  };

  const getSlugSortName = (slug: string): string => allSubstancesBySlug.get(slug)?.name ?? slug;

  const sortSlugsWithCommonPriority = (slugs: readonly string[]): string[] =>
    slugs
      .map((slug) => ({
        slug,
        isCommon: isCommonSlug(slug),
        name: getSlugSortName(slug),
      }))
      .sort((first, second) => {
        if (first.isCommon !== second.isCommon) {
          return first.isCommon ? -1 : 1;
        }
        return first.name.localeCompare(second.name, undefined, {
          sensitivity: "base",
          numeric: true,
        });
      })
      .map((entry) => entry.slug);

  const sortSlugsAlphabetically = (slugs: readonly string[]): string[] =>
    [...slugs]
      .map((slug) => ({ slug, name: getSlugSortName(slug) }))
      .sort((first, second) => first.name.localeCompare(second.name, undefined, {
        sensitivity: "base",
        numeric: true,
      }))
      .map((entry) => entry.slug);

  const sortSlugsForDataset = (
    dataset: ManualDatasetKey,
    slugs: readonly string[],
  ): string[] => {
    if (dataset === "psychoactive") {
      return sortSlugsWithCommonPriority(slugs);
    }
    return sortSlugsAlphabetically(slugs);
  };

  const sortSectionsForDataset = (
    dataset: ManualDatasetKey,
    sections: readonly ManualCategorySection[],
  ): ManualCategorySection[] => sections.map((section) => ({
    ...section,
    drugs: sortSlugsForDataset(dataset, section.drugs),
  }));

  const resolveSlugStatus = (slug: string, counts: Map<string, number>): SlugStatus => {
    const normalized = slugify(slug);
    const issues: SlugIssue[] = [];
    if (!normalized) {
      issues.push("missing");
      return { slug, issues };
    }

    const record = allSubstancesBySlug.get(normalized);
    if (!record) {
      issues.push("missing");
      return { slug, issues };
    }

    if (record.isHidden) {
      issues.push("hidden");
    }

    if ((counts.get(normalized) ?? 0) > 1) {
      issues.push("duplicate");
    }

    return {
      slug,
      name: record.name,
      alias: record.aliases?.[0],
      issues,
    };
  };

  const organizeManualEntries = (
    dataset: ManualDatasetKey,
    manual: ManualIndexConfig,
  ): ManualIndexConfig => ({
    ...manual,
    categories: manual.categories.map((category) => ({
      ...category,
      drugs: sortSlugsForDataset(dataset, category.drugs),
      sections: sortSectionsForDataset(dataset, category.sections),
    })),
  });

  const normalizeManualOrdering = (
    dataset: ManualDatasetKey,
    manual: ManualIndexConfig,
  ): ManualIndexConfig => ({
    ...manual,
    categories: manual.categories.map((category) => ({
      ...category,
      drugs: sortSlugsForDataset(dataset, category.drugs),
      sections: category.sections.map((section) => ({
        ...section,
        drugs: sortSlugsForDataset(dataset, section.drugs),
      })),
    })),
  });

  return {
    sortSlugsWithCommonPriority,
    sortSlugsForDataset,
    sortSectionsForDataset,
    resolveSlugStatus,
    organizeManualEntries,
    normalizeManualOrdering,
  };
}
