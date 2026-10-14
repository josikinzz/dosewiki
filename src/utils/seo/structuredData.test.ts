import { describe, expect, it } from "vitest";
import type { SubstanceArticle } from "../../schema";
import { buildSubstanceSchema, serializeJsonLd } from "./structuredData";

const baseArticle = {
  id: 1,
  title: "LSD",
  priority: "high",
  index_categories: ["psychedelic", "lysergamide", "psychedelic"],
  identification: {
    common_name: "LSD",
    alternative_names: ["Acid", "Lysergic acid diethylamide", "Acid"],
  },
  classification: {
    chemical_class: ["Lysergamide"],
    psychoactive_class: ["Psychedelic"],
  },
  summary: "LSD is a semisynthetic psychedelic used here as a structured-data fixture.",
  dosage: {},
  duration: {},
  subjective_effects: {},
  comparisons: [],
  pharmacology: {
    binding_sites: [{ target: "5-HT2A", tag: "5-HT2A receptor agonist" }],
  },
  interactions: {},
  reagent_testing: {},
  tolerance: {
    full_tolerance: "",
    half_tolerance: "",
    baseline_tolerance: "",
    cross_tolerance: [],
  },
  harm_potential: {},
  legality: {},
  references: [
    {
      id: "doi-fixture",
      type: "journal_article",
      title: "A fixture paper",
      authors: ["Ada Lovelace"],
      year: 2024,
      doi: "10.1234/example",
      url: "https://example.com/paper",
      access: "open",
      sourceType: "primary_literature",
      quality: "high",
      supportStatus: "inspected",
    },
  ],
  source_citations: [],
  citations: [],
} as unknown as SubstanceArticle;

describe("substance structured data", () => {
  it("serializes JSON-LD safely for script tag injection", () => {
    const schema = buildSubstanceSchema(
      {
        ...baseArticle,
        title: "</script><script>alert(1)</script>",
        identification: {
          ...baseArticle.identification,
          common_name: "</script><script>alert(1)</script>",
        },
      },
      "https://dose.wiki/script-test",
    );

    const json = serializeJsonLd(schema);

    expect(json).not.toContain("</script>");
    expect(JSON.parse(json).name).toBe("</script><script>alert(1)</script>");
  });
});
