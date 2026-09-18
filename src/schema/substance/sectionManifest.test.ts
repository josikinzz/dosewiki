import { describe, expect, it } from "vitest";
import { createEmptyArticle } from "@/data/schema/defaults.generated";
import {
  getCatalogSectionPromptDescriptors,
  getCatalogSchemaSections,
  getEditorSectionEntries,
  getPublicTocSectionEntries,
  SUBSTANCE_SECTION_MANIFEST,
} from "./sectionManifest";

describe("substance section manifest", () => {
  it("defines each public TOC section with unique ids, labels, icons, presence policy, and renderer adapters", () => {
    const publicTocEntries = getPublicTocSectionEntries();
    const ids = publicTocEntries.map((entry) => entry.id);

    expect(new Set(ids).size).toBe(ids.length);

    for (const entry of publicTocEntries) {
      expect(entry.label.trim()).not.toBe("");
      expect(entry.icon.trim()).not.toBe("");
      expect(entry.public.isPresent).toBeTypeOf("function");
      expect(entry.public.renderer).toBeDefined();
    }
  });

  it("defines an editor form adapter for every editor-visible section", () => {
    for (const entry of getEditorSectionEntries()) {
      expect(entry.editor.adapter).toBeDefined();
    }
  });

  it("defines prompt keys and quote-section policy for generator-enabled sections", () => {
    const generatorEntries = SUBSTANCE_SECTION_MANIFEST.filter((entry) => entry.generator);

    expect(generatorEntries.map((entry) => entry.id)).toEqual([
      "classification",
      "summary",
      "dosage-duration",
      "subjective-effects",
      "pharmacology",
      "interactions",
      "tolerance",
      "harm-potential",
      "history-culture",
      "legality",
    ]);

    for (const entry of generatorEntries) {
      expect(entry.generator?.promptKey).toBeDefined();
      expect(entry.generator?.quoteSection).not.toBeUndefined();
      if (entry.generator?.quoteSection) {
        expect(entry.generator.quoteSection).toBe(entry.generator.promptKey);
      }
    }
  });

  it("derives schema section groups and section prompt descriptors from the section catalog", () => {
    expect(getCatalogSchemaSections().map((section) => section.key)).toEqual([
      "meta",
      "identification",
      "classification",
      "dosage",
      "duration",
      "subjective_effects",
      "pharmacology",
      "interactions",
      "tolerance",
      "harm_potential",
      "legality",
      "citations",
    ]);

    expect(getCatalogSectionPromptDescriptors().map((descriptor) => descriptor.sectionKey)).toEqual([
      "identification",
      "summary",
      "dosage_duration",
      "subjective_effects",
      "pharmacology",
      "interactions",
      "tolerance",
      "harm_potential",
      "history_culture",
      "legality",
    ]);
  });

  it("keeps editorial review editor-visible and hidden from public article surfaces", () => {
    const editorialReview = SUBSTANCE_SECTION_MANIFEST.find(
      (entry) => entry.id === "editorial-review",
    );

    expect(editorialReview).toBeDefined();
    expect(editorialReview?.articleFields).toEqual(["editorial_review"]);
    expect(editorialReview?.editor.visible).toBe(true);
    expect(editorialReview?.editor.editorOnly).toBe(true);
    expect(editorialReview?.public.visible).toBe(false);
    expect(editorialReview?.public.toc).toBe(false);
    expect(editorialReview?.public.renderer).toBeUndefined();
  });

  it("matches the current TOC presence examples for public article sections", () => {
    const article = {
      ...createEmptyArticle(),
      dosage: {
        ...createEmptyArticle().dosage,
        routes: [
          {
            route: "oral",
            bioavailability: "",
            bioavailability_notes: "",
            dose_ranges: {
              threshold: { min: 1, max: 1, unit: "mg" },
              light: { min: 2, max: 3, unit: "mg" },
              moderate: { min: 4, max: 5, unit: "mg" },
              strong: { min: 6, max: 7, unit: "mg" },
              heavy: { min: 8, max: null, unit: "mg" },
            },
            notes: "",
          },
        ],
      },
      duration: {
        routes: [
          {
            route: "oral",
            half_life: "",
            half_life_notes: "",
            stages: {
              onset: { min: 10, max: 20, unit: "minutes" },
              come_up: { min: 20, max: 30, unit: "minutes" },
              peak: { min: 1, max: 2, unit: "hours" },
              offset: { min: 1, max: 2, unit: "hours" },
              total_duration: { min: 3, max: 5, unit: "hours" },
              after_effects: { min: 1, max: 2, unit: "hours" },
            },
          },
        ],
      },
      pharmacology: {
        ...createEmptyArticle().pharmacology,
        pharmacodynamics: "Partial agonist activity.",
      },
      interactions: {
        dangerous: ["MAOIs"],
        unsafe: [],
        caution: [],
      },
      tolerance: {
        ...createEmptyArticle().tolerance,
        full_tolerance: "Develops after repeated use.",
      },
      harm_potential: {
        addiction: undefined,
        toxicity: undefined,
        psychosis: { level: "low" as const, description: "Rare in screened populations." },
        seizure: undefined,
      },
      legality: {
        international: ["UN schedule I"],
        countries: {},
      },
      classification: {
        psychoactive_class: ["psychedelic"],
        chemical_class: ["tryptamine"],
      },
    };

    const presentIds = getPublicTocSectionEntries()
      .filter((entry) => entry.public.isPresent?.(article))
      .map((entry) => entry.id);

    expect(presentIds).toEqual([
      "dosage-duration",
      "pharmacology",
      "interactions",
      "tolerance",
      "harm-potential",
      "legality",
    ]);
    expect(presentIds).not.toContain("classification");
  });

  it("supports reagent TOC presence from static, loading, or external reagent data", () => {
    const reagentEntry = getPublicTocSectionEntries().find(
      (entry) => entry.id === "reagent-testing",
    );
    const emptyArticle = createEmptyArticle();

    expect(reagentEntry?.public.isPresent?.(emptyArticle)).toBe(false);
    expect(
      reagentEntry?.public.isPresent?.(emptyArticle, {
        isLoadingExternalReagentData: true,
      }),
    ).toBe(true);
    expect(
      reagentEntry?.public.isPresent?.(emptyArticle, {
        hasExternalReagentData: true,
      }),
    ).toBe(true);
    expect(
      reagentEntry?.public.isPresent?.({
        ...emptyArticle,
        reagent_testing: { marquis: "purple" },
      }),
    ).toBe(true);
  });

  it("keeps the public sources section present when only structured references exist", () => {
    const sourcesEntry = getPublicTocSectionEntries().find((entry) => entry.id === "sources");
    const article = {
      ...createEmptyArticle(),
      references: [
        {
          id: "paper-one",
          type: "webpage" as const,
          title: "Paper One",
          authors: [],
          url: "https://example.test/paper",
          sourceType: "unknown" as const,
          quality: "fallback" as const,
        },
      ],
    };

    expect(sourcesEntry?.public.isPresent?.(article)).toBe(true);
  });
});
