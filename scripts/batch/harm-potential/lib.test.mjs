import { describe, expect, it } from "vitest";

import { harmPotentialSchema } from "../../../src/schema/substance/harm-potential.ts";
import { parseGeneratedYaml } from "./lib.mjs";

describe("harm potential generated YAML parsing", () => {
  it("normalizes malformed carcinogenicity evidence before schema validation", () => {
    const parsed = parseGeneratedYaml(`
harm_potential:
  addiction:
    psychological:
      level: Moderate
      description: Mildly reinforcing in some patterns.
    physical_dependence:
      level: low
      description: Withdrawal is not typical.
  toxicity:
    lethal_dosage:
      notes: No LD50 reported.
      ld50: []
    organ_toxicity: []
    carcinogenicity:
      level: no_evidence
      evidence: none
      description: No carcinogenicity evidence was identified.
    antibiotic_function:
      level: no_evidence
      description: No antibiotic activity.
  psychosis:
    level: low
    description: Rarely reported.
  seizure:
    level: low
    description: Rarely reported.
`);

    expect(parsed.toxicity.carcinogenicity.evidence).toBeNull();
    expect(parsed.addiction.psychological.level).toBe("moderate");
    expect(() => harmPotentialSchema.parse(parsed)).not.toThrow();
  });
});
