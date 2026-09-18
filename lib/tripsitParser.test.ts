import { describe, expect, it } from "vitest";

import { parseSource } from "../scripts/parsers/registry";

describe("TripSit parsers", () => {
  it("preserves wiki parsing through the decomposed shared helpers", () => {
    const result = parseSource(
      "tripsit-wiki",
      `TripSit wiki intro paragraph with enough prose to count as preserved narrative content for the parser cleanup fixture. It explains the fictional substance in a few sentences before the markdown sections begin.

## Dosage
| Common | 100-200 mg |

## Duration
- Onset: Oral: 30-45 minutes, Insufflated: 5-10 minutes
- Duration: Oral: 3-5 hours, Insufflated: 1-2 hours

## Effects
### Positive
- Euphoria
### Negative
- Anxiety

## Interactions
### Dangerous
- Tramadol: seizure risk

## Tolerance
Tolerance builds with repeated use and remains elevated for long enough that this block should be preserved as structured tolerance text in the parser result.

## History
The fictional TripSit wiki fixture was introduced to exercise narrative extraction.

## Chemistry and Pharmacology
This fixture includes combined chemistry and pharmacology prose so the wiki parser keeps that narrative content attached.

### After effects
Residual stimulation may persist after the main plateau.

## Harm Reduction
Maintain hydration and avoid mixing with other stimulants.
- Start low
- Remain with trusted company`,
      "Fixtureamine",
    );

    expect(result?.dosage[0]).toMatchObject({
      route: "Oral",
      source: "tripsit-wiki",
      ranges: {
        common: { min: 100, max: 200, unit: "mg" },
      },
    });
    expect(result?.duration).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          route: "Oral",
          stages: {
            onset: { min: 30, max: 45, unit: "minutes" },
            total: { min: 3, max: 5, unit: "hours" },
          },
        }),
        expect.objectContaining({
          route: "Insufflated",
          stages: {
            onset: { min: 5, max: 10, unit: "minutes" },
            total: { min: 1, max: 2, unit: "hours" },
          },
        }),
      ]),
    );
    expect(result?.effects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Euphoria", category: "positive" }),
        expect.objectContaining({ name: "Anxiety", category: "negative" }),
      ]),
    );
    expect(result?.interactions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ substance: "Tramadol", severity: "dangerous" }),
      ]),
    );
    expect(result?.tolerance).toMatchObject({
      source: "tripsit-wiki",
    });
    expect(result?.harmReduction).toMatchObject({
      rules: ["Start low", "Remain with trusted company"],
      sources: ["tripsit-wiki"],
    });
    expect(result?.narrativeContent.generalNotes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ section: "introduction" }),
        expect.objectContaining({ section: "history" }),
        expect.objectContaining({ section: "chemistry_pharmacology" }),
        expect.objectContaining({ section: "after_effects" }),
        expect.objectContaining({ section: "harm_reduction_overview" }),
      ]),
    );
    expect(result?.sectionsExtracted).toEqual(
      expect.arrayContaining([
        "dosage",
        "duration",
        "effects",
        "interactions",
        "tolerance",
        "introduction",
        "history",
        "chemistry_pharmacology",
        "harm_reduction",
      ]),
    );
  });
});
