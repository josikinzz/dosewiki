import { describe, expect, it } from "vitest";

import {
  auditArticle,
  compareFieldToSources,
  extractOtherAllowedFields,
  extractScopedFields,
  slugify,
} from "./plagiarism-audit-core.mjs";

describe("dose table and tolerance plagiarism audit core", () => {
  it("extracts only dose table notes and tolerance fields", () => {
    const fields = extractScopedFields({
      title: "ALD-52",
      slug: "ald-52",
      summary: "This section is intentionally excluded.",
      dosage: {
        routes: [
          {
            route: "oral",
            notes: "Dose table note text is in scope.",
            bioavailability_notes: "Bioavailability note text is also in scope.",
          },
        ],
        plateau_dosing: null,
      },
      tolerance: {
        full_tolerance: "Tolerance to the effects develops almost immediately following ingestion.",
        half_tolerance: "Approximately 5-7 days.",
        baseline_tolerance: "Approximately 14 days.",
        cross_tolerance: ["Psychedelics"],
      },
    });

    expect(fields.map((field) => field.fieldPath)).toEqual([
      "dosage.routes[0].notes",
      "dosage.routes[0].bioavailability_notes",
      "tolerance.full_tolerance",
      "tolerance.half_tolerance",
      "tolerance.baseline_tolerance",
      "tolerance.cross_tolerance[0]",
    ]);
    expect(fields.some((field) => field.value.includes("intentionally excluded"))).toBe(false);
  });

  it("flags long exact overlap against a priority source as likely plagiarism", () => {
    const field = {
      section: "tolerance",
      fieldPath: "tolerance.full_tolerance",
      label: "full tolerance",
      value:
        "Tolerance to the effects of ALD-52 develops almost immediately after ingestion and takes several days to return to baseline.",
    };
    const result = compareFieldToSources(field, [
      {
        sourceId: "psychonautwiki",
        displayName: "PsychonautWiki",
        origin: "fixture",
        text:
          "Tolerance to the effects of ALD-52 develops almost immediately after ingestion and takes several days to return to baseline. Other text follows.",
      },
    ]);

    expect(result.status).toBe("likely_plagiarism");
    expect(result.bestMatch).toMatchObject({
      sourceId: "psychonautwiki",
      wordCount: 20,
      prioritySource: true,
    });
  });

  it("marks articles with no populated scoped fields separately from clear articles", () => {
    const result = auditArticle(
      {
        title: "No Scoped Content",
        slug: "no-scoped-content",
        dosage: { routes: [], plateau_dosing: null },
        tolerance: {
          full_tolerance: "",
          half_tolerance: "",
          baseline_tolerance: "",
          cross_tolerance: [],
        },
      },
      [{ sourceId: "erowid", text: "Source text", displayName: "Erowid", origin: "fixture" }],
    );

    expect(result.status).toBe("no_scoped_content");
    expect(result.hasPlagiarismConcern).toBe(false);
  });

  it("extracts other-section prose while excluding names, subjective effects, interactions, and reagent testing", () => {
    const fields = extractOtherAllowedFields({
      title: "Named Substance",
      identification: {
        chemical_name: "Excluded chemical name",
        common_name: "Excluded common name",
      },
      classification: {
        chemical_class: ["Excluded class"],
        psychoactive_class: ["Excluded class"],
      },
      summary: "Summary prose is in scope.",
      subjective_effects: {
        physical: {
          stimulation: {
            name: "Stimulation",
            description: "Excluded subjective effect prose.",
          },
        },
      },
      interactions: {
        unsafe: [{ substance: "Excluded interaction", note: "Excluded interaction prose." }],
      },
      reagent_testing: {
        marquis: "Excluded reagent result.",
      },
      dosage: {
        routes: [{ route: "oral", notes: "Excluded dose note." }],
        plateau_dosing: null,
      },
      tolerance: {
        full_tolerance: "Excluded tolerance prose.",
        half_tolerance: "",
        baseline_tolerance: "",
        cross_tolerance: [],
      },
      pharmacology: {
        pharmacodynamics: "Pharmacodynamics prose is in scope.",
        binding_sites: [{ target: "5-HT2A", affinity: "Excluded receptor data" }],
        route_bioavailability_notes: { oral: "Route bioavailability note prose is in scope." },
      },
      harm_potential: {
        addiction: {
          psychological: { level: "moderate", description: "Harm description prose is in scope." },
        },
      },
      history_culture: {
        content: "History content prose is in scope.",
        sections: [{ heading: "Excluded heading", content: "Section content prose is in scope." }],
      },
      legality: {
        countries: {
          "United States": {
            status: "Excluded legal status",
            notes: "Legal notes prose is in scope.",
          },
        },
      },
      references: [{ title: "Excluded reference title" }],
      citations: [],
    });

    expect(fields.map((field) => field.fieldPath)).toEqual([
      "summary",
      "pharmacology.pharmacodynamics",
      "pharmacology.route_bioavailability_notes.oral",
      "harm_potential.addiction.psychological.description",
      "history_culture.content",
      "history_culture.sections[0].content",
      "legality.countries[\"United States\"].notes",
    ]);
    expect(fields.map((field) => field.value).join(" ")).not.toContain("Excluded");
  });

  it("normalizes common title forms into article slugs", () => {
    expect(slugify("Psilocybin_mushrooms")).toBe("psilocybin-mushrooms");
    expect(slugify("4-HO-MiPT")).toBe("4-ho-mipt");
  });
});
