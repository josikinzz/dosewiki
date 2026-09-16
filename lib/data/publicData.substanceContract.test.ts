import { describe, expect, it } from "vitest";
import { fullArticleWithDosage } from "../../src/test/fixtures/articles";
import { projectLibraryInput } from "../../src/data/projections/substanceReadProjections";
import {
  parsePublicSubstanceLibraryInputRecord,
  parsePublicSubstanceLibraryInputRecords,
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

  it("normalizes hide-for-now to low at the public contract boundary", () => {
    const result = parsePublicSubstanceRecord({
      ...fullArticleWithDosage,
      slug: "temporarily-unlisted",
      priority: "hide_for_now",
    });

    expect(result).toMatchObject({
      slug: "temporarily-unlisted",
      priority: "low",
    });
  });

  it("exposes a public-safe expert_reviewed flag derived from a completed review", () => {
    const reviewed = parsePublicSubstanceRecord({
      ...fullArticleWithDosage,
      slug: "lsd",
      editorial_review: { status: "completed", notes: "internal" },
    });

    expect(reviewed).toMatchObject({ slug: "lsd", expert_reviewed: true });
    expect(reviewed).not.toHaveProperty("editorial_review");
    expect(JSON.stringify(reviewed)).not.toContain("internal");

    const pending = parsePublicSubstanceRecord({
      ...fullArticleWithDosage,
      slug: "lsd",
      editorial_review: { status: "in_progress", notes: "" },
    });

    expect(pending).toMatchObject({ expert_reviewed: false });
  });

  it("preserves an already-derived expert_reviewed flag when editorial_review is absent", () => {
    const result = parsePublicSubstanceRecord({
      ...fullArticleWithDosage,
      slug: "lsd",
      expert_reviewed: true,
    });

    expect(result).toMatchObject({ slug: "lsd", expert_reviewed: true });
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

  it("normalizes legacy nullable article shells that still have renderable public prose", () => {
    const result = parsePublicSubstanceRecord({
      ...fullArticleWithDosage,
      slug: "legacy-shape",
      identification: {
        ...fullArticleWithDosage.identification,
        substitutive_name: null,
        iupac_name: null,
        alternative_names: undefined,
        smiles: null,
        inchi_key: null,
        cas_number: null,
        molecular_formula: undefined,
        molecular_weight: undefined,
        skeletal_structure_image: undefined,
      },
      dosage: {
        ...fullArticleWithDosage.dosage,
        routes: fullArticleWithDosage.dosage.routes.map(({ bioavailability: _bioavailability, notes: _notes, ...route }) => route),
      },
      duration: {
        routes: fullArticleWithDosage.duration.routes.map((route) => ({
          ...route,
          stages: {
            ...route.stages,
            come_up: null,
            offset: null,
            after_effects: null,
          },
        })),
      },
      subjective_effects: {
        notes: null,
        sensory: [],
        cognitive: [],
        physical: [],
      },
      pharmacology: {
        ...fullArticleWithDosage.pharmacology,
        binding_sites: undefined,
        pharmacokinetics: null,
        metabolites: undefined,
        half_life: null,
      },
      reagent_testing: null,
      tolerance: {
        full_tolerance: null,
        half_tolerance: null,
        baseline_tolerance: null,
        cross_tolerance: undefined,
      },
      harm_potential: {
        toxicity: {
          carcinogenicity: {
            level: "no_evidence",
            evidence: {
              human_epidemiological: "negative",
              animal_models: { level: "limited", species: [] },
              in_vitro: { type: "genotoxic", assay_type: "comet assay" },
              mechanistic: { level: "possible", basis: "legacy carcinogenicity-level value" },
            },
            description: "Legacy evidence value should not hide the article.",
          },
        },
      },
    });

    expect(result).toMatchObject({
      slug: "legacy-shape",
      identification: {
        substitutive_name: "",
        alternative_names: [],
      },
      dosage: {
        routes: [
          expect.objectContaining({
            bioavailability: "",
            notes: "",
          }),
        ],
      },
      duration: {
        routes: [
          expect.objectContaining({
            stages: expect.objectContaining({
              come_up: { min: null, max: null, unit: "" },
            }),
          }),
        ],
      },
      subjective_effects: {
        sensory: expect.objectContaining({
          visual: { note: "", subcategories: {} },
        }),
      },
      pharmacology: {
        binding_sites: [],
        pharmacokinetics: "",
        metabolites: [],
      },
      reagent_testing: {},
      tolerance: {
        full_tolerance: "",
        cross_tolerance: [],
      },
      harm_potential: {
        toxicity: {
          carcinogenicity: {
            evidence: {
              mechanistic: {
                level: null,
                basis: "legacy carcinogenicity-level value",
              },
            },
          },
        },
      },
    });
  });

  it("filters invalid public library records at the boundary", () => {
    expect(
      parsePublicSubstanceRecords([
        { ...fullArticleWithDosage, slug: "lsd" },
        { ...fullArticleWithDosage, slug: "broken", dosage: { routes: "invalid" } },
      ]),
    ).toEqual([expect.objectContaining({ slug: "lsd" })]);
  });

  it("validates the distinct slim library contract and silently drops invalid records", () => {
    const projected = projectLibraryInput({
      ...structuredClone(fullArticleWithDosage),
      slug: "lsd",
      duration: {
        routes: fullArticleWithDosage.duration.routes.map((route) => ({
          ...structuredClone(route),
          stages: {
            ...structuredClone(route.stages),
            come_up: undefined,
          },
        })),
      },
      pharmacology: {
        ...structuredClone(fullArticleWithDosage.pharmacology),
        metabolism: null,
      },
      references: [
        {
          id: "identified",
          type: "journal_article",
          title: "Identified",
          authors: [],
          doi: "10.1000/example",
          sourceType: "primary_literature",
          quality: "high",
        },
        {
          id: "metadata-only",
          type: "book",
          title: "Metadata only",
          authors: [],
          sourceType: "book",
          quality: "medium",
        },
      ],
    } as never);

    const parsed = parsePublicSubstanceLibraryInputRecord(projected);
    expect(parsed).toMatchObject(projected);
    expect(
      parsePublicSubstanceLibraryInputRecords([
        projected,
        {
          ...projected,
          slug: "broken",
          dosage: { routes: "invalid" },
        },
      ]),
    ).toEqual([parsed]);
    expect(projected.references).toEqual([
      { doi: "10.1000/example" },
      {},
    ]);
    expect(projected.duration.routes[0]?.stages.come_up).toEqual({
      min: null,
      max: null,
      unit: "",
    });
    expect(projected.pharmacology).not.toHaveProperty("metabolism");
  });
});
