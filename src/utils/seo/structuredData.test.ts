import { describe, expect, it } from "vitest";
import type { SubstanceArticle } from "../../schema";
import { buildSubjectiveEffectSchema, buildSubstanceSchema, serializeJsonLd } from "./structuredData";

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
    receptor_profile: [{ tag: "5-HT2A receptor agonist" }],
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
  it("builds answer-ready Article JSON-LD with a canonical URL, Drug entity, and citations", () => {
    const schema = buildSubstanceSchema(baseArticle, "https://dose.wiki/lsd");

    expect(schema["@id"]).toBe("https://dose.wiki/lsd#article");
    expect(schema.url).toBe("https://dose.wiki/lsd");
    expect(schema.mainEntityOfPage["@id"]).toBe("https://dose.wiki/lsd");
    expect(schema.about).toMatchObject({
      "@type": "Drug",
      name: "LSD",
      alternateName: ["Acid", "Lysergic acid diethylamide"],
      mechanismOfAction: "5-HT2A receptor agonist",
    });
    expect(schema.keywords).toEqual(["Psychedelic", "Lysergamide", "psychedelic", "lysergamide"]);
    expect(schema.citation?.[0]).toMatchObject({
      "@type": "CreativeWork",
      name: "A fixture paper",
      url: "https://example.com/paper",
      datePublished: "2024",
      identifier: ["doi:10.1234/example"],
      isAccessibleForFree: true,
    });
  });

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

  it("builds answer-ready Article JSON-LD for subjective effect pages", () => {
    const schema = buildSubjectiveEffectSchema(
      {
        slug: "drifting",
        name: "Drifting",
        summary: "Objects appear to warp and morph across themselves.",
        tags: ["visual", "distortion"],
        featured: false,
        description_raw: "A description.",
        citations: [
          {
            url: "https://example.com/effect-source",
            text: "A source about drifting.",
            from: "Effect Index",
          },
        ],
      },
      "https://dose.wiki/effects/drifting",
    );

    expect(schema).toMatchObject({
      "@id": "https://dose.wiki/effects/drifting#article",
      url: "https://dose.wiki/effects/drifting",
      about: {
        "@type": "DefinedTerm",
        name: "Drifting",
        inDefinedTermSet: {
          name: "dose.wiki Subjective Effect Index",
          url: "https://dose.wiki/effects",
        },
      },
      keywords: ["visual", "distortion"],
    });
    expect(schema.citation?.[0]).toMatchObject({
      "@type": "CreativeWork",
      name: "A source about drifting.",
      url: "https://example.com/effect-source",
      publisher: {
        "@type": "Organization",
        name: "Effect Index",
      },
    });
  });
});
