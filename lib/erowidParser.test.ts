import { describe, expect, it } from "vitest";

import { parseSource } from "../scripts/parsers/registry";

describe("Erowid parser", () => {
  it("preserves structured and narrative extraction across the decomposed helper modules", () => {
    const result = parseSource(
      "erowid",
      `## Basics
DESCRIPTION #
Ketamine is a dissociative substance with a long history of medical and non-medical use.

## Dosage
DOSAGE DESCRIPTION #
Dose context prose explaining how set, setting, and tolerance can shift the effective range for different people.

**Oral**
- Threshold: 5 mg
- Common: 10 - 15 mg

## Effects
DURATION #
- Onset: 20 - 40 minutes
- Total Duration: 4 - 6 hours

EFFECTS LIST #
POSITIVE
- Euphoria
NEUTRAL
- Time distortion
NEGATIVE
- Anxiety

DESCRIPTION #
Effects prose with more detail than the bullet list provides.

## Law
U.S. FEDERAL LAW #
Schedule III controlled substance under federal law.

INTERNATIONAL LAW #
Canada #
Controlled with prescription access.
Australia #
Illegal without a prescription.
1971 Convention on Psychotropic Substances

PROBLEMS #
Contraindications #
- Heart disease
- Hypertension

Addiction Potential #
Moderate abuse liability in frequent use patterns.

Long Term Health #
- Memory disruption

Risk of Death #
Rare but still relevant when mixed with respiratory depressants.

Chemistry #
Ketamine is an arylcyclohexylamine with chiral forms and a characteristic anesthetic profile.

History #
It was synthesized in the 1960s and later adopted in clinical settings before spreading into nightlife contexts.

Terminology / Slang #
Common slang terms vary by region and scene.`,
      "Ketamine",
    );

    expect(result?.dosage[0]).toMatchObject({
      route: "Oral",
      source: "erowid",
      ranges: {
        threshold: { min: 5, max: 5, unit: "mg" },
        common: { min: 10, max: 15, unit: "mg" },
      },
    });

    expect(result?.duration[0]).toMatchObject({
      route: "Oral",
      source: "erowid",
      stages: {
        onset: { min: 20, max: 40, unit: "minutes" },
        total: { min: 4, max: 6, unit: "hours" },
      },
    });

    expect(result?.legal).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ country: "United States", status: "Schedule III" }),
        expect.objectContaining({ country: "Canada" }),
        expect.objectContaining({ country: "Australia" }),
      ]),
    );
    expect(result?.internationalLaw).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          treaty: "UN Convention on Psychotropic Substances 1971",
          source: "erowid",
        }),
      ]),
    );
    expect(result?.harmReduction).toMatchObject({
      contraindications: ["Heart disease", "Hypertension"],
      shortTermRisks: [
        "Addiction potential: Moderate abuse liability in frequent use patterns.",
      ],
      longTermRisks: expect.arrayContaining([
        "Memory disruption",
        "Risk of death: Rare but still relevant when mixed with respiratory depressants.",
      ]),
      sources: ["erowid"],
    });
    expect(result?.narrativeContent.generalNotes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ section: "description" }),
        expect.objectContaining({ section: "chemistry" }),
        expect.objectContaining({ section: "history" }),
        expect.objectContaining({ section: "terminology" }),
        expect.objectContaining({ section: "effects_description" }),
        expect.objectContaining({ section: "dosage_context" }),
        expect.objectContaining({ section: "harm_reduction_guidance" }),
      ]),
    );
    expect(result?.sectionsExtracted).toEqual(
      expect.arrayContaining([
        "dosage",
        "duration",
        "effects",
        "legal",
        "international_law",
        "harm_reduction",
        "description",
        "history",
      ]),
    );
  });
});
