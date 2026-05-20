import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { aggregateResults, createParsedOutput } from "../scripts/parsers/aggregation";
import { createEmptyParserResult, parseDoseRange, parseDurationRange } from "../scripts/parsers/base";
import type { ParsedSourceRecord } from "../scripts/parsers/contracts";
import { parsers, parseSource } from "../scripts/parsers/registry";
import { describeSource } from "../scripts/parsers/source-identity";
import type { NarrativeContent, ParserResult, SourceParser } from "../scripts/parsers/types";
import { enrichWithCombos } from "../scripts/parsers/tripsit-combos";
import {
  detectInlineRoutes,
  parseInlineMultiRouteDuration,
  parseNestedDurationDict,
  resolveRouteDurationValue,
} from "../scripts/parsers/tripsit-duration";

describe("parser base helpers", () => {
  it("normalizes representative dose and duration fixtures", () => {
    expect(parseDoseRange("10-15 mg THC")).toEqual({
      min: 10,
      max: 15,
      unit: "mg",
    });

    expect(parseDurationRange("00:05 – 00:30")).toEqual({
      min: 5,
      max: 30,
      unit: "minutes",
    });
  });
});

type ParserContractFixture = {
  name: string;
  sourceId: string;
  substanceName: string;
  content: string;
  expectedSections: string[];
  expectedArrayRecords?: Partial<Record<keyof ParserResult, unknown[]>>;
  expectedObjects?: Partial<Pick<ParserResult, "chemistry" | "pharmacology" | "harmReduction" | "tolerance">>;
  expectedNarrative?: Partial<Record<keyof NarrativeContent, unknown[]>>;
  malformedContent?: string;
};

type ParserContractGap = {
  emptyInput?: string;
  structuredUnits?: string;
};

const parserContractGaps: Partial<Record<string, ParserContractGap>> = {
  drugbank: {
    emptyInput:
      "DrugBank currently emits source-only chemistry/pharmacology objects for empty input.",
  },
  drugusersbible: {
    structuredUnits: "Drug Users Bible currently preserves title-cased duration units from source text.",
  },
};

const standardSectionByField = {
  dosage: "dosage",
  duration: "duration",
  effects: "effects",
  interactions: "interactions",
  legal: "legal",
  internationalLaw: "international_law",
  tolerance: "tolerance",
  chemistry: "chemistry",
  pharmacology: "pharmacology",
} as const satisfies Partial<Record<keyof ParserResult, string>>;

function assertCompleteParserResultShape(result: ParserResult) {
  expect(result).toMatchObject({
    dosage: expect.any(Array),
    duration: expect.any(Array),
    effects: expect.any(Array),
    interactions: expect.any(Array),
    legal: expect.any(Array),
    internationalLaw: expect.any(Array),
    narrativeContent: {
      experienceReports: expect.any(Array),
      synthesis: expect.any(Array),
      qualitativeComments: expect.any(Array),
      generalNotes: expect.any(Array),
    },
    sectionsExtracted: expect.any(Array),
  });
}

function assertCanonicalSourceAttribution(result: ParserResult, sourceId: string) {
  for (const field of ["dosage", "duration", "effects", "interactions", "legal", "internationalLaw"] as const) {
    for (const record of result[field]) {
      expect(record).toMatchObject({ source: sourceId });
    }
  }

  if (result.tolerance) expect(result.tolerance.source).toBe(sourceId);
  if (result.chemistry?.sources) expect(result.chemistry.sources).toEqual([sourceId]);
  if (result.pharmacology?.sources) expect(result.pharmacology.sources).toEqual([sourceId]);
  if (result.harmReduction?.sources) expect(result.harmReduction.sources).toEqual([sourceId]);

  for (const records of Object.values(result.narrativeContent)) {
    for (const record of records) {
      expect(record).toMatchObject({ source: sourceId });
    }
  }
}

function assertNormalizedStructuredUnits(result: ParserResult) {
  for (const dosage of result.dosage) {
    for (const range of Object.values(dosage.ranges)) {
      expect(range).toMatchObject({ unit: expect.stringMatching(/^(µg|mg|g|ml)$/) });
      if (range.min !== undefined) expect(typeof range.min).toBe("number");
      if (range.max !== undefined) expect(typeof range.max).toBe("number");
    }
  }

  for (const duration of result.duration) {
    for (const stage of Object.values(duration.stages)) {
      expect(stage).toMatchObject({ unit: expect.stringMatching(/^(minutes|hours)$/) });
      if (stage.min !== undefined) expect(typeof stage.min).toBe("number");
      if (stage.max !== undefined) expect(typeof stage.max).toBe("number");
    }
  }
}

function assertSectionsReflectSharedFields(result: ParserResult) {
  for (const [field, section] of Object.entries(standardSectionByField) as Array<
    [keyof typeof standardSectionByField, string]
  >) {
    const value = result[field];
    const hasExtractedValue = Array.isArray(value) ? value.length > 0 : Boolean(value);
    if (hasExtractedValue) {
      expect(result.sectionsExtracted).toContain(section);
    }
  }
}

function describeParserContract(
  parser: SourceParser,
  fixtures: ParserContractFixture[],
  gaps: ParserContractGap = {},
) {
  describe(`${parser.sourceId} SourceParser contract`, () => {
    const descriptor = describeSource(parser.sourceId);

    it("is backed by a canonical parseable source descriptor", () => {
      expect(descriptor).toMatchObject({
        id: parser.sourceId,
        capability: "parseable",
        displayName: expect.any(String),
      });
    });

    const emptyInputTest = gaps.emptyInput ? it.todo : it;
    emptyInputTest("returns the complete empty ParserResult shape for empty input", () => {
      expect(parser.parse("", "Contract Fixture")).toEqual(createEmptyParserResult());
    });

    if (gaps.emptyInput) {
      it("records the empty-input contract gap", () => {
        expect(gaps.emptyInput).toBeTruthy();
      });
    }

    if (gaps.structuredUnits) {
      it.todo("normalizes dose and duration units where structured records are emitted");
    }

    for (const fixture of fixtures) {
      it(`satisfies shared contract invariants for ${fixture.name}`, () => {
        expect(fixture.sourceId).toBe(parser.sourceId);
        expect(descriptor?.id).toBe(parser.sourceId);

        const result = parser.parse(fixture.content, fixture.substanceName);

        assertCompleteParserResultShape(result);
        assertCanonicalSourceAttribution(result, parser.sourceId);
        if (!gaps.structuredUnits) assertNormalizedStructuredUnits(result);
        assertSectionsReflectSharedFields(result);
        expect(result.sectionsExtracted).toEqual(expect.arrayContaining(fixture.expectedSections));

        for (const [field, expectedRecords] of Object.entries(fixture.expectedArrayRecords ?? {}) as Array<
          [keyof ParserResult, unknown[]]
        >) {
          expect(result[field]).toMatchObject(expectedRecords);
        }

        for (const [field, expectedObject] of Object.entries(fixture.expectedObjects ?? {}) as Array<
          [keyof NonNullable<ParserContractFixture["expectedObjects"]>, unknown]
        >) {
          expect(result[field]).toMatchObject(expectedObject as object);
        }

        for (const [field, expectedRecords] of Object.entries(fixture.expectedNarrative ?? {}) as Array<
          [keyof NarrativeContent, unknown[]]
        >) {
          expect(result.narrativeContent[field]).toEqual(expect.arrayContaining(expectedRecords));
        }
      });

      it(`does not emit malformed structured records for unsupported ${fixture.name} sections`, () => {
        const result = parser.parse(
          fixture.malformedContent ?? "## Dosage\n- Common: not available\n\n## Duration\n- Total: unknown",
          fixture.substanceName,
        );

        assertCompleteParserResultShape(result);
        assertCanonicalSourceAttribution(result, parser.sourceId);
        expect(result.dosage).toEqual([]);
        expect(result.duration).toEqual([]);
      });
    }
  });
}

const parserContractFixtures: ParserContractFixture[] = [
  {
    name: "TripSit factsheet dosage, duration, and interaction records",
    sourceId: "tripsit-factsheets",
    substanceName: "2C-B",
    content: `## Dosage
### Oral
- Threshold: 5 mg
- Common: 10-20 mg

## Duration
### Oral
- Onset: 20-40 minutes
- Total: 4-6 hours

## Interactions
### Dangerous
- Tramadol`,
    expectedSections: ["dosage", "duration", "interactions"],
    expectedArrayRecords: {
      dosage: [
        expect.objectContaining({
          route: "Oral",
          ranges: { threshold: { min: 5, max: 5, unit: "mg" }, common: { min: 10, max: 20, unit: "mg" } },
        }),
      ],
      duration: [
        expect.objectContaining({
          route: "Oral",
          stages: { onset: { min: 20, max: 40, unit: "minutes" }, total: { min: 4, max: 6, unit: "hours" } },
        }),
      ],
      interactions: [expect.objectContaining({ substance: "Tramadol", severity: "dangerous" })],
    },
  },
  {
    name: "TripSit wiki narrative and structured route records",
    sourceId: "tripsit-wiki",
    substanceName: "Fixtureamine",
    content: `TripSit wiki intro paragraph with enough prose to count as preserved narrative content for the parser contract fixture.

## Dosage
| Common | 100-200 mg |

## Duration
- Onset: Oral: 30-45 minutes
- Duration: Oral: 3-5 hours

## Harm Reduction
Maintain hydration.
- Start low`,
    expectedSections: ["dosage", "duration", "introduction", "harm_reduction"],
    expectedArrayRecords: {
      dosage: [expect.objectContaining({ route: "Oral", ranges: { common: { min: 100, max: 200, unit: "mg" } } })],
      duration: [
        expect.objectContaining({
          route: "Oral",
          stages: { onset: { min: 30, max: 45, unit: "minutes" }, total: { min: 3, max: 5, unit: "hours" } },
        }),
      ],
    },
    expectedObjects: {
      harmReduction: { rules: ["Start low"], sources: ["tripsit-wiki"] },
    },
    expectedNarrative: {
      generalNotes: [expect.objectContaining({ section: "introduction" })],
    },
  },
  {
    name: "PsychonautWiki route, effects, and safety records",
    sourceId: "psychonautwiki",
    substanceName: "Testamine",
    content: `## Dosage & Duration
### Oral
**Dosage:**
- Threshold: 20 mg
- Common: 40 - 80 mg
**Duration:**
- Onset: 30 - 45 minutes
- Total: 4 - 6 hours

## Subjective effects
### Physical effects
- **Stimulation**
### Cognitive effects
- **Conceptual thinking**

## Toxicity and harm potential
- Avoid combining with depressants.
- Users should remain hydrated.

### Dangerous interactions
- **Tramadol** - Seizure risk`,
    expectedSections: ["dosage", "duration", "effects", "interactions", "harm_reduction"],
    expectedArrayRecords: {
      dosage: [
        expect.objectContaining({
          route: "Oral",
          ranges: {
            threshold: { min: 20, max: 20, unit: "mg" },
            common: { min: 40, max: 80, unit: "mg" },
          },
        }),
      ],
      duration: [
        expect.objectContaining({
          route: "Oral",
          stages: {
            onset: { min: 30, max: 45, unit: "minutes" },
            total: { min: 4, max: 6, unit: "hours" },
          },
        }),
      ],
      effects: [expect.objectContaining({ name: "Stimulation" }), expect.objectContaining({ name: "Conceptual thinking" })],
      interactions: [expect.objectContaining({ substance: "Tramadol", severity: "dangerous" })],
    },
    expectedObjects: {
      harmReduction: { rules: ["Users should remain hydrated."], sources: ["psychonautwiki"] },
    },
  },
  {
    name: "Erowid dosage and effects records",
    sourceId: "erowid",
    substanceName: "Ketamine",
    content: `## Dosage
**Oral**
- Threshold: 5 mg
- Common: 10-15 mg

## Effects
EFFECTS LIST #
POSITIVE
- Euphoria
NEUTRAL
- Time distortion
NEGATIVE
- Anxiety`,
    expectedSections: ["dosage", "effects"],
    expectedArrayRecords: {
      dosage: [
        expect.objectContaining({
          route: "Oral",
          ranges: { threshold: { min: 5, max: 5, unit: "mg" }, common: { min: 10, max: 15, unit: "mg" } },
        }),
      ],
      effects: [
        expect.objectContaining({ name: "Euphoria", category: "positive" }),
        expect.objectContaining({ name: "Time distortion", category: "neutral" }),
        expect.objectContaining({ name: "Anxiety", category: "negative" }),
      ],
    },
  },
  {
    name: "DrugBank chemistry, pharmacology, and interaction records",
    sourceId: "drugbank",
    substanceName: "Fixtureamine",
    content: `## Overview
### Description
Fixtureamine is a synthetic DrugBank fixture.

## Chemical Information
**Chemical Formula:** C
13
H
18
O
2
**SMILES:** CC1=CC=CC=C1O

## Additional Information
### Half-life
About 6 hours in this fixture.

### Drug Interactions
Tramadol
Can be increased and may raise the risk or severity of serotonin syndrome.`,
    expectedSections: ["chemistry", "pharmacology", "interactions", "overview"],
    expectedArrayRecords: {
      interactions: [expect.objectContaining({ substance: "Tramadol", severity: "dangerous" })],
    },
    expectedObjects: {
      chemistry: { formula: "C13H18O2", smiles: "CC1=CC=CC=C1O", sources: ["drugbank"] },
      pharmacology: { halfLife: "About 6 hours in this fixture.", sources: ["drugbank"] },
    },
    expectedNarrative: {
      generalNotes: [expect.objectContaining({ section: "description" })],
    },
  },
  {
    name: "Wikipedia pharmacology and legal records",
    sourceId: "wikipedia",
    substanceName: "Fixtureamine",
    content: `## Pharmacology
### Half-life
Fixtureamine has a half-life of about 4 hours in this parser fixture.

## Legal status
United States - Schedule I controlled substance
Covered by the 1971 Convention on Psychotropic Substances.`,
    expectedSections: ["pharmacology", "legal", "international_law"],
    expectedArrayRecords: {
      legal: [expect.objectContaining({ country: "United States", status: "Schedule I" })],
      internationalLaw: [
        expect.objectContaining({ treaty: "UN Convention on Psychotropic Substances 1971" }),
      ],
    },
    expectedObjects: {
      pharmacology: {
        halfLife: "Fixtureamine has a half-life of about 4 hours in this parser fixture.",
        sources: ["wikipedia"],
      },
    },
  },
  {
    name: "DEIS route dosage, duration, effects, and narrative records",
    sourceId: "disregardeverythingisay",
    substanceName: "LSD",
    content: `Dosage (Oral)
*Threshold* : 20 µg
*Common* : 50-100 µg

Duration (Oral)
*Onset* : 45-60 minutes
*Duration* : 8-12 hours

**Health Effects, Potential Addiction, and Tolerance:**
Tolerance builds quickly and can alter the intensity of subsequent sessions.

**Physical effects:**
- **Stimulation** - Increased bodily energy`,
    expectedSections: ["dosage", "duration", "effects", "health_tolerance"],
    expectedArrayRecords: {
      dosage: [
        expect.objectContaining({
          route: "Oral",
          ranges: {
            threshold: { min: 20, max: 20, unit: "µg" },
            common: { min: 50, max: 100, unit: "µg" },
          },
        }),
      ],
      duration: [
        expect.objectContaining({
          route: "Oral",
          stages: {
            onset: { min: 45, max: 60, unit: "minutes" },
            total: { min: 8, max: 12, unit: "hours" },
          },
        }),
      ],
      effects: [expect.objectContaining({ name: "Stimulation" })],
    },
    expectedNarrative: {
      generalNotes: [expect.objectContaining({ section: "health_and_tolerance" })],
    },
  },
  {
    name: "IsomerDesign chemistry, dose, duration, and narrative records",
    sourceId: "isomerdesign",
    substanceName: "Fixtureamine",
    content: `**IUPAC Name:** 2-ethyl fictional parser compound
**Molecular Formula:** C13H18O2
**SMILES:** CC1=CC=CC=C1O

## DOSAGE
100-200 mg

## DURATION
4-6 hours

## QUALITATIVE COMMENTS
This fixture keeps qualitative comments in the shared narrative content shape.`,
    expectedSections: ["chemistry", "dosage", "duration", "qualitative_comments"],
    expectedArrayRecords: {
      dosage: [expect.objectContaining({ route: "Oral", ranges: { common: { min: 100, max: 200, unit: "mg" } } })],
      duration: [expect.objectContaining({ route: "Oral", stages: { total: { min: 4, max: 6, unit: "hours" } } })],
    },
    expectedObjects: {
      chemistry: { formula: "C13H18O2", smiles: "CC1=CC=CC=C1O", sources: ["isomerdesign"] },
    },
    expectedNarrative: {
      qualitativeComments: [expect.objectContaining({ content: expect.stringContaining("qualitative comments") })],
    },
  },
  {
    name: "SaferParty harm-reduction and narrative records",
    sourceId: "saferparty",
    substanceName: "Fixtureamine",
    content: `## Effects
This section describes expected subjective and physical effects in enough detail for narrative preservation.

## Safer Use
- Start low
- Avoid mixing

### Short-term Risks
Anxiety and overheating may occur.

### Long-term Risks
Frequent use may increase tolerance.`,
    expectedSections: ["effects_narrative", "harm_reduction"],
    expectedObjects: {
      harmReduction: {
        rules: ["Start low", "Avoid mixing"],
        shortTermRisks: ["Anxiety and overheating may occur."],
        longTermRisks: ["Frequent use may increase tolerance."],
        sources: ["saferparty"],
      },
    },
    expectedNarrative: {
      generalNotes: [expect.objectContaining({ section: "effects" })],
    },
  },
  {
    name: "Drug Users Bible duration and experience records",
    sourceId: "drugusersbible",
    substanceName: "Fixtureamine",
    content: `## Quick Reference
- ROA: Oral
- Onset/Duration: 30 Minutes / 4 Hours

## Subjective Experience
This fixture preserves a first-person narrative report for the shared narrative contract.`,
    expectedSections: ["duration", "experience"],
    expectedArrayRecords: {
      duration: [expect.objectContaining({ route: "Oral", stages: { onset: { min: 30, max: 30, unit: "Minutes" }, total: { min: 4, max: 4, unit: "Hours" } } })],
    },
    expectedNarrative: {
      experienceReports: [expect.objectContaining({ content: expect.stringContaining("first-person narrative") })],
    },
  },
  {
    name: "The Drug Classroom dose, duration, chemistry, and legal records",
    sourceId: "thedrugclassroom",
    substanceName: "Fixtureamine",
    content: `## Dose
- Common: 10-20 mg

## Timeline
- Onset: 20-40 minutes
- Total: 4-6 hours

## Chemistry
SMILES: CC1=CC=CC=C1O
Molecular formula: C13H18O2

## Legal Status
#### United States
Schedule I controlled substance`,
    expectedSections: ["dosage", "duration", "chemistry", "legal"],
    expectedArrayRecords: {
      dosage: [expect.objectContaining({ route: "Oral", ranges: { common: { min: 10, max: 20, unit: "mg" } } })],
      duration: [expect.objectContaining({ route: "Oral", stages: { onset: { min: 20, max: 40, unit: "minutes" }, total: { min: 4, max: 6, unit: "hours" } } })],
      legal: [expect.objectContaining({ country: "United States", status: "Schedule I" })],
    },
    expectedObjects: {
      chemistry: { formula: "C13H18O2", sources: ["thedrugclassroom"] },
    },
  },
];

describe("SourceParser contract fixture harness", () => {
  for (const fixture of parserContractFixtures) {
    const parser = parsers[fixture.sourceId];
    if (!parser) {
      throw new Error(`Missing parser fixture Adapter: ${fixture.sourceId}`);
    }

    describeParserContract(parser, [fixture], parserContractGaps[fixture.sourceId]);
  }

  it("preserves source-id normalization in registry lookup", () => {
    const result = parseSource(
      "EROWID",
      `## Effects
EFFECTS LIST #
POSITIVE
- Euphoria`,
      "Ketamine",
    );

    expect(result?.effects[0]).toMatchObject({
      name: "Euphoria",
      source: "erowid",
    });
  });

  it("returns undefined for unsupported source IDs", () => {
    expect(parseSource("unknown-source", "content", "LSD")).toBeUndefined();
  });
});

describe("parser aggregation contracts", () => {
  it("aggregates parsed source fields through policy modules", () => {
    const records: ParsedSourceRecord[] = [
      {
        sourceId: "wikipedia",
        displayName: "Wikipedia",
        tokens: 12,
        result: {
          ...createEmptyParserResult(),
          dosage: [
            {
              route: "Oral",
              source: "wikipedia",
              confidence: "medium",
              ranges: { common: { min: 10, max: 20, unit: "mg" } },
            },
          ],
          chemistry: {
            formula: "C20H25N3O",
            sources: ["wikipedia"],
          },
          pharmacology: {
            halfLife: "4 hours",
            mechanismOfAction: ["Wikipedia mechanism"],
            sources: ["wikipedia"],
          },
          harmReduction: {
            rules: ["Start low"],
            shortTermRisks: ["Anxiety"],
            sources: ["wikipedia"],
          },
          narrativeContent: {
            experienceReports: [{ source: "wikipedia", content: "Report" }],
            synthesis: [],
            qualitativeComments: [],
            generalNotes: [],
          },
          sectionsExtracted: ["dosage", "chemistry", "pharmacology"],
        },
      },
      {
        sourceId: "drugbank",
        displayName: "DrugBank",
        tokens: 8,
        result: {
          ...createEmptyParserResult(),
          effects: [{ name: "Stimulation", category: "positive", source: "drugbank" }],
          pharmacology: {
            halfLife: "3 hours",
            bioavailability: "71%",
            sources: ["drugbank"],
          },
          harmReduction: {
            rules: ["Avoid redosing"],
            longTermRisks: ["Tolerance"],
            contraindications: ["MAOIs"],
            sources: ["drugbank"],
          },
          tolerance: { rawText: "Tolerance builds quickly.", source: "drugbank" },
          sectionsExtracted: ["effects", "pharmacology", "harmReduction", "tolerance"],
        },
      },
    ];

    const aggregated = aggregateResults("lsd", "LSD", records);

    expect(aggregated.dosage).toHaveLength(1);
    expect(aggregated.effects).toEqual([
      { name: "Stimulation", category: "positive", source: "drugbank" },
    ]);
    expect(aggregated.chemistry).toMatchObject({
      formula: "C20H25N3O",
      sources: ["wikipedia"],
    });
    expect(aggregated.harmReduction).toEqual({
      rules: ["Start low", "Avoid redosing"],
      shortTermRisks: ["Anxiety"],
      longTermRisks: ["Tolerance"],
      contraindications: ["MAOIs"],
      sources: ["wikipedia", "drugbank"],
    });
    expect(aggregated.tolerance).toEqual([
      { rawText: "Tolerance builds quickly.", source: "drugbank" },
    ]);
    expect(aggregated.narrativeContent.experienceReports).toEqual([
      { source: "wikipedia", content: "Report" },
    ]);
    expect(aggregated.sourcesCoverage).toEqual([
      {
        sourceId: "wikipedia",
        displayName: "Wikipedia",
        sectionsExtracted: ["dosage", "chemistry", "pharmacology"],
        tokensOriginal: 12,
      },
      {
        sourceId: "drugbank",
        displayName: "DrugBank",
        sectionsExtracted: ["effects", "pharmacology", "harmReduction", "tolerance"],
        tokensOriginal: 8,
      },
    ]);
    expect(aggregated.pharmacology).toEqual({
      sources: ["wikipedia", "drugbank"],
      halfLife: "3 hours",
      bioavailability: "71%",
      mechanismOfAction: ["Wikipedia mechanism"],
    });
    expect(Object.keys(aggregated.pharmacology ?? {})).not.toEqual(
      expect.arrayContaining(["_src_wikipedia", "_src_drugbank"]),
    );
  });

  it("applies TripSit combo enrichment without mutating aggregate objects in place", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "dose-wiki-combos-"));
    const combosPath = join(tempDir, "combos.json");

    writeFileSync(
      combosPath,
      JSON.stringify({
        lsd: {
          alcohol: { status: "Unsafe", note: "Higher confusion risk" },
          cannabis: { status: "Caution", note: "Can intensify effects" },
        },
      }),
    );

    const originalAggregate = aggregateResults("lsd", "LSD", [
      {
        sourceId: "drugbank",
        displayName: "DrugBank",
        tokens: 5,
        result: {
          ...createEmptyParserResult(),
          interactions: [
            {
              substance: "Alcohol",
              severity: "caution",
              description: "Older note",
              source: "drugbank",
            },
          ],
          sectionsExtracted: ["interactions"],
        },
      },
    ]);
    const substances = { lsd: originalAggregate };

    try {
      const stats = enrichWithCombos(substances, combosPath);

      expect(stats).toEqual({
        substancesEnriched: 1,
        interactionsAdded: 1,
        interactionsOverridden: 1,
        categoriesMapped: { lsd: 1 },
      });
      expect(substances.lsd).not.toBe(originalAggregate);
      expect(originalAggregate.interactions).toEqual([
        {
          substance: "Alcohol",
          severity: "caution",
          description: "Older note",
          source: "drugbank",
        },
      ]);
      expect(substances.lsd.interactions).toEqual([
        {
          substance: "Alcohol",
          severity: "unsafe",
          description: "Higher confusion risk",
          source: "tripsit-combos",
        },
        {
          substance: "Cannabis",
          severity: "caution",
          description: "Can intensify effects",
          source: "tripsit-combos",
        },
      ]);
      expect(substances.lsd.sourcesCoverage[substances.lsd.sourcesCoverage.length - 1]).toEqual({
        sourceId: "tripsit-combos",
        displayName: "TripSit Combination Guide",
        sectionsExtracted: ["interactions"],
        tokensOriginal: 0,
      });
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("creates parsed output stats from policy-aggregated substances", () => {
    const lsd = aggregateResults("lsd", "LSD", [
      {
        sourceId: "psychonautwiki",
        displayName: "PsychonautWiki",
        tokens: 10,
        result: {
          ...createEmptyParserResult(),
          effects: [{ name: "Pattern recognition", source: "psychonautwiki" }],
          sectionsExtracted: ["effects"],
        },
      },
      {
        sourceId: "tripsit-factsheets",
        displayName: "TripSit Factsheets",
        tokens: 15,
        result: {
          ...createEmptyParserResult(),
          interactions: [
            { substance: "Lithium", severity: "dangerous", source: "tripsit-factsheets" },
          ],
          sectionsExtracted: ["interactions"],
        },
      },
    ]);

    const output = createParsedOutput({ lsd });

    expect(output).toMatchObject({
      version: "1.0.0",
      stats: {
        totalSubstances: 1,
        sourcesProcessed: ["psychonautwiki", "tripsit-factsheets"],
        avgCoveragePerSubstance: 2,
      },
      substances: { lsd },
    });
    expect(new Date(output.generatedAt).toString()).not.toBe("Invalid Date");
  });

  it("parses TripSit multi-route duration helpers used by the shared parser", () => {
    const dictParsed = parseNestedDurationDict(
      "{'_unit': 'minutes', 'Insufflated': '10-15', 'Intravenous': '0-5'}",
    );
    const inlineParsed = parseInlineMultiRouteDuration(
      "Insufflated: 5-10, Intravenous: 0-2, Oral: 20-70 minutes",
    );

    expect(detectInlineRoutes("Insufflated: 10-15, Oral: 60-90 minutes")).toEqual([
      "Insufflated",
      "Oral",
    ]);
    expect(resolveRouteDurationValue(dictParsed!, "Intravenous")).toEqual({
      value: "0-5",
      unit: "minutes",
    });
    expect(resolveRouteDurationValue(inlineParsed!, "Oral")).toEqual({
      value: "20-70",
      unit: "minutes",
    });
  });
});
