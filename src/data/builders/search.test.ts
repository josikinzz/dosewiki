import { describe, it, expect } from "vitest";
import {
  buildSearchIndex,
  createSearchIndexInput,
} from "./search";
import type { LibraryData } from "../SubstanceIndexProvider";
import type { SubstanceRecord } from "./contentBuilder";

const createLibrary = (
  records: SubstanceRecord[],
  options: {
    categories?: Array<{ key: string; name: string; total: number; aliases?: string[] }>;
    effects?: Array<{ name: string; slug: string; total: number }>;
  } = {},
): LibraryData => ({
  articles: [],
  allSubstanceRecords: records,
  substanceRecords: records,
  allSubstancesBySlug: new Map(),
  substanceBySlug: new Map(),
  interactionIndex: new Map(),
  dosageCategoryGroups: (options.categories ?? records.map((record) => ({
    key: record.slug,
    name: record.name,
    total: 1,
  }))).map((category) => ({
    key: category.key,
    name: category.name,
    icon: 'lucide:circle',
    total: category.total,
    drugs: [],
  })),
  chemicalClassIndexGroups: [],
  mechanismIndexGroups: [],
  effectSummaries: options.effects ?? [],
  mechanismSummaries: [],
  findCategoryByKey: (key: string) => ({
    key,
    name: options.categories?.find((category) => category.key === key)?.name ?? key,
    aliases: options.categories?.find((category) => category.key === key)?.aliases ?? [],
    icon: 'lucide:circle',
  }),
  normalizeCategoryKey: (value: string) => value.toLowerCase(),
  getCategoryDetail: () => null,
  getEffectDetail: () => null,
  getEffectSummary: () => undefined,
  getMechanismDetail: () => null,
  getMechanismSummary: () => undefined,
  getChemicalClassDetail: () => null,
  getPsychoactiveClassDetail: () => null,
  getTaxonomyRouteDetail: () => null,
  getTaxonomyRoutePath: () => null,
  getInteractionsForSubstance: () => undefined,
  buildCategoryGroupsForRecords: () => [],
});

describe("search index", () => {
  it("never matches contributor profiles on internal aliases", () => {
    const input = createSearchIndexInput(createLibrary([]), {
      profiles: [
        {
          key: "LYREA",
          displayName: "Lyrea",
          bio: "Reviewer.",
          hasCustomBio: true,
        },
      ],
    });

    const built = buildSearchIndex(input);
    expect(built.query("lyrea")[0]).toMatchObject({ type: "profile", slug: "LYREA" });
    expect(built.query("oldhandle")).toEqual([]);
    expect(built.entries.some((entry) => entry.type === "profile" && entry.aliases)).toBe(false);
  });
});
