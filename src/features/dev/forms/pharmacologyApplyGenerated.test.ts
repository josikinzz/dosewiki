import { describe, expect, it } from "vitest";

import { applyGeneratedPharmacology } from "./pharmacologyApplyGenerated";

describe("applyGeneratedPharmacology", () => {
  it("applies generated pharmacology fields and appends missing routes", () => {
    const result = applyGeneratedPharmacology(
      `
pharmacology:
  pharmacodynamics: Test dynamics
  summary: Test summary
  receptor_profile:
    - receptor: 5-HT2A
      tag: agonist
      affinity: Ki = 2.9 nM
      efficacy: partial agonist
  pharmacokinetics: Test kinetics
  metabolites:
    - Nor-LSD
  route_bioavailability:
    insufflated: 65-80%
  route_bioavailability_notes:
    oral: first-pass metabolism
  route_half_life:
    intravenous: 2-3 hours
  route_half_life_notes:
    sublingual: faster onset
  bioavailability_notes: General bioavailability note
  half_life: General half-life note
`,
      [
        {
          route: "Oral",
          bioavailability: "",
          bioavailability_notes: "",
          dose_ranges: {
            threshold: { min: null, max: null, unit: "" },
            light: { min: null, max: null, unit: "" },
            moderate: { min: null, max: null, unit: "" },
            strong: { min: null, max: null, unit: "" },
            heavy: { min: null, max: null, unit: "" },
          },
          notes: "",
        },
      ],
      [
        {
          route: "Sublingual",
          half_life: "",
          half_life_notes: "",
          stages: {
            onset: { min: null, max: null, unit: "" },
            come_up: { min: null, max: null, unit: "" },
            peak: { min: null, max: null, unit: "" },
            offset: { min: null, max: null, unit: "" },
            after_effects: { min: null, max: null, unit: "" },
            total_duration: { min: null, max: null, unit: "" },
          },
        },
      ],
    );

    expect(result.pharmacology.pharmacodynamics).toBe("Test dynamics");
    expect(result.pharmacology.summary).toBe("Test summary");
    expect(result.pharmacology.receptor_profile[0]?.receptor).toBe("5-HT2A");
    expect(result.pharmacology.metabolites).toEqual(["Nor-LSD"]);
    expect(result.pharmacology.bioavailability_notes).toBe("General bioavailability note");
    expect(result.pharmacology.half_life).toBe("General half-life note");

    expect(result.dosageRoutes.find((route) => route.route === "Oral")?.bioavailability_notes).toBe("first-pass metabolism");
    expect(result.dosageRoutes.find((route) => route.route === "Insufflated")?.bioavailability).toBe("65-80%");
    expect(result.durationRoutes.find((route) => route.route === "Sublingual")?.half_life_notes).toBe("faster onset");
    expect(result.durationRoutes.find((route) => route.route === "Intravenous")?.half_life).toBe("2-3 hours");
  });
});
