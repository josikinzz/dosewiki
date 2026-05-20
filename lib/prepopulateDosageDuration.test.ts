import { describe, expect, it } from "vitest";

import {
  mergeDoseTiers,
  normalizeRoute,
  selectBestDurationPerRoute,
  selectSafestDoseSource,
  transformDosage,
} from "../scripts/prepopulate/dosage-duration/index.mjs";

describe("prepopulate dosage-duration helpers", () => {
  it("normalizes routes consistently", () => {
    expect(normalizeRoute("intranasal")).toBe("Insufflated");
    expect(normalizeRoute("hawaiian baby woodrose")).toBe("Oral");
    expect(normalizeRoute("Rectal")).toBe("Rectal");
  });

  it("selects the safest weighted dose source", () => {
    const selected = selectSafestDoseSource([
      {
        source: "psychonautwiki",
        ranges: {
          common: { min: 40, max: 80, unit: "mg" },
          strong: { min: 80, max: 120, unit: "mg" },
        },
      },
      {
        source: "erowid",
        ranges: {
          common: { min: 20, max: 40, unit: "mg" },
          strong: { min: 40, max: 60, unit: "mg" },
        },
      },
    ]);

    expect(selected?.source).toBe("erowid");
  });

  it("merges safer base tiers with completeness from other sources", () => {
    const merged = mergeDoseTiers([
      {
        source: "erowid",
        route: "oral",
        ranges: {
          common: { min: 10, max: 20, unit: "mg" },
          strong: { min: 20, max: 30, unit: "mg" },
        },
      },
      {
        source: "psychonautwiki",
        route: "oral",
        ranges: {
          threshold: { min: 5, max: null, unit: "mg" },
          light: { min: 7, max: 10, unit: "mg" },
          common: { min: 12, max: 24, unit: "mg" },
          heavy: { min: 40, max: null, unit: "mg" },
        },
      },
    ]);

    expect(merged?.source).toBe("erowid");
    expect(merged?.ranges.threshold).toEqual({ min: 5, max: null, unit: "mg" });
    expect(merged?.ranges.light).toEqual({ min: 7, max: 10, unit: "mg" });
    expect(merged?.ranges.strong).toEqual({ min: 20, max: 30, unit: "mg" });
    expect(merged?.mergedFrom).toEqual(["erowid", "psychonautwiki"]);
  });

  it("prefers more complete duration data before source priority", () => {
    const selected = selectBestDurationPerRoute([
      {
        source: "psychonautwiki",
        route: "oral",
        stages: {
          onset: { min: 20, max: 40, unit: "minutes" },
        },
      },
      {
        source: "erowid",
        route: "oral",
        stages: {
          onset: { min: 15, max: 30, unit: "minutes" },
          peak: { min: 2, max: 3, unit: "hours" },
          total: { min: 4, max: 6, unit: "hours" },
        },
      },
    ]);

    expect(selected).toHaveLength(1);
    expect(selected[0].source).toBe("erowid");
  });

  it("transforms dosage into schema shape with moderate/heavy normalization", () => {
    const transformed = transformDosage([
      {
        source: "erowid",
        route: "intranasal",
        bioavailability: "50-60%3",
        notes: "note",
        ranges: {
          light: { min: 10, max: 15, unit: "ug" },
          common: { min: 15, max: 20, unit: "ug" },
          strong: { min: 20, max: 30, unit: "ug" },
        },
      },
    ]);

    expect(transformed.routes).toHaveLength(1);
    expect(transformed.routes[0].route).toBe("Insufflated");
    expect(transformed.routes[0].bioavailability).toBe("50-60%");
    expect(transformed.routes[0].dose_ranges.threshold).toEqual({ min: 10, max: null, unit: "µg" });
    expect(transformed.routes[0].dose_ranges.moderate).toEqual({ min: 15, max: 20, unit: "µg" });
    expect(transformed.routes[0].dose_ranges.heavy).toEqual({ min: 30, max: null, unit: "µg" });
  });
});
