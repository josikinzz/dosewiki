import { describe, expect, it } from "vitest";

import { parseSource } from "../scripts/parsers/registry";

describe("PsychonautWiki parser", () => {
  it("preserves route, taxonomy, safety, legal, structured science, and narrative output after decomposition", () => {
    const result = parseSource(
      "psychonautwiki",
      `## Dosage & Duration
### Oral
**Dosage:**
- Threshold: 20 mg
- Common: 40 - 80 mg
Bioavailability: 55%
**Duration:**
- Onset: 30 - 45 minutes
- Total: 4 - 6 hours

**Testamine** is a synthetic example compound used here to exercise the narrative extractor after the structured route data.

## Subjective effects
This substance is often described as more lucid than adjacent analogues while preserving a strong visual profile.

### Physical effects
- **Stimulation**
### Visual effects
- **Pattern recognition** - recurring surface motifs
### Cognitive effects
- **Conceptual thinking**
### Auditory effects
- **Auditory enhancement**

## Toxicity and harm potential
- Avoid combining with depressants.
- Users should remain hydrated.

### Dangerous interactions
- **Tramadol** - Seizure risk

### Serotonin syndrome risk
- **MDMA**

## Legal status
Covered by the 1971 Convention on Psychotropic Substances.
- **United States**: Schedule I
- **Canada**: Controlled substance

### Tolerance and addiction potential
Repeated exposure builds tolerance quickly and can carry a meaningful rebound period before baseline sensitivity returns, especially when sessions are stacked too closely together over multiple days.

## Chemistry
SMILES: CN1C=NC2=C1C(=O)N(C)C(=O)N2
Formula: C8H10N4O2
Molecular weight: 194.19

Testamine belongs to a fictional scaffold family that is used in parser tests because it includes structured fields alongside readable chemistry prose.

## Pharmacology
Testamine acts as a serotonin receptor agonist in this synthetic fixture.

### Half-life
About 4 hours in this fictional example.

### Metabolism
Primarily hepatic in this synthetic example.

## Forms
Usually encountered as capsules or pressed tablets in this fixture.

## Research
Early exploratory work is limited and mostly anecdotal in this synthetic example.

## History and culture
It emerged in online discussion spaces before migrating into broader reference catalogs.`,
      "Testamine",
    );

    expect(result?.dosage[0]).toMatchObject({
      route: "Oral",
      source: "psychonautwiki",
      bioavailability: "55%",
      ranges: {
        threshold: { min: 20, max: 20, unit: "mg" },
        common: { min: 40, max: 80, unit: "mg" },
      },
    });
    expect(result?.duration[0]).toMatchObject({
      route: "Oral",
      stages: {
        onset: { min: 30, max: 45, unit: "minutes" },
        total: { min: 4, max: 6, unit: "hours" },
      },
    });
    expect(result?.effects.map((effect) => effect.name)).toEqual([
      "Stimulation",
      "Pattern recognition",
      "Conceptual thinking",
      "Auditory enhancement",
    ]);
    expect(result?.interactions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ substance: "Tramadol", severity: "dangerous" }),
        expect.objectContaining({ substance: "MDMA", severity: "dangerous" }),
      ]),
    );
    expect(result?.harmReduction).toMatchObject({
      rules: ["Users should remain hydrated."],
      shortTermRisks: ["Avoid combining with depressants."],
      sources: ["psychonautwiki"],
    });
    expect(result?.legal).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ country: "United States", status: "Schedule I" }),
        expect.objectContaining({ country: "Canada" }),
      ]),
    );
    expect(result?.internationalLaw).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          treaty: "UN Convention on Psychotropic Substances 1971",
          source: "psychonautwiki",
        }),
      ]),
    );
    expect(result?.tolerance).toMatchObject({
      source: "psychonautwiki",
    });
    expect(result?.chemistry).toMatchObject({
      smiles: "CN1C=NC2=C1C(=O)N(C)C(=O)N2",
      formula: "C8H10N4O2",
      molecularWeight: "194.19",
      sources: ["psychonautwiki"],
    });
    expect(result?.pharmacology).toMatchObject({
      halfLife: "About 4 hours in this fictional example.",
      metabolism: "Primarily hepatic in this synthetic example.",
      sources: ["psychonautwiki"],
      receptors: [
        {
          name: "serotonin",
          action: "agonist",
        },
      ],
    });
    expect(result?.narrativeContent.generalNotes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ section: "introduction" }),
        expect.objectContaining({ section: "history" }),
        expect.objectContaining({ section: "chemistry" }),
        expect.objectContaining({ section: "pharmacology" }),
        expect.objectContaining({ section: "effects_overview" }),
        expect.objectContaining({ section: "forms" }),
        expect.objectContaining({ section: "research" }),
      ]),
    );
    expect(result?.sectionsExtracted).toEqual(
      expect.arrayContaining([
        "dosage",
        "duration",
        "effects",
        "interactions",
        "legal",
        "international_law",
        "tolerance",
        "chemistry",
        "pharmacology",
        "harm_reduction",
        "history",
        "introduction",
        "forms",
        "research",
      ]),
    );
  });
});
