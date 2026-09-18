import { describe, it, expect } from "vitest";
import {
  buildSearchIndex,
  buildSearchIndexFromLibrary,
  createSearchIndexInput,
  getSearchIndexInputHash,
  querySearchWithData,
} from "./search";
import type { LibraryData } from "../SubstanceIndexProvider";
import type { SubstanceRecord } from "./contentBuilder";
import type { EffectDetail } from "./library";

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
  isDirectUrlOnly: false,
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
    effectDetails?: Record<string, EffectDetail>;
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
  getEffectDetail: (effectSlug: string) => options.effectDetails?.[effectSlug] ?? null,
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
        report: 0,
        profile: 0,
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

    expect(index.query("comm").map((match) => match.label)).toEqual([
      "Common Large",
      "Common",
    ]);
    expect(index.query("glo").map((match) => match.label)).toEqual([
      "Glow Strong",
      "Glow",
    ]);
  });

  it("indexes public reports and contributor profiles", () => {
    const library = createLibrary([], {
      categories: [{ key: "dmt-category", name: "DMT category", total: 20 }],
    });
    const input = createSearchIndexInput(library, {
      reports: [
        {
          title: "A careful DMT evening",
          slug: "careful-dmt-evening",
          author: "Ada Lovelace",
          substanceNames: ["DMT"],
          substances: [{ name: "DMT", dose: "30mg", roa: "vaporized" }],
          introduction: "A short report about dimethyltryptamine. The first effects arrived quickly.",
          featured: true,
          tripDate: "2026-04-20",
          age: "29",
          weight: "150lb",
          height: "5'8\"",
          authorProfileKey: "ADA",
        },
      ],
      profiles: [
        {
          key: "ADA",
          displayName: "Ada Lovelace",
          bio: "Contributor focused on DMT reports.",
          hasCustomBio: true,
        },
      ],
    });

    const built = buildSearchIndex(input);
    expect(built.metadata.entryCounts).toEqual({
      substance: 0,
      category: 1,
      effect: 0,
      report: 1,
      profile: 1,
      total: 3,
    });
    expect(built.query("ada").map((match) => [match.type, match.label])).toEqual([
      ["profile", "Ada Lovelace"],
      ["report", "A careful DMT evening"],
    ]);
    expect(built.query("dimethyltryptamine")[0]).toMatchObject({
      type: "report",
      slug: "careful-dmt-evening",
      secondary: "DMT (30mg, vaporized) · age 29 · 150lb · 5'8\" · 2026-04-20",
      description: "A short report about dimethyltryptamine. The first effects arrived quickly.",
    });
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

  it("keeps report metadata separate from report narrative descriptions", () => {
    const library = createLibrary([]);
    const input = createSearchIndexInput(library, {
      reports: [
        {
          title: "Ego death and unity with a friend",
          slug: "ego-death-and-unity-with-a-friend",
          author: "EmoBoy",
          substanceNames: ["DMT"],
          introduction: "I loaded the pipe and watched the room fold into itself.",
          featured: false,
        },
      ],
    });
    const index = buildSearchIndex(input);

    expect(index.query("ego death")[0]).toMatchObject({
      type: "report",
      secondary: "DMT",
      description: "I loaded the pipe and watched the room fold into itself.",
    });
  });

  it("filters reports to the top matched substance when a substance wins the query", () => {
    const library = createLibrary([
      createRecord("DMT", "dmt", { aliases: ["N,N-Dimethyltryptamine"] }),
      createRecord("4-PrO-DMT", "4-pro-dmt"),
    ]);
    const input = createSearchIndexInput(library, {
      reports: [
        {
          title: "A Pleasant Morning",
          slug: "a-pleasant-morning",
          author: "Author",
          substanceNames: ["4-PrO-DMT"],
          substances: [{ name: "4-PrO-DMT", dose: "15mg", roa: "Oral" }],
          introduction: "Narrative for the 4-PrO-DMT report.",
          featured: false,
        },
        {
          title: "Ego death and unity with a friend",
          slug: "ego-death-and-unity-with-a-friend",
          author: "Author",
          substanceNames: ["DMT"],
          substances: [{ name: "DMT", dose: "40mg", roa: "Smoked" }],
          introduction: "Narrative for the DMT report.",
          featured: false,
        },
      ],
    });
    const index = buildSearchIndex(input);
    const reportMatches = index.query("dmt").filter((match) => match.type === "report");

    expect(reportMatches.map((match) => match.label)).toEqual([
      "Ego death and unity with a friend",
    ]);
    expect(reportMatches[0]).not.toHaveProperty("reportSubstanceKeys");
  });

  it("matches reports through alternative names for their canonical substances", () => {
    const library = createLibrary([
      createRecord("LSD", "lsd", { aliases: ["Acid"] }),
      createRecord("MDMA", "mdma", { aliases: ["Molly", "Ecstasy"] }),
    ]);
    const input = createSearchIndexInput(library, {
      reports: [
        {
          title: "Awkward acid evening",
          slug: "awkward-acid-evening",
          author: "Author",
          substanceNames: ["ETH-LAD"],
          substances: [{ name: "ETH-LAD", dose: "200ug", roa: "Sublingual" }],
          introduction: "A report whose title mentions acid without using LSD.",
          featured: false,
        },
        {
          title: "Walking through city lights",
          slug: "walking-through-city-lights",
          author: "Author",
          substanceNames: ["LSD"],
          substances: [{ name: "LSD", dose: "100ug", roa: "Oral" }],
          introduction: "A long evening of visuals and reflection.",
          featured: false,
        },
        {
          title: "Dancing until sunrise",
          slug: "dancing-until-sunrise",
          author: "Author",
          substanceNames: ["MDMA"],
          substances: [{ name: "MDMA", dose: "120mg", roa: "Oral" }],
          introduction: "A night focused on empathy and music.",
          featured: false,
        },
        {
          title: "Mixed empathogen night",
          slug: "mixed-empathogen-night",
          author: "Author",
          substanceNames: ["MDMA", "MDA"],
          substances: [
            { name: "MDMA", dose: "80mg", roa: "Oral" },
            { name: "MDA", dose: "40mg", roa: "Oral" },
          ],
          introduction: "A combined report that includes the top matched substance.",
          featured: false,
        },
      ],
    });
    const index = buildSearchIndex(input);

    expect(index.query("acid").filter((match) => match.type === "report").map((match) => match.label)).toEqual([
      "Walking through city lights",
    ]);
    expect(index.query("molly").filter((match) => match.type === "report").map((match) => match.label)).toEqual([
      "Dancing until sunrise",
      "Mixed empathogen night",
    ]);
  });

  it("matches effects whose related substances match the search query", () => {
    const library = createLibrary(
      [createRecord("DMT", "dmt", { aliases: ["N,N-Dimethyltryptamine"] })],
      {
        effects: [
          { name: "Geometry", slug: "geometry", total: 1 },
          { name: "Respiratory depression", slug: "respiratory-depression", total: 1 },
        ],
        effectDetails: {
          geometry: {
            definition: { name: "Geometry", slug: "geometry", total: 1 },
            groups: [
              {
                key: "psychedelic",
                name: "Psychedelic",
                icon: "lucide:circle",
                total: 1,
                drugs: [{ name: "DMT", slug: "dmt", alias: "N,N-Dimethyltryptamine" }],
              },
            ],
          },
          "respiratory-depression": {
            definition: {
              name: "Respiratory depression",
              slug: "respiratory-depression",
              total: 1,
            },
            groups: [
              {
                key: "depressant",
                name: "Depressant",
                icon: "lucide:circle",
                total: 1,
                drugs: [{ name: "Alcohol", slug: "alcohol" }],
              },
            ],
          },
        },
      },
    );
    const index = buildSearchIndexFromLibrary(library);
    const effectMatches = index.query("dmt").filter((match) => match.type === "effect");

    expect(effectMatches.map((match) => match.label)).toEqual(["Geometry"]);
  });

  it("matches effects through public effect article related text", () => {
    const library = createLibrary([], {
      effects: [
        { name: "Breakthrough", slug: "breakthrough", total: 0 },
        { name: "Nausea", slug: "nausea", total: 0 },
      ],
    });
    const input = createSearchIndexInput(library, {
      effectDefinitions: [
        {
          slug: "breakthrough",
          summary: "A sudden transition into an immersive state.",
          description_raw: "This effect is commonly discussed in relation to DMT experiences.",
        },
        {
          slug: "nausea",
          summary: "An uncomfortable physical sensation.",
          description_raw: "This effect is commonly discussed in relation to alcohol.",
        },
      ],
    });
    const index = buildSearchIndex(input);
    const effectMatches = index.query("dmt").filter((match) => match.type === "effect");

    expect(effectMatches.map((match) => match.label)).toEqual(["Breakthrough"]);
  });

  it("matches effects to substances through shared public effect tags and substance classes", () => {
    const library = createLibrary(
      [
        createRecord("DMT", "dmt", {
          aliases: ["N,N-Dimethyltryptamine"],
          psychoactiveClasses: ["Psychedelic"],
        }),
      ],
      {
        effects: [
          { name: "Geometry", slug: "geometry", total: 0 },
          { name: "Sedation", slug: "sedation", total: 0 },
        ],
      },
    );
    const input = createSearchIndexInput(library, {
      effectDefinitions: [
        {
          slug: "geometry",
          summary: "Complex visual geometry.",
          tags: ["psychedelic", "visual"],
        },
        {
          slug: "sedation",
          summary: "A decrease in alertness.",
          tags: ["depressant"],
        },
      ],
    });
    const index = buildSearchIndex(input);
    const effectMatches = index.query("dmt").filter((match) => match.type === "effect");

    expect(effectMatches.map((match) => match.label)).toEqual(["Geometry"]);
  });

  it("uses public effect summaries as effect search descriptions", () => {
    const library = createLibrary([], {
      effects: [{ name: "Tracers", slug: "tracers", total: 9 }],
    });
    const input = createSearchIndexInput(library, {
      effectDefinitions: [
        {
          slug: "tracers",
          summary: "Tracers are trails that appear behind moving objects.",
        },
      ],
    });
    const index = buildSearchIndex(input);

    expect(index.query("tracers")[0]).toMatchObject({
      type: "effect",
      secondary: "Tracers are trails that appear behind moving objects.",
    });
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

  it("prefers the name the query covers most when scores tie", () => {
    const library = createLibrary([
      createRecord("Ethylphenidate", "ethylphenidate"),
      createRecord("Ethylmorphine", "ethylmorphine"),
      createRecord("Ethylone", "ethylone"),
    ], { categories: [] });
    const index = buildSearchIndexFromLibrary(library);

    expect(index.query("ethyl").map((match) => match.label)).toEqual([
      "Ethylone",
      "Ethylmorphine",
      "Ethylphenidate",
    ]);
  });

  it("prefers the shortest matching alias so systematic names rank last", () => {
    const library = createLibrary([
      createRecord("NEP", "nep", { aliases: ["Ethyl-pentedrone"] }),
      createRecord("Noopept", "noopept", {
        aliases: ["Ethyl 2-[[(2S)-1-(2-phenylacetyl)pyrrolidine-2-carbonyl]amino]acetate"],
      }),
    ], { categories: [] });
    const index = buildSearchIndexFromLibrary(library);

    expect(index.query("ethyl").map((match) => match.label)).toEqual(["NEP", "Noopept"]);
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

  it("omits internal scoring fields from returned matches", () => {
    const library = createLibrary([createRecord("LSD", "lsd", { aliases: ["Acid"] })]);
    const index = buildSearchIndexFromLibrary(library);
    const [match] = index.query("lsd");

    expect(match).toBeDefined();
    expect(match).not.toHaveProperty("matchLength");
    expect(match).not.toHaveProperty("identityBlob");
    expect(match).not.toHaveProperty("keywordBlob");
    expect(match).not.toHaveProperty("labelLower");
    expect(match).not.toHaveProperty("aliasLowers");
  });

  it("keeps index entries free of the internal match blobs", () => {
    const library = createLibrary([createRecord("LSD", "lsd", { aliases: ["Acid"] })]);
    const index = buildSearchIndexFromLibrary(library);

    expect(index.entries[0]).not.toHaveProperty("keywordBlob");
    expect(index.entries[0]).not.toHaveProperty("identityBlob");
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
