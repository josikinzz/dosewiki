import { describe, expect, it } from "vitest";
import { getPublicHref, publicHref } from "./publicHref";

describe("publicHref", () => {
  it("generates substance, effect, category, and dosage category hrefs", () => {
    expect(publicHref.substance("lsd")).toBe("/lsd");
    expect(publicHref.effect("visual-drifting")).toBe("/effects/visual-drifting");
    expect(publicHref.effectFromName("Visual drifting")).toBe("/effects/visual-drifting");
    expect(publicHref.effectCategory("visual-effects")).toBe("/effects/category/visual-effects");
    expect(publicHref.category("classic psychedelics")).toBe("/category/classic%20psychedelics");
    expect(publicHref.dosageCategory("psychedelics")).toBe("/category/psychedelics");
  });

  it("generates mechanism hrefs with and without qualifiers", () => {
    expect(publicHref.mechanism("serotonin-5-ht2a")).toBe("/mechanism/serotonin-5-ht2a");
    expect(publicHref.mechanism("serotonin-5-ht2a", "partial-agonist")).toBe(
      "/mechanism/serotonin-5-ht2a/partial-agonist",
    );
    expect(publicHref.mechanismFromLabel("Serotonin 5-HT2A", "Partial agonist")).toBe(
      "/mechanism/serotonin-5-ht2a/partial-agonist",
    );
  });

  it("generates chemical and psychoactive classification hrefs from labels or slugs", () => {
    expect(publicHref.classification("chemical", "Lysergamide")).toBe("/chemical/lysergamide");
    expect(publicHref.classification("psychoactive", "Classic Psychedelic")).toBe(
      "/psychoactive/classic-psychedelic",
    );
    expect(publicHref.classification("psychoactive", "entactogen")).toBe("/psychoactive/entactogen");
  });

  it("generates report hrefs with optional source context", () => {
    expect(publicHref.reports()).toBe("/reports");
    expect(publicHref.report("first-trip")).toBe("/reports/first-trip");
    expect(publicHref.report("first-trip", { fromSubstanceSlug: "1p-lsd" })).toBe(
      "/reports/first-trip?from=1p-lsd",
    );
    expect(publicHref.report("first-trip", { fromSubstanceSlug: "magic mushrooms" })).toBe(
      "/reports/first-trip?from=magic%20mushrooms",
    );
  });

  it("locks rendered contributor key normalization and encoding", () => {
    expect(publicHref.contributor("Ada Lovelace")).toBe("/contributors/ada%20lovelace");
    expect(publicHref.contributor("ADA@Example.COM")).toBe("/contributors/ada%40example.com");
    expect(publicHref.contributor("Josie/Kins")).toBe("/contributors/josie%2Fkins");
    expect(publicHref.contributor("Ada Lovelace", { normalizeKey: false })).toBe(
      "/contributors/Ada%20Lovelace",
    );
  });

  it("generates search query hrefs", () => {
    expect(publicHref.search()).toBe("/search");
    expect(publicHref.search("test query")).toBe("/search/test%20query");
    expect(publicHref.search(" mdma/mdai ")).toBe("/search/mdma%2Fmdai");
  });

  it("supports a discriminated intent adapter", () => {
    expect(getPublicHref({ type: "substance", slug: "lsd" })).toBe("/lsd");
    expect(getPublicHref({ type: "classification", classification: "chemical", slugOrLabel: "Tryptamine" })).toBe(
      "/chemical/tryptamine",
    );
    expect(getPublicHref({ type: "report", slug: "first-trip", fromSubstanceSlug: "lsd" })).toBe(
      "/reports/first-trip?from=lsd",
    );
  });
});
