import { describe, expect, it } from "vitest";
import { fullArticleWithDosage } from "../../src/test/fixtures/articles";
import {
  parsePublicSubstanceRecord,
  parsePublicSubstanceRecords,
} from "./publicData.substanceContract";

describe("public substance article contract", () => {
  it("validates public article records and strips editor-only metadata", () => {
    const result = parsePublicSubstanceRecord({
      ...fullArticleWithDosage,
      slug: "lsd",
      editorial_review: {
        status: "needed",
        notes: "internal",
      },
    });

    expect(result).toMatchObject({
      title: "LSD",
      slug: "lsd",
      priority: "normal",
    });
    expect(result).not.toHaveProperty("editorial_review");
  });

  it("fails closed for malformed nested public article fields", () => {
    const result = parsePublicSubstanceRecord({
      ...fullArticleWithDosage,
      slug: "lsd",
      classification: {
        psychoactive_class: "Psychedelic",
        chemical_class: ["Lysergamide"],
      },
    });

    expect(result).toBeNull();
  });

  it("normalizes legacy empty subjective effect arrays at the public read boundary", () => {
    const result = parsePublicSubstanceRecord({
      ...fullArticleWithDosage,
      slug: "lsd",
      subjective_effects: {
        notes: {
          overview: "",
          sensory: "",
          cognitive: "",
          physical: "",
        },
        sensory: {
          visual: [],
          auditory: [],
          tactile: [],
          olfactory: [],
          gustatory: [],
          multisensory: [],
        },
        cognitive: [],
        physical: [],
      },
    });

    expect(result).toMatchObject({
      slug: "lsd",
      subjective_effects: {
        sensory: {
          visual: { note: "", subcategories: {} },
          auditory: { note: "", subcategories: {} },
        },
        cognitive: {},
        physical: {},
      },
    });
  });

  it("preserves subjective effect stub metadata at the public read boundary", () => {
    const result = parsePublicSubstanceRecord({
      ...fullArticleWithDosage,
      slug: "lsd",
      subjective_effects: {
        ...fullArticleWithDosage.subjective_effects,
        is_stub: true,
        source_overview: "Original source prose retained for editors.",
      },
    });

    expect(result?.subjective_effects).toMatchObject({
      is_stub: true,
      source_overview: "Original source prose retained for editors.",
    });
  });

  it("normalizes unsupported citation reference templates to unknown", () => {
    const result = parsePublicSubstanceRecord({
      ...fullArticleWithDosage,
      slug: "lsd",
      references: [
        {
          id: "pubchem-lsd",
          type: "database_entry",
          template: "cite",
          title: "LSD",
          authors: [],
          sourceType: "medical_database",
          quality: "medium",
        },
      ],
    });

    expect(result?.references).toEqual([
      expect.objectContaining({
        id: "pubchem-lsd",
        template: "unknown",
      }),
    ]);
  });

  it("filters invalid public library records at the boundary", () => {
    expect(
      parsePublicSubstanceRecords([
        { ...fullArticleWithDosage, slug: "lsd" },
        { ...fullArticleWithDosage, slug: "broken", dosage: { routes: "invalid" } },
      ]),
    ).toEqual([expect.objectContaining({ slug: "lsd" })]);
  });
});
