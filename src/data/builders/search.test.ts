import { describe, it, expect } from "vitest";
import {
  buildSearchIndexFromLibrary,
  createSearchIndexInput,
  getSearchIndexInputHash,
  querySearchWithData,
} from "./search";
import type { LibraryData } from "../SubstanceIndexProvider";
import type { SubstanceRecord } from "./contentBuilder";

interface CreateRecordOptions {
  aliases?: string[];
  categories?: string[];
  chemicalClasses?: string[];
  psychoactiveClasses?: string[];
  subtitle?: string;
  mechanismValue?: string;
  mechanismChips?: Array<{
    label: string;
    base: string;
    slug: string;
    qualifier?: string;
  }>;
  mechanisms?: SubstanceRecord["mechanisms"];
}

const createRecord = (
  name: string,
  slug: string,
  options: CreateRecordOptions = {},
): SubstanceRecord => {
  const mechanisms = options.mechanisms ?? options.mechanismChips?.map((chip) => ({
    label: chip.label,
    base: chip.base,
    slug: chip.slug,
    qualifier: chip.qualifier,
    qualifierSlug: chip.qualifier ? chip.qualifier.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") : undefined,
  })) ?? [];

  return {
  id: null,
  name,
  slug,
  aliases: options.aliases ?? [],
  categories: options.categories ?? [],
  indexCategories: options.categories ?? [],
  chemicalClasses: options.chemicalClasses ?? [],
  psychoactiveClasses: options.psychoactiveClasses ?? [],
  priority: "normal",
  isHidden: false,
  isLowPriority: false,
  mechanisms,
  content: {
    name,
    aliases: options.aliases ?? [],
    nameVariants: [],
    moleculePlaceholder: "",
    heroBadges: options.categories?.map((label) => ({ label, icon: "sparkles" })) ?? [],
    categoryKeys: [],
    categories: options.categories ?? [],
    dosageUnitsNote: undefined,
    routes: {},
    routeOrder: [],
    addictionSummary: "",
    subjectiveEffects: [],
    interactions: [],
    tolerance: [],
    reagentTesting: {},
    notes: "",
    sourceCitations: [],
    citations: [],
    infoSections:
      options.mechanismValue || options.mechanismChips
        ? [
            {
              title: "Pharmacology",
              icon: "sparkles",
              items: [
                {
                  label: "Mechanism of action",
                  value: options.mechanismValue ?? "",
                  chips: options.mechanismChips,
                },
              ],
            },
          ]
        : [],
    subtitle: options.subtitle ?? "",
  },
  };
};

const createLibrary = (
  records: ReturnType<typeof createRecord>[],
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
  it("returns matches for the current library and query", () => {
    const libraryA = createLibrary([createRecord("LSD", "lsd", { categories: ["Psychedelic"] })]);
    const libraryB = createLibrary([createRecord("MDMA", "mdma", { categories: ["Entactogen"] })]);

    const lsdResults = querySearchWithData("lsd", libraryA);
    expect(lsdResults[0]?.label).toBe("LSD");
    expect(lsdResults[0]?.type).toBe("substance");

    const mdmaResults = querySearchWithData("mdma", libraryB);
    expect(mdmaResults[0]?.label).toBe("MDMA");
    expect(mdmaResults[0]?.type).toBe("substance");
  });

  it("builds an immutable index with source metadata", () => {
    const library = createLibrary(
      [createRecord("LSD", "lsd", { aliases: ["Acid"] })],
      {
        categories: [{ key: "psychedelics", name: "Psychedelics", total: 12 }],
        effects: [{ name: "Visuals", slug: "visuals", total: 7 }],
      },
    );

    const input = createSearchIndexInput(library);
    const index = buildSearchIndexFromLibrary(library);

    expect(index.metadata).toEqual({
      inputHash: getSearchIndexInputHash(input),
      entryCounts: {
        substance: 1,
        category: 1,
        effect: 1,
        total: 3,
      },
    });
    expect(Object.isFrozen(index)).toBe(true);
    expect(Object.isFrozen(index.entries)).toBe(true);
  });

  it("normalizes queries and ranks prefixes, substrings, keywords, counts, and limits", () => {
    const library = createLibrary(
      [
        createRecord("LSD", "lsd", {
          aliases: ["Acid"],
          chemicalClasses: ["Lysergamide"],
          psychoactiveClasses: ["Psychedelic"],
          mechanismChips: [
            {
              label: "5-HT2A receptor agonist",
              base: "5-HT2A receptor",
              slug: "5-ht2a-receptor-agonist",
              qualifier: "agonist",
            },
          ],
        }),
        createRecord("1P-LSD", "1p-lsd", {
          aliases: ["Research lysergamide"],
          chemicalClasses: ["Lysergamide"],
          psychoactiveClasses: ["Psychedelic"],
        }),
      ],
      {
        categories: [
          { key: "psychedelics", name: "Psychedelics", total: 12, aliases: ["Hallucinogens"] },
          { key: "research-chemicals", name: "Research Chemicals", total: 3 },
        ],
        effects: [{ name: "Visual geometry", slug: "visual-geometry", total: 9 }],
      },
    );
    const index = buildSearchIndexFromLibrary(library);

    expect(index.query(" lsd ").map((match) => match.label)).toEqual(["LSD", "1P-LSD"]);
    expect(index.query("p-l").map((match) => match.label)[0]).toBe("1P-LSD");
    expect(index.query("acid").map((match) => match.label)[0]).toBe("LSD");
    expect(index.query("agon").map((match) => match.label)[0]).toBe("LSD");
    expect(index.query("hallucinogen").map((match) => match.label)[0]).toBe("Psychedelics");
    expect(index.query("visual", { limit: 1 })).toHaveLength(1);
  });

  it("builds mechanism search metadata from typed mechanisms instead of info-section labels", () => {
    const library = createLibrary([
      createRecord("Mechanism Search Substance", "mechanism-search-substance", {
        mechanisms: [
          {
            label: "NMDA receptor antagonist (noncompetitive antagonist)",
            base: "NMDA receptor antagonist",
            slug: "nmda-receptor-antagonist",
            qualifier: "noncompetitive antagonist",
            qualifierSlug: "noncompetitive-antagonist",
          },
        ],
        mechanismValue: "Presentation copy changed",
      }),
    ]);

    const record = library.substanceRecords[0];
    if (!record?.content.infoSections?.[0]?.items[0]) {
      throw new Error("Expected test record to have a presentation info item.");
    }
    record.content.infoSections[0].items[0].label = "Pharmacodynamic profile";

    const input = createSearchIndexInput(library);
    const index = buildSearchIndexFromLibrary(library);

    expect(input.substances[0]?.mechanismLabels).toEqual([
      "NMDA receptor antagonist (noncompetitive antagonist)",
    ]);
    expect(index.query("noncompetitive")[0]?.label).toBe("Mechanism Search Substance");
  });

  it("sorts equal-score category and effect matches by count", () => {
    const library = createLibrary([], {
      categories: [
        { key: "common", name: "Common", total: 2 },
        { key: "common-large", name: "Common Large", total: 9 },
      ],
      effects: [
        { name: "Glow", slug: "glow", total: 1 },
        { name: "Glow Strong", slug: "glow-strong", total: 5 },
      ],
    });
    const index = buildSearchIndexFromLibrary(library);

    expect(index.query("common").map((match) => match.label)).toEqual([
      "Common Large",
      "Common",
    ]);
    expect(index.query("glow").map((match) => match.label)).toEqual([
      "Glow Strong",
      "Glow",
    ]);
  });

  it("changes the input hash when searchable source fields change", () => {
    const original = createSearchIndexInput(
      createLibrary([createRecord("LSD", "lsd", { aliases: ["Acid"] })]),
    );
    const updated = createSearchIndexInput(
      createLibrary([createRecord("LSD", "lsd", { aliases: ["Acid", "Lucy"] })]),
    );

    expect(getSearchIndexInputHash(updated)).not.toBe(getSearchIndexInputHash(original));
  });
});
