import { describe, expect, it } from "vitest";

import { buildDosageDurationMatcherResults } from "./formal-citations-dosage-duration-matcher.mjs";

describe("formal citation dosage-duration matcher", () => {
  it("matches dosage-duration parsed sources behind a focused matcher seam", () => {
    const matcherResults = buildDosageDurationMatcherResults({
      article: {
        dosage: {
          routes: [
            {
              route: "oral",
              dose_ranges: {
                threshold: { min: 2, max: 5, unit: "mg" },
                light: { min: 5, max: 15, unit: "mg" },
              },
            },
          ],
        },
        duration: {
          routes: [
            {
              route: "oral",
              stages: {
                onset: { min: 30, max: 60, unit: "minutes" },
                total_duration: { min: 4, max: 6, unit: "hours" },
              },
            },
          ],
        },
      },
      parsedSubstance: {
        dosage: [
          {
            route: "Oral",
            source: "erowid",
            ranges: {
              threshold: { min: 2, max: 5, unit: "mg" },
              light: { min: 5, max: 15, unit: "mg" },
            },
          },
          {
            route: "Oral",
            source: "psychonautwiki",
            ranges: {
              threshold: { min: 2000, max: 5000, unit: "ug" },
              light: { min: 5000, max: 15000, unit: "ug" },
            },
          },
        ],
        duration: [
          {
            route: "Oral",
            source: "erowid",
            stages: {
              onset: { min: 30, max: 60, unit: "minutes" },
              total: { min: 4, max: 6, unit: "hours" },
            },
          },
        ],
      },
    });

    expect(matcherResults.selectedSourceIds).toEqual(["erowid"]);
    expect(matcherResults.dosage[0]).toMatchObject({
      route: "Oral",
      selectedSourceId: "erowid",
      accepted: true,
    });
    expect(matcherResults.dosage[0].candidates[1]).toMatchObject({
      sourceId: "psychonautwiki",
      unitMismatch: true,
      score: 0,
    });
    expect(matcherResults.duration[0]).toMatchObject({
      route: "Oral",
      selectedSourceId: "erowid",
      accepted: true,
    });
  });
});
