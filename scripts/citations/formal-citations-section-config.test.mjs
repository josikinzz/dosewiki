import { describe, expect, it } from "vitest";

import {
  CITABLE_ARTICLE_SURFACE,
  EXCLUDED_CITATION_SURFACE,
  FORMAL_CITATION_SECTION_CONFIG,
  isCitableSection,
  isExcludedCitationSection,
  normalizeFormalCitationSectionKey,
} from "./formal-citations-section-config.mjs";

describe("formal citations section config", () => {
  it("defines the canonical six-section citable article surface", () => {
    expect(CITABLE_ARTICLE_SURFACE).toEqual([
      "summary",
      "pharmacology",
      "tolerance",
      "harm_potential",
      "history_culture",
      "legality",
    ]);
    expect(Object.isFrozen(CITABLE_ARTICLE_SURFACE)).toBe(true);
  });

  it("derives the citable surface from the section config so the two cannot drift", () => {
    const configKeys = FORMAL_CITATION_SECTION_CONFIG.map((entry) => entry.key);
    expect([...CITABLE_ARTICLE_SURFACE].sort()).toEqual([...configKeys].sort());
  });

  it("defines the excluded citation surface", () => {
    expect(EXCLUDED_CITATION_SURFACE).toEqual([
      "dosage",
      "duration",
      "subjective_effects",
      "comparisons",
      "reagent_testing",
      "interactions",
      "identification",
      "classification",
    ]);
    expect(Object.isFrozen(EXCLUDED_CITATION_SURFACE)).toBe(true);
  });

  it("keeps the citable and excluded surfaces disjoint", () => {
    for (const key of EXCLUDED_CITATION_SURFACE) {
      expect(CITABLE_ARTICLE_SURFACE).not.toContain(key);
    }
  });

  it("answers section membership through the helpers", () => {
    expect(isCitableSection("legality")).toBe(true);
    expect(isCitableSection("dosage")).toBe(false);
    expect(isCitableSection("not_a_section")).toBe(false);
    expect(isExcludedCitationSection("dosage")).toBe(true);
    expect(isExcludedCitationSection("legality")).toBe(false);
  });

  it("normalizes legacy section keys onto the canonical surface", () => {
    expect(normalizeFormalCitationSectionKey("harm-potential")).toBe("harm_potential");
    expect(normalizeFormalCitationSectionKey("history-culture")).toBe("history_culture");
    expect(normalizeFormalCitationSectionKey("dosage")).toBeNull();
  });
});
