import { describe, expect, it } from "vitest";

import {
  getAvailabilityQuoteSectionIds,
  getLocalQuoteArtifactDescriptors,
  getQuoteExtractionCategories,
  normalizeQuoteSectionId,
  requireQuoteSection,
} from "./quoteSections.mjs";
import { SUBSTANCE_SECTION_MANIFEST } from "../src/schema/substance/sectionManifest";

describe("quote section contract", () => {
  it("normalizes canonical section ids and legacy extraction aliases", () => {
    expect(normalizeQuoteSectionId("harm_potential")).toBe("harm_potential");
    expect(normalizeQuoteSectionId("harm-potential")).toBe("harm_potential");
    expect(normalizeQuoteSectionId("harmpotential")).toBe("harm_potential");
    expect(normalizeQuoteSectionId("subjective-effects")).toBe("subjective_effects");
    expect(normalizeQuoteSectionId("intro-text")).toBe("summary");
  });

  it("rejects unknown quote sections at the contract interface", () => {
    expect(normalizeQuoteSectionId("effects")).toBeNull();
    expect(() => requireQuoteSection("effects")).toThrow("Unknown quote section: effects");
  });

  it("owns availability membership and output artifact metadata", () => {
    expect(getAvailabilityQuoteSectionIds()).toEqual([
      "summary",
      "harm_potential",
      "pharmacology",
      "history_culture",
      "dosage_duration",
      "tolerance",
      "legality",
      "subjective_effects",
    ]);

    expect(getLocalQuoteArtifactDescriptors()).toContainEqual({
      path: "../../quotes/history-culture-quotes",
      section: "history_culture",
      suffix: "-history-culture.md",
      storageMode: "data",
    });
  });

  it("derives batch extraction categories from descriptors with prompt files", () => {
    const categories = getQuoteExtractionCategories();

    expect(Object.keys(categories).sort()).toEqual([
      "dosage-duration",
      "harm-potential",
      "history-culture",
      "intro-text",
      "legality",
      "pharmacology",
      "subjective-effects",
      "tolerance",
    ]);
    expect(categories["subjective-effects"]).toMatchObject({
      section: "subjective_effects",
      promptFile: "subjective-effects-extraction.md",
      outputSuffix: "-subjective-effects.md",
      excludedSources: ["psychonautwiki", "disregardeverythingisay"],
    });
  });

  it("keeps quote-backed generator sections aligned with the article section catalog", () => {
    const catalogQuoteSections = SUBSTANCE_SECTION_MANIFEST.flatMap((entry) =>
      entry.generator?.quoteSection ? [entry.generator.quoteSection] : [],
    ).sort();

    expect([...getAvailabilityQuoteSectionIds()].sort()).toEqual(catalogQuoteSections);
  });
});
