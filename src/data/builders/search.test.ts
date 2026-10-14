import { describe, it, expect } from "vitest";
import {
  buildSearchIndex,
  buildSearchIndexFromLibrary,
  createSearchIndexInput,
} from "./search";
import type { LibraryData } from "../SubstanceIndexProvider";
import type { SubstanceRecord } from "./contentBuilder";

interface CreateRecordOptions {
  aliases?: string[];
  chemicalClasses?: string[];
  psychoactiveClasses?: string[];
  mechanismChips?: Array<{
    label: string;
    base: string;
    slug: string;
    qualifier?: string;
  }>;
}

const createRecord = (
  name: string,
  slug: string,
  options: CreateRecordOptions = {},
): SubstanceRecord => {
  const mechanisms = options.mechanismChips?.map((chip) => ({
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
  categories: [],
  indexCategories: [],
  chemicalClasses: options.chemicalClasses ?? [],
  psychoactiveClasses: options.psychoactiveClasses ?? [],
  priority: "normal",
  isHidden: false,
  isDirectUrlOnly: false,
  mechanisms,
  content: {
    name,
    aliases: options.aliases ?? [],
    nameVariants: [],
    moleculePlaceholder: "",
    heroBadges: [],
    categoryKeys: [],
    categories: [],
    dosageUnitsNote: "",
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
    infoSections: [],
    subtitle: "",
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

  it("ranks exact alternative-name matches above generic chemical keyword matches", () => {
    const library = createLibrary([
      createRecord("LSD", "lsd", {
        aliases: ["Acid"],
        chemicalClasses: ["Lysergamide"],
      }),
      createRecord("Generic Chemical", "generic-chemical", {
        aliases: [],
        chemicalClasses: ["Lysergic acid derivative"],
      }),
      createRecord("Acidamine", "acidamine", {
        aliases: [],
      }),
    ]);
    const index = buildSearchIndexFromLibrary(library);

    expect(index.query("acid").filter((match) => match.type === "substance").map((match) => match.label)).toEqual([
      "LSD",
      "Acidamine",
      "Generic Chemical",
    ]);
  });

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

  it("ranks own-name prefixes above alternative-name prefixes", () => {
    // Real "eth" case: ETH-LAD lost to 4-AcO-DET and Alcohol because an alias
    // prefix scored the same as a name prefix and ties fell back to alphabetical.
    const library = createLibrary([
      createRecord("4-AcO-DET", "4-aco-det", { aliases: ["Ethacetin", "Ethylacybin"] }),
      createRecord("Alcohol", "alcohol", { aliases: ["Ethanol"] }),
      createRecord("EPT", "ept", { aliases: ["Ethylpropyltryptamine"] }),
      createRecord("ETH-LAD", "eth-lad", { aliases: ["N-Ethyl-nor-LSD"] }),
      createRecord("Ethylone", "ethylone", { aliases: ["bk-MDEA"] }),
      createRecord("Ethketamine", "ethketamine"),
    ], { categories: [] });
    const index = buildSearchIndexFromLibrary(library);

    expect(index.query("eth").map((match) => match.label)).toEqual([
      // Name prefixes, shortest name first.
      "ETH-LAD",
      "Ethylone",
      "Ethketamine",
      // Alias prefixes, shortest matching alias first.
      "Alcohol",
      "4-AcO-DET",
      "EPT",
    ]);
  });

  it("ranks word-boundary name matches above mid-word name matches", () => {
    const library = createLibrary([
      createRecord("AL-LAD", "al-lad"),
      createRecord("ETH-LAD", "eth-lad"),
      createRecord("Gladamine", "gladamine"),
    ], { categories: [] });
    const index = buildSearchIndexFromLibrary(library);

    expect(index.query("lad").map((match) => match.label)).toEqual([
      "AL-LAD",
      "ETH-LAD",
      // "lad" sits mid-word here, so it ranks below both hyphenated names.
      "Gladamine",
    ]);
  });

  it("matches punctuation-insensitively so compact queries hit name tiers", () => {
    const library = createLibrary([
      createRecord("AL-LAD", "al-lad"),
      createRecord("1cP-AL-LAD", "1cp-al-lad"),
      createRecord("2C-B", "2c-b"),
      createRecord("ETH-LAD", "eth-lad"),
      createRecord("Hydromorphone", "hydromorphone", { aliases: ["Palladone"] }),
    ], { categories: [] });
    const index = buildSearchIndexFromLibrary(library);

    // Compact-exact name hit ranks as exact, above Palladone's substring hit.
    expect(index.query("allad").map((match) => match.label)).toEqual([
      "AL-LAD",
      "Hydromorphone",
    ]);
    expect(index.query("1cpallad")[0]?.label).toBe("1cP-AL-LAD");
    expect(index.query("2cb")[0]?.label).toBe("2C-B");
    expect(index.query("ethlad")[0]?.label).toBe("ETH-LAD");
    // Punctuation in the query folds away against the compact name too.
    expect(index.query("al lad")[0]?.label).toBe("AL-LAD");
  });

  it("keeps keyword matches below every name and alias match", () => {
    const library = createLibrary([
      createRecord("Some Stimulant", "some-stimulant", {
        psychoactiveClasses: ["Entactogen"],
      }),
      createRecord("Entac", "entac"),
      createRecord("Other", "other", { aliases: ["Entactolyte"] }),
    ], { categories: [] });
    const index = buildSearchIndexFromLibrary(library);

    expect(index.query("entac").map((match) => match.label)).toEqual([
      "Entac", // name prefix
      "Other", // alias prefix
      "Some Stimulant", // psychoactive-class keyword only
    ]);
  });
});
