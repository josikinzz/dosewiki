import { describe, expect, it } from "vitest";

import { mergeDosageDuration } from "./apply-gap-generation.mjs";

function emptyDoseRanges(unit = "mg") {
  return {
    threshold: { min: null, max: null, unit },
    light: { min: null, max: null, unit },
    moderate: { min: null, max: null, unit },
    strong: { min: null, max: null, unit },
    heavy: { min: null, max: null, unit },
  };
}

function emptyStages(unit = "hours") {
  return {
    onset: { min: null, max: null, unit },
    come_up: { min: null, max: null, unit },
    peak: { min: null, max: null, unit },
    offset: { min: null, max: null, unit },
    after_effects: { min: null, max: null, unit },
    total_duration: { min: null, max: null, unit },
  };
}

function dosageRoute(route, overrides = {}) {
  return {
    route,
    bioavailability: "",
    bioavailability_notes: "",
    dose_ranges: emptyDoseRanges(),
    notes: "",
    ...overrides,
  };
}

function durationRoute(route, overrides = {}) {
  return {
    route,
    half_life: "",
    half_life_notes: "",
    stages: emptyStages(),
    ...overrides,
  };
}

const emptyLive = { dosage: { routes: [], plateau_dosing: null }, duration: { routes: [] } };

describe("mergeDosageDuration new-route guard", () => {
  it("withholds a hollow scaffolded dosage route", () => {
    const result = mergeDosageDuration(emptyLive, {
      dosage: { routes: [dosageRoute("insufflated")] },
      duration: { routes: [] },
    });

    expect(result.dosage.routes).toEqual([]);
    expect(result.changes).toEqual([]);
    expect(result.skipped).toEqual([
      'dosage: withheld new route "insufflated" (no dose values, bioavailability, or notes)',
    ]);
  });

  it("withholds a hollow scaffolded duration route", () => {
    const result = mergeDosageDuration(emptyLive, {
      dosage: { routes: [] },
      duration: { routes: [durationRoute("oral")] },
    });

    expect(result.duration.routes).toEqual([]);
    expect(result.skipped).toEqual([
      'duration: withheld new route "oral" (no stage values or half-life prose)',
    ]);
  });

  it("withholds a route whose name is a blank echoed template", () => {
    const result = mergeDosageDuration(emptyLive, {
      dosage: { routes: [dosageRoute("", { notes: "some prose" })] },
      duration: { routes: [] },
    });

    expect(result.dosage.routes).toEqual([]);
    expect(result.skipped).toEqual([
      'dosage: withheld new route "" (route name is blank (echoed template))',
    ]);
  });

  it("adds a new dosage route that carries numbers", () => {
    const draftRoute = dosageRoute("oral", {
      dose_ranges: { ...emptyDoseRanges(), light: { min: 10, max: 20, unit: "mg" } },
    });
    const result = mergeDosageDuration(emptyLive, {
      dosage: { routes: [draftRoute] },
      duration: { routes: [] },
    });

    expect(result.dosage.routes).toEqual([draftRoute]);
    expect(result.changes).toEqual(['dosage: added new route "oral"']);
    expect(result.skipped).toEqual([]);
  });

  it("adds a numberless dosage route that carries editorial notes", () => {
    // Salvia's routes explain why no standardized dose ladder exists. Prose is
    // content; the guard must not treat "no numbers" as "no route".
    const draftRoute = dosageRoute("smoked", {
      notes: "Extracts are labelled 5x/10x with no accepted standard, so dose per inhalation is unpredictable.",
    });
    const result = mergeDosageDuration(emptyLive, {
      dosage: { routes: [draftRoute] },
      duration: { routes: [] },
    });

    expect(result.dosage.routes).toEqual([draftRoute]);
    expect(result.skipped).toEqual([]);
  });

  it("adds a numberless duration route that carries half-life prose", () => {
    const draftRoute = durationRoute("oral", { half_life: "1-3 hours" });
    const result = mergeDosageDuration(emptyLive, {
      dosage: { routes: [] },
      duration: { routes: [draftRoute] },
    });

    expect(result.duration.routes).toEqual([draftRoute]);
    expect(result.skipped).toEqual([]);
  });

  it("still fills tiers on an existing route without touching live values", () => {
    const live = {
      dosage: {
        routes: [
          dosageRoute("oral", {
            dose_ranges: { ...emptyDoseRanges(), light: { min: 5, max: 9, unit: "mg" } },
          }),
        ],
        plateau_dosing: null,
      },
      duration: { routes: [] },
    };
    const result = mergeDosageDuration(live, {
      dosage: {
        routes: [
          dosageRoute("Oral", {
            dose_ranges: {
              ...emptyDoseRanges(),
              light: { min: 999, max: 999, unit: "mg" },
              moderate: { min: 10, max: 20, unit: "mg" },
            },
          }),
        ],
      },
      duration: { routes: [] },
    });

    expect(result.dosage.routes[0].dose_ranges.light).toEqual({ min: 5, max: 9, unit: "mg" });
    expect(result.dosage.routes[0].dose_ranges.moderate).toEqual({ min: 10, max: 20, unit: "mg" });
    expect(result.skipped).toEqual([]);
  });
});
