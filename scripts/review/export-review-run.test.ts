import { describe, expect, it } from "vitest";

import {
  derivePresenceSidecar,
  parseReviewExportOptions,
  renderReviewMarkdown,
  selectReviewArticles,
} from "./export-review-run";

const emptyRange = { min: null, max: null, unit: "mg" };
const fixture = {
  title: "Fixture",
  slug: "fixture",
  priority: "normal",
  index_categories: [],
  summary: "A summary.[cite:summary-source]",
  classification: { psychoactive_class: ["Psychedelic"], chemical_class: [] },
  dosage: {
    routes: [{
      route: "Oral",
      bioavailability: "",
      bioavailability_notes: "",
      notes: "",
      reference_ids: ["dose-source"],
      dose_ranges: { ...Object.fromEntries(["threshold", "light", "moderate", "strong", "heavy"].map((tier) => [tier, emptyRange])), moderate: { min: 10, max: 20, unit: "mg" } },
    }],
    plateau_dosing: null,
  },
  duration: {
    routes: [{
      route: "Oral",
      half_life: "",
      half_life_notes: "",
      reference_ids: [],
      stages: { ...Object.fromEntries(["onset", "come_up", "peak", "offset", "after_effects", "total_duration"].map((stage) => [stage, { min: null, max: null, unit: "hours" }])), onset: { min: 1, max: 2, unit: "hours" } },
    }],
  },
  subjective_effects: { notes: {}, sensory: {}, cognitive: {}, physical: {} },
  pharmacology: { pharmacodynamics: "Receptor activity.", pharmacokinetics: "", receptor_profile: [], metabolites: [] },
  interactions: { dangerous: ["MAOIs"], unsafe: [], caution: [] },
  tolerance: { full_tolerance: "Builds rapidly.", half_tolerance: "", baseline_tolerance: "", cross_tolerance: [] },
  harm_potential: {},
  legality: { international: [], countries: {} },
  references: [{ id: "summary-source", title: "Source", authors: [], sourceType: "unknown", quality: "fallback" }],
  citations: [],
  editorial_review: { status: "completed", notes: "private review content" },
};

describe("Review Run article selection", () => {
  const articles = [
    fixture,
    { ...fixture, slug: "hidden", title: "Hidden", index_categories: ["Hidden"] },
    { ...fixture, slug: "low", title: "Low", priority: "low" },
  ];

  it("selects publicly listed articles by default", () => {
    const options = parseReviewExportOptions([], "2026-08-02");
    expect(options.runId).toBe("article-review-2026-08-02");
    expect(selectReviewArticles(articles, options).map((article) => article.slug)).toEqual(["fixture"]);
  });

  it("widens selection with visibility flags and explicit repeated slugs", () => {
    expect(selectReviewArticles(articles, parseReviewExportOptions(["--include-hidden", "--include-low-priority"], "2026-08-02")).map((article) => article.slug)).toEqual(["fixture", "hidden", "low"]);
    expect(selectReviewArticles(articles, parseReviewExportOptions(["--article=hidden", "--article=low"], "2026-08-02")).map((article) => article.slug)).toEqual(["hidden", "low"]);
  });
});

describe("Review Run rendering", () => {
  it("renders deterministically without metadata or editorial review content", () => {
    const first = renderReviewMarkdown({ ...fixture, _id: "internal", _creationTime: 1 });
    expect(renderReviewMarkdown({ ...fixture, _id: "internal", _creationTime: 1 })).toBe(first);
    expect(first).toContain("| Moderate | 10–20 mg |");
    expect(first).toContain("| Onset | 1–2 hours |");
    expect(first).not.toContain("private review content");
    expect(first).not.toContain("_creationTime");
  });

  it("derives structural presence, route populations, subsections, citations, and interactions", () => {
    expect(derivePresenceSidecar(fixture)).toMatchObject({
      sections: { "dosage-duration": true, pharmacology: true, interactions: true, "harm-potential": false },
      dosage: { populatedTiersByRoute: { Oral: ["moderate"] } },
      duration: { populatedStagesByRoute: { Oral: ["onset"] } },
      pharmacology: { present: true, pharmacodynamics: true, pharmacokinetics: false },
      interactions: { present: true },
      citations: { summary: { present: true, count: 1 }, "dosage-duration": { present: true, count: 1 } },
    });
  });
});
