import { describe, expect, it } from "vitest";

import { createEmptyParserResult, parseDoseRange, parseDurationRange } from "../scripts/parsers/base";
import { saferPartyParser } from "../scripts/parsers/others";
import { parseSource } from "../scripts/parsers/registry";

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

describe("parser contract fixtures", () => {
  it("parses PsychonautWiki dosage, duration, and effects into the shared contract", () => {
    const result = parseSource(
      "psychonautwiki",
      `## Dosage & Duration
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
### Visual effects
- **Pattern recognition**
### Cognitive effects
- **Conceptual thinking**`,
      "LSD",
    );

    expect(result).toBeDefined();
    expect(result?.dosage[0]).toMatchObject({
      route: "Oral",
      source: "psychonautwiki",
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
    ]);
  });

  it("parses Erowid dosage and effects fixtures into normalized shared records", () => {
    const result = parseSource(
      "erowid",
      `## Dosage
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
      "Ketamine",
    );

    expect(result).toBeDefined();
    expect(result?.dosage[0]).toMatchObject({
      route: "Oral",
      source: "erowid",
      ranges: {
        threshold: { min: 5, max: 5, unit: "mg" },
        common: { min: 10, max: 15, unit: "mg" },
      },
    });
    expect(result?.effects).toEqual([
      {
        name: "Euphoria",
        category: "positive",
        source: "erowid",
      },
      {
        name: "Time distortion",
        category: "neutral",
        source: "erowid",
      },
      {
        name: "Anxiety",
        category: "negative",
        source: "erowid",
      },
    ]);
    expect(result?.sectionsExtracted).toContain("effects");
    expect(result?.sectionsExtracted).toContain("dosage");
    expect(result?.legal).toEqual([]);
    expect(result?.internationalLaw).toEqual([]);
  });

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

  it("parses TripSit factsheet fixtures into shared dosage, duration, and interaction records", () => {
    const result = parseSource(
      "tripsit-factsheets",
      `## Dosage
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
      "2C-B",
    );

    expect(result).toBeDefined();
    expect(result?.dosage[0]).toMatchObject({
      route: "Oral",
      source: "tripsit-factsheets",
    });
    expect(result?.duration[0]).toMatchObject({
      route: "Oral",
      stages: {
        onset: { min: 20, max: 40, unit: "minutes" },
        total: { min: 4, max: 6, unit: "hours" },
      },
    });
    expect(result?.interactions[0]).toMatchObject({
      substance: "Tramadol",
      severity: "dangerous",
      source: "tripsit-factsheets",
    });
  });

  it("returns the empty contract shape for unsupported or empty parser input", () => {
    expect(parseSource("unknown-source", "content", "LSD")).toBeUndefined();
    expect(saferPartyParser.parse("", "LSD")).toEqual(createEmptyParserResult());
  });
});
