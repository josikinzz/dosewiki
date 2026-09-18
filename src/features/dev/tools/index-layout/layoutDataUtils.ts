import type { SubstanceRecord } from "@/data/builders/contentBuilder";
import type { ManualDatasetKey } from "./types";

const COMMON_TAG = "common";

const normalizeTag = (value: string): string => value.trim().toLowerCase();

type LayoutDataHelpers = {
  /** The psychoactive index sorts Common-tagged substances first, then by name; other datasets by name only. */
  sortSlugsForDataset: (dataset: ManualDatasetKey, slugs: readonly string[]) => string[];
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

  return { sortSlugsForDataset };
}
