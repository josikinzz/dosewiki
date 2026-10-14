import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { aggregateResults } from "../scripts/parsers/aggregation";
import { createEmptyParserResult, parseDoseRange, parseDurationRange } from "../scripts/parsers/base";
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

describe("parser aggregation contracts", () => {
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
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
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
