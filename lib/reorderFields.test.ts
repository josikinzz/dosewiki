import { describe, expect, it } from "vitest";

import { reorderArticle } from "../scripts/data/reorder-fields/index.mjs";
import { contentHash, countPrimitives, validateReordering } from "../scripts/data/reorder-fields/validation.mjs";

describe("reorder-fields", () => {
  it("reorders known article fields while preserving unknown fields at the end", () => {
    const article = {
      title: "Fixtureamine",
      id: 7,
      citations: [{ url: "https://example.com", name: "Example", note: "preserve me" }],
      summary: "Summary text",
      classification: {
        chemical_class: ["Phenethylamine"],
        psychoactive_class: ["Stimulant"],
        custom_bucket: "unexpected",
      },
      identification: {
        smiles: "CC",
        common_name: "Fixtureamine",
        custom_identifier: "keep",
      },
      dosage: {
        plateau_dosing: {
          notes: "plateau note",
          second_plateau: { effects: ["focus"], unit: "mg", max: 20, min: 10 },
        },
        routes: [
          {
            notes: "oral",
            dose_ranges: {
              moderate: { unit: "mg", max: 20, min: 10, custom_range: "keep" },
              threshold: { unit: "mg", min: 5, max: null },
            },
            route: "Oral",
            bioavailability_notes: "",
            bioavailability: "80%",
            custom_route_field: "preserve",
          },
        ],
      },
      duration: {
        routes: [
          {
            stages: {
              peak: { unit: "hours", max: 3, min: 2 },
              onset: { unit: "minutes", max: 45, min: 20 },
            },
            route: "Oral",
            half_life_notes: "",
            half_life: "4h",
          },
        ],
      },
      subjective_effects: {
        attribution: { url: "https://example.com", text: "Text", author: "Author" },
        physical: {
          stimulation: {
            effects: [{ description: "Energy", name: "Stimulation" }],
            note: "present",
          },
        },
        notes: { physical: "", overview: "", cognitive: "", sensory: "" },
      },
      harm_potential: {
        risks: { other: "risk", psychosis: "low" },
        dependence_liability: "low",
        toxicity: { other: "other", ld50: "unknown" },
        addiction_liability: "low",
      },
      history_culture: {
        sections: [
          {
            icon: "book",
            subsections: [{ date_range: { end: "2000", start: "1990" }, content: "Text", heading: "Sub" }],
            date_range: { end: "1980", start: "1970" },
            content: "History",
            heading: "Origins",
          },
        ],
        content: "Overview",
      },
      legality: {
        countries: {
          Canada: { notes: "Controlled", status: "Schedule" },
        },
        international: ["UN schedule"],
      },
      unexpected_tail: "kept",
    };

    const reordered = reorderArticle(article, 0);

    expect(Object.keys(reordered)).toEqual([
      "id",
      "title",
      "identification",
      "classification",
      "summary",
      "dosage",
      "duration",
      "subjective_effects",
      "harm_potential",
      "history_culture",
      "legality",
      "citations",
      "unexpected_tail",
    ]);
    expect(Object.keys(reordered.identification)).toEqual(["common_name", "smiles", "custom_identifier"]);
    expect(Object.keys(reordered.classification)).toEqual([
      "psychoactive_class",
      "chemical_class",
      "custom_bucket",
    ]);
    expect(Object.keys(reordered.dosage.routes[0])).toEqual([
      "route",
      "bioavailability",
      "bioavailability_notes",
      "dose_ranges",
      "notes",
      "custom_route_field",
    ]);
    expect(Object.keys(reordered.dosage.routes[0].dose_ranges.moderate)).toEqual([
      "min",
      "max",
      "unit",
      "custom_range",
    ]);
    expect(Object.keys(reordered.duration.routes[0].stages)).toEqual(["onset", "peak"]);
    expect(Object.keys(reordered.subjective_effects.attribution)).toEqual(["author", "text", "url"]);
    expect(Object.keys(reordered.history_culture.sections[0])).toEqual([
      "heading",
      "content",
      "date_range",
      "subsections",
      "icon",
    ]);
  });

  it("is deterministic and preserves content counts and order-independent hashes", () => {
    const articles = [
      {
        title: "Repeatamine",
        id: 1,
        legality: {
          countries: {
            US: { notes: "Keep", status: "Schedule I" },
          },
          international: [],
        },
        citations: [{ url: "https://example.com", name: "Example" }],
      },
    ];

    const once = articles.map((article, index) => reorderArticle(article, index));
    const twice = once.map((article, index) => reorderArticle(article, index));
    const validation = validateReordering(articles, once);

    expect(validation.primitiveCountMatches).toBe(true);
    expect(validation.contentHashMatches).toBe(true);
    expect(countPrimitives(once)).toBe(countPrimitives(twice));
    expect(contentHash(once)).toBe(contentHash(twice));
    expect(twice).toEqual(once);
  });
});
