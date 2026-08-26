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

  it("links chemical classifications to curated chemical-class detail pages", () => {
    expect(publicHref.classification("chemical", "Lysergamide")).toBe("/chemical-classes/lysergamide");
    expect(publicHref.classification("chemical", "Phenethylamine (substituted)")).toBe(
      "/chemical-classes/phenethylamine",
    );
    expect(publicHref.classification("chemical", "Tryptamine")).toBe("/chemical-classes/tryptamine");
    expect(publicHref.classification("chemical", "Not A Real Class")).toBe("/chemical-classes");
  });

  it("deep-links psychoactive classifications to routed Substance Index views", () => {
    expect(publicHref.classification("psychoactive", "Psychedelic")).toBe(
      "/substances/group/psychedelic",
    );
    expect(publicHref.classification("psychoactive", "Stimulant")).toBe(
      "/substances/group/stimulant",
    );
    expect(publicHref.classification("psychoactive", "Opioid")).toBe(
      "/substances/group/opioid",
    );
    expect(publicHref.classification("psychoactive", "entactogen")).toBe(
      "/substances/group/entactogen",
    );
    expect(publicHref.classification("psychoactive", "Classic Psychedelic")).toBe(
      "/substances",
    );
    expect(publicHref.classification("psychoactive", "")).toBe("/substances");
  });

  it("maps psychoactive aliases to their canonical routed view", () => {
    expect(publicHref.classification("psychoactive", "Depressant")).toBe(
      "/substances/group/depressants",
    );
    expect(publicHref.classification("psychoactive", "Sedative")).toBe(
      "/substances/group/depressants",
    );
    expect(publicHref.classification("psychoactive", "Hallucinogen")).toBe(
      "/substances/group/hallucinogens",
    );
    expect(publicHref.classification("psychoactive", "Eugeroic")).toBe(
      "/substances/group/stimulant",
    );
    expect(publicHref.classification("psychoactive", "Entheogen")).toBe(
      "/substances/group/psychedelic",
    );
    expect(publicHref.classification("psychoactive", "Empathogen")).toBe(
      "/substances/group/entactogen",
    );
  });

  it("generates report hrefs with optional source context", () => {
    expect(publicHref.reports()).toBe("/reports");
    expect(publicHref.reportSubmission()).toBe("/reports/submit");
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
    expect(publicHref.search("test query")).toBe("/search?q=test%20query");
    expect(publicHref.search(" mdma/mdai ")).toBe("/search?q=mdma%2Fmdai");
  });

  it("supports a discriminated intent adapter", () => {
    expect(getPublicHref({ type: "substance", slug: "lsd" })).toBe("/lsd");
    expect(getPublicHref({ type: "classification", classification: "chemical", slugOrLabel: "Tryptamine" })).toBe(
      "/chemical-classes/tryptamine",
    );
    expect(getPublicHref({ type: "report", slug: "first-trip", fromSubstanceSlug: "lsd" })).toBe(
      "/reports/first-trip?from=lsd",
    );
    expect(getPublicHref({ type: "report-submission" })).toBe("/reports/submit");
  });
});
