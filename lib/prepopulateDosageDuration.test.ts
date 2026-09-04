import { describe, expect, it } from "vitest";

import {
  mergeDoseTiers,
  normalizeRoute,
  processArticles,
  selectBestDurationPerRoute,
  selectSafestDoseSource,
  transformDosage,
} from "../scripts/prepopulate/dosage-duration/index.mjs";
import { getComparableUpperBound } from "../scripts/prepopulate/dosage-duration/dosage.mjs";

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

describe("comparable upper bound", () => {
  it("normalizes microgram and gram units to milligrams", () => {
    expect(getComparableUpperBound({ heavy: { min: 300, unit: "µg" } })).toEqual({ value: 0.3, isWeight: true });
    expect(getComparableUpperBound({ heavy: { min: 250, unit: "ug" } })).toEqual({ value: 0.25, isWeight: true });
    expect(getComparableUpperBound({ heavy: { min: 2, unit: "g" } })).toEqual({ value: 2000, isWeight: true });
    expect(getComparableUpperBound({ heavy: { min: 40, unit: "mg" } })).toEqual({ value: 40, isWeight: true });
  });

  it("falls back from heavy.min through strong.max, strong.min, and common.max", () => {
    const strong = { min: 100, max: 200, unit: "mg" };
    expect(getComparableUpperBound({ common: { min: 50, max: 100, unit: "mg" }, strong }).value).toBe(200);
    expect(getComparableUpperBound({ common: { min: 50, max: 100, unit: "mg" }, strong: { min: 100, unit: "mg" } }).value).toBe(100);
    expect(getComparableUpperBound({ light: { min: 25, max: 50, unit: "mg" }, common: { min: 50, max: 90, unit: "mg" } }).value).toBe(90);
    expect(getComparableUpperBound({ light: { min: 25, max: 50, unit: "mg" } })).toEqual({ value: Infinity, isWeight: true });
    expect(getComparableUpperBound(undefined)).toEqual({ value: Infinity, isWeight: true });
  });

  it("reports non-weight units instead of comparing them", () => {
    expect(getComparableUpperBound({ common: { min: 1, max: 3, unit: "lungs" } })).toEqual({ value: 3, isWeight: false, unit: "lungs" });
  });
});

describe("safest dose source across units", () => {
  it("compares sources in milligrams even when they report different units", () => {
    // 0.3 mg is the larger dose although its number is smaller than 250.
    const selected = selectSafestDoseSource([
      { source: "erowid", ranges: { heavy: { min: 0.3, unit: "mg" } } },
      { source: "psychonautwiki", ranges: { heavy: { min: 250, unit: "µg" } } },
    ]);
    expect(selected?.source).toBe("psychonautwiki");
  });

  it("prefers the more complete source when upper bounds tie", () => {
    const selected = selectSafestDoseSource([
      { source: "psychonautwiki", ranges: { strong: { min: 40, max: 80, unit: "mg" } } },
      { source: "erowid", ranges: { light: { min: 10, max: 20, unit: "mg" }, common: { min: 20, max: 40, unit: "mg" }, strong: { min: 40, max: 80, unit: "mg" } } },
    ]);
    expect(selected?.source).toBe("erowid");
  });

  it("ignores non-weight sources whenever a weight source exists", () => {
    const selected = selectSafestDoseSource([
      { source: "erowid", ranges: { common: { min: 1, max: 2, unit: "lungs" } } },
      { source: "drugusersbible", ranges: { common: { min: 500, max: 900, unit: "mg" } } },
    ]);
    expect(selected?.source).toBe("drugusersbible");
  });

  it("falls back to source priority when every source uses a non-weight unit", () => {
    const entries = [
      { source: "psychonautwiki", ranges: { common: { min: 1, max: 2, unit: "lungs" } } },
      { source: "tripsit-factsheets", ranges: { common: { min: 4, max: 6, unit: "lungs" } } },
      { source: "erowid", ranges: { common: { min: 3, max: 5, unit: "lungs" } } },
    ];
    expect(selectSafestDoseSource(entries)?.source).toBe("erowid");
    expect(selectSafestDoseSource(entries.filter((entry) => entry.source !== "erowid"))?.source).toBe("tripsit-factsheets");
  });
});

describe("duration source priority", () => {
  const stages = { onset: { min: 20, max: 40, unit: "minutes" }, total: { min: 4, max: 6, unit: "hours" } };

  it("breaks equal-completeness ties by PsychonautWiki, then Erowid, then TripSit", () => {
    const entries = [
      { source: "tripsit-factsheets", route: "oral", stages },
      { source: "erowid", route: "oral", stages },
      { source: "psychonautwiki", route: "oral", stages },
    ];
    expect(selectBestDurationPerRoute(entries).map((entry) => entry.source)).toEqual(["psychonautwiki"]);
    expect(selectBestDurationPerRoute(entries.slice(0, 2)).map((entry) => entry.source)).toEqual(["erowid"]);
  });

  it("orders routes by the highest priority source before appending the rest", () => {
    const selected = selectBestDurationPerRoute([
      { source: "erowid", route: "insufflated", stages },
      { source: "psychonautwiki", route: "oral", stages },
      { source: "psychonautwiki", route: "smoked", stages },
    ]);
    expect(selected.map((entry) => entry.route)).toEqual(["oral", "smoked", "insufflated"]);
  });
});

describe("processArticles field preservation", () => {
  const parsed = {
    substances: {
      "test-substance": {
        dosage: [
          { source: "erowid", route: "oral", ranges: { common: { min: 20, max: 40, unit: "mg" }, strong: { min: 40, max: 60, unit: "mg" } } },
        ],
        duration: [
          { source: "psychonautwiki", route: "oral", stages: { onset: { min: 20, max: 40, unit: "minutes" } } },
        ],
      },
    },
  };

  const article = {
    id: "test-substance",
    title: "Test Substance",
    index_categories: ["stimulant"],
    identification: { iupac_name: "test", smiles: "C" },
    summary: "A test substance.",
    subjective_effects: { physical: ["stimulation"] },
    pharmacology: { mechanism: "unknown" },
    harm_potential: { addiction: "low" },
    legality: { countries: [{ country: "Nowhere", status: "legal" }] },
    citations: ["a"],
    dosage: { routes: [{ route: "Oral", dose_ranges: { light: { min: 1, max: 2, unit: "mg" } } }] },
    duration: { routes: [] },
  };

  it("replaces only dosage and duration and leaves the input untouched", () => {
    const articles = [structuredClone(article)];
    const { modifiedArticles, stats } = processArticles({ articles, parsed, targetSubstances: null, logger: { log() {} } });

    expect(articles).toEqual([article]);
    const [updated] = modifiedArticles;
    expect(updated).not.toBe(articles[0]);

    const { dosage: _dosage, duration: _duration, ...untouched } = updated;
    const { dosage: _beforeDosage, duration: _beforeDuration, ...before } = article;
    expect(untouched).toEqual(before);

    expect(updated.dosage.routes).toHaveLength(1);
    expect(updated.dosage.routes[0].route).toBe("Oral");
    expect(updated.dosage.routes[0].dose_ranges.moderate).toEqual({ min: 20, max: 40, unit: "mg" });
    expect(updated.duration.routes).toHaveLength(1);
    expect(updated.duration.routes[0].route).toBe("Oral");
    expect(updated.duration.routes[0].stages.onset).toEqual({ min: 20, max: 40, unit: "minutes" });
    expect(stats.overwrittenDosage).toEqual(["Test Substance"]);
    expect(stats.populatedDuration).toEqual(["Test Substance"]);
  });

  it("returns untargeted and unparsed articles as unchanged clones", () => {
    const other = { id: "other", title: "Other", dosage: { routes: [] } };
    const articles = [structuredClone(article), structuredClone(other)];
    const { modifiedArticles, stats } = processArticles({ articles, parsed, targetSubstances: ["other"], logger: { log() {} } });

    expect(modifiedArticles).toEqual([article, other]);
    expect(modifiedArticles[0]).not.toBe(articles[0]);
    expect(stats.skippedNotTargeted).toEqual(["Test Substance"]);
    expect(stats.noData).toEqual(["Other"]);
  });
});
