import { describe, expect, it } from "vitest";
import yaml from "yaml";
import { createEmptyArticle } from "@/data/schema/defaults.generated";
import { normalizeArticleInput, parseGeneratedYaml, parseSectionYamlObject } from "./yamlParser";

describe("parseGeneratedYaml", () => {
  it("preserves legacy pharmacology data when hydrating an existing article", () => {
    const legacyArticle = {
      ...createEmptyArticle(),
      id: 101,
      title: "1B-LSD",
      identification: {
        ...createEmptyArticle().identification,
        common_name: "1B-LSD",
      },
      pharmacology: {
        mechanism_of_action: [
          "5-HT2A receptor agonist (partial)",
          "5-HT2C receptor agonist (partial)",
        ],
        receptor_binding: {
          "NMDA receptor": "antagonist",
        },
        metabolism: "Rapid hepatic metabolism.",
        metabolites: ["M1"],
        route_bioavailability: {
          oral: "70%",
        },
        route_half_life: {
          oral: "3 hours",
        },
      },
    };

    const result = parseGeneratedYaml(yaml.stringify(legacyArticle, { lineWidth: 0, nullStr: "" }));

    expect(result.success).toBe(true);
    expect(result.data?.pharmacology.pharmacokinetics).toBe("Rapid hepatic metabolism.");
    expect(result.data?.pharmacology.route_bioavailability).toEqual({ Oral: "70%" });
    expect(result.data?.pharmacology.route_half_life).toEqual({ Oral: "3 hours" });
    expect(result.data?.pharmacology.binding_sites).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ tag: "5-HT2A receptor agonist (partial)" }),
        expect.objectContaining({ tag: "5-HT2C receptor agonist (partial)" }),
        expect.objectContaining({ target: "NMDA receptor", efficacy: "antagonist" }),
      ]),
    );
  });

  it("rejects empty or non-object section YAML", () => {
    expect(() => parseSectionYamlObject("   ")).toThrow("Generated YAML is empty.");
    expect(() => parseSectionYamlObject("null")).toThrow("Generated YAML must parse to an object.");
  });

  it("defaults missing editorial review metadata for editor workflows", () => {
    const article = normalizeArticleInput({
      title: "Needs Review",
    });

    expect(article.editorial_review).toEqual({
      status: "needed",
      notes: "",
    });
  });

  it("preserves hide-for-now priority when normalizing editor YAML", () => {
    const article = normalizeArticleInput({
      title: "Temporarily unlisted",
      priority: "hide_for_now",
    });

    expect(article.priority).toBe("hide_for_now");
  });

  it("normalizes legacy subjective-effects shapes into the current schema", () => {
    const article = normalizeArticleInput({
      title: "Test Substance",
      subjective_effects: {
        notes: {
          overview: "Legacy notes",
        },
        sensory: {
          visual: {
            distortions: ["Pattern recognition"],
          },
        },
        cognitive: ["Analysis enhancement"],
        physical: {
          stimulation: [
            {
              name: "Body energy",
              description: "Noticeable stimulation.",
            },
          ],
        },
        progressive_stages: {
          onset: ["Warmth"],
        },
        attribution: {
          author: "Example Author",
          text: "User report excerpt",
          url: "https://example.com/report",
        },
      },
    });

    expect(article.subjective_effects.notes.overview).toBe("Legacy notes");
    expect(article.subjective_effects.sensory.visual.note).toBe("");
    expect(article.subjective_effects.sensory.visual.subcategories.distortions.effects).toEqual([
      { name: "Pattern recognition", description: "" },
    ]);
    expect(article.subjective_effects.cognitive.General.effects).toEqual([
      { name: "Analysis enhancement", description: "" },
    ]);
    expect(article.subjective_effects.physical.stimulation.effects).toEqual([
      { name: "Body energy", description: "Noticeable stimulation." },
    ]);
    expect(article.subjective_effects.progressive_stages?.onset.effects).toEqual([
      { name: "Warmth", description: "" },
    ]);
    expect(article.subjective_effects.attribution).toEqual({
      author: "Example Author",
      text: "User report excerpt",
      url: "https://example.com/report",
    });
  });

  it("normalizes harm-potential legacy risk values and mixed toxicity formats", () => {
    const article = normalizeArticleInput({
      title: "Risky Test Substance",
      harm_potential: {
        toxicity: {
          ld50: [
            {
              species: "rat",
              route: "oral",
              value: 50,
              unit: "mg/kg",
            },
          ],
          organ_toxicity: "Potential liver strain.",
          carcinogenicity: {
            level: "possible",
            evidence: "animal",
            description: "Limited evidence in animals.",
          },
          antibiotic_function: {
            level: "low",
            description: "Weak activity.",
          },
          other: "Avoid prolonged exposure.",
        },
        addiction: {
          psychological: {
            level: "moderate",
            description: "Compulsive redosing possible.",
          },
          physical_dependence: {
            level: "low",
            description: "Withdrawal is uncommon.",
          },
        },
        psychosis: {
          level: "Very High",
          description: "Severe risk in vulnerable users.",
        },
        seizure: {
          level: "Low",
          description: "Rare but documented.",
        },
      },
    });

    expect(article.harm_potential?.toxicity?.ld50).toEqual([
      {
        species: "rat",
        route: "oral",
        value: 50,
        unit: "mg/kg",
      },
    ]);
    expect(article.harm_potential?.toxicity?.organ_toxicity).toBe("Potential liver strain.");
    expect(article.harm_potential?.toxicity?.carcinogenicity).toEqual({
      level: "possible",
      evidence: "animal",
      description: "Limited evidence in animals.",
    });
    expect(article.harm_potential?.toxicity?.antibiotic_function).toEqual({
      level: "low",
      description: "Weak activity.",
    });
    expect((article.harm_potential?.toxicity as Record<string, unknown>)?.other).toBe("Avoid prolonged exposure.");
    expect(article.harm_potential?.addiction?.psychological).toEqual({
      level: "moderate",
      description: "Compulsive redosing possible.",
    });
    expect(article.harm_potential?.addiction?.physical_dependence).toEqual({
      level: "low",
      description: "Withdrawal is uncommon.",
    });
    expect(article.harm_potential?.psychosis).toEqual({
      level: "extremely_high",
      description: "Severe risk in vulnerable users.",
    });
    expect(article.harm_potential?.seizure).toEqual({
      level: "low",
      description: "Rare but documented.",
    });
  });
});
