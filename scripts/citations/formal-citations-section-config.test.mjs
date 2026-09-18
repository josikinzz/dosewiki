import { describe, expect, it } from "vitest";

import {
  CITABLE_ARTICLE_SURFACE,
  CITATION_SAFETY_CATEGORIES,
  EXCLUDED_CITATION_SURFACE,
  FORMAL_CITATION_SECTION_CONFIG,
  classifyCitationSafetyClaim,
  isCitableSection,
  isExcludedCitationSection,
  normalizeFormalCitationSectionKey,
  requiresStrictCitationReview,
} from "./formal-citations-section-config.mjs";

describe("formal citations section config", () => {
  it("defines the canonical six-section citable article surface", () => {
    expect(CITABLE_ARTICLE_SURFACE).toEqual([
      "summary",
      "pharmacology",
      "tolerance",
      "harm_potential",
      "history_culture",
      "legality",
    ]);
    expect(Object.isFrozen(CITABLE_ARTICLE_SURFACE)).toBe(true);
  });

  it("derives the citable surface from the section config so the two cannot drift", () => {
    const configKeys = FORMAL_CITATION_SECTION_CONFIG.map((entry) => entry.key);
    expect([...CITABLE_ARTICLE_SURFACE].sort()).toEqual([...configKeys].sort());
  });

  it("defines the excluded citation surface", () => {
    expect(EXCLUDED_CITATION_SURFACE).toEqual([
      "dosage",
      "duration",
      "subjective_effects",
      "comparisons",
      "reagent_testing",
      "interactions",
      "identification",
      "classification",
    ]);
    expect(Object.isFrozen(EXCLUDED_CITATION_SURFACE)).toBe(true);
  });

  it("keeps the citable and excluded surfaces disjoint", () => {
    for (const key of EXCLUDED_CITATION_SURFACE) {
      expect(CITABLE_ARTICLE_SURFACE).not.toContain(key);
    }
  });

  it("answers section membership through the helpers", () => {
    expect(isCitableSection("legality")).toBe(true);
    expect(isCitableSection("dosage")).toBe(false);
    expect(isCitableSection("not_a_section")).toBe(false);
    expect(isExcludedCitationSection("dosage")).toBe(true);
    expect(isExcludedCitationSection("legality")).toBe(false);
  });

  it("normalizes legacy section keys onto the canonical surface", () => {
    expect(normalizeFormalCitationSectionKey("harm-potential")).toBe("harm_potential");
    expect(normalizeFormalCitationSectionKey("history-culture")).toBe("history_culture");
    expect(normalizeFormalCitationSectionKey("dosage")).toBeNull();
  });

  it("classifies every safety-sensitive publication category from path or claim content", () => {
    const fixtures = [
      ["overdose_or_death", { fieldPath: "harm_potential.overdose", claimText: "Overdose may cause death." }],
      ["withdrawal_emergency", { fieldPath: "tolerance.withdrawal", claimText: "Severe withdrawal is a medical emergency." }],
      ["seizure_risk", { fieldPath: "harm_potential.risks", claimText: "Seizures have been reported." }],
      ["lethal_dose_or_index", { fieldPath: "harm_potential.toxicity", claimText: "The median lethal dose is unknown." }],
      ["interaction_severity_or_contraindication", { fieldPath: "interactions[0].note", claimText: "This combination is contraindicated." }],
      ["receptor_affinity_or_potency", { fieldPath: "pharmacology.mechanism", claimText: "It has higher binding affinity than the comparison drug." }],
      ["neuro_or_organ_toxicity", { fieldPath: "harm_potential.toxicity", claimText: "Animal studies suggest neurotoxicity." }],
      ["potent_dosing", { fieldPath: "dosage.routes.oral.light", claimText: "A light dose is 5 mg." }],
      ["pregnancy_or_neonatal", { fieldPath: "harm_potential.pregnancy", claimText: "Neonatal effects are unknown." }],
    ];

    expect(fixtures.map(([, claim]) => classifyCitationSafetyClaim(claim))).toEqual(
      fixtures.map(([category]) => [category]),
    );
    expect(fixtures.map(([category]) => category).sort()).toEqual(
      [...CITATION_SAFETY_CATEGORIES].sort(),
    );
  });

  it("routes excluded marker surfaces through strict review", () => {
    expect(requiresStrictCitationReview({
      fieldPath: "dosage.routes.oral.common",
      claimText: "10–20 mg",
    })).toBe(true);
    expect(requiresStrictCitationReview({
      fieldPath: "interactions[0].description",
      claimText: "May increase adverse effects.",
    })).toBe(true);
    expect(requiresStrictCitationReview({
      fieldPath: "history_culture.summary",
      claimText: "First synthesized in 1974.",
    })).toBe(false);
  });
});
