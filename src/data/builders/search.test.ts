import { describe, it, expect } from "vitest";
import { querySearchWithData } from "./search";
import type { LibraryData } from "../SubstanceIndexProvider";
import type { SubstanceRecord } from "./contentBuilder";

const createRecord = (name: string, slug: string, categories: string[] = []): SubstanceRecord => ({
  id: null,
  name,
  slug,
  aliases: [],
  categories,
  indexCategories: categories,
  chemicalClasses: [],
  psychoactiveClasses: [],
  priority: "normal",
  isHidden: false,
  isLowPriority: false,
  content: {
    name,
    aliases: [],
    nameVariants: [],
    moleculePlaceholder: "",
    heroBadges: [],
    categoryKeys: [],
    categories,
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
    infoSections: [],
    subtitle: "",
  },
});

const createLibrary = (records: ReturnType<typeof createRecord>[]): LibraryData => ({
  articles: [],
  allSubstanceRecords: records,
  substanceRecords: records,
  allSubstancesBySlug: new Map(),
  substanceBySlug: new Map(),
  interactionIndex: new Map(),
  dosageCategoryGroups: records.map((record) => ({
    key: record.slug,
    name: record.name,
    icon: 'lucide:circle',
    total: 1,
    drugs: [{ name: record.name, slug: record.slug }],
  })),
  chemicalClassIndexGroups: [],
  mechanismIndexGroups: [],
  effectSummaries: [],
  mechanismSummaries: [],
  findCategoryByKey: (key: string) => ({
    key,
    name: key,
    aliases: [],
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
  getInteractionsForSubstance: () => undefined,
  buildCategoryGroupsForRecords: () => [],
});

describe("querySearchWithData", () => {
  it("returns matches for the current library and query", () => {
    const libraryA = createLibrary([createRecord("LSD", "lsd", ["Psychedelic"])]);
    const libraryB = createLibrary([createRecord("MDMA", "mdma", ["Entactogen"])]);

    const lsdResults = querySearchWithData("lsd", libraryA);
    expect(lsdResults[0]?.label).toBe("LSD");
    expect(lsdResults[0]?.type).toBe("substance");

    const mdmaResults = querySearchWithData("mdma", libraryB);
    expect(mdmaResults[0]?.label).toBe("MDMA");
    expect(mdmaResults[0]?.type).toBe("substance");
  });
});
