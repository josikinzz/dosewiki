import { describe, expect, it } from "vitest";

import {
  hasDosageContent,
  hasDosageDurationContent,
  hasDurationContent,
  routeHasDosageContent,
  routeHasDurationContent,
  routeIsBlank,
} from "./dosageDurationPresence";

const NULL_RANGE = { min: null, max: null, unit: "mg" };
const NULL_STAGE = { min: null, max: null, unit: "hours" };

/** The shape generators scaffold when a source merely mentions a route. */
function hollowDosageRoute(route = "oral") {
  return {
    route,
    bioavailability: "",
    bioavailability_notes: "",
    notes: "",
    dose_ranges: {
      threshold: { ...NULL_RANGE },
      light: { ...NULL_RANGE },
      moderate: { ...NULL_RANGE },
      strong: { ...NULL_RANGE },
      heavy: { ...NULL_RANGE },
    },
  };
}

function hollowDurationRoute(route = "oral") {
  return {
    route,
    half_life: "",
    half_life_notes: "",
    stages: {
      onset: { ...NULL_STAGE },
      come_up: { ...NULL_STAGE },
      peak: { ...NULL_STAGE },
      offset: { ...NULL_STAGE },
      after_effects: { ...NULL_STAGE },
      total_duration: { ...NULL_STAGE },
    },
  };
}

describe("routeHasDosageContent", () => {
  it("rejects a fully scaffolded route", () => {
    expect(routeHasDosageContent(hollowDosageRoute())).toBe(false);
  });

  it("accepts a route with a single dose bound", () => {
    const route = hollowDosageRoute();
    route.dose_ranges.light = { min: 10, max: null, unit: "mg" };
    expect(routeHasDosageContent(route)).toBe(true);
  });

  it("accepts a max-only bound", () => {
    const route = hollowDosageRoute();
    route.dose_ranges.heavy = { min: null, max: 250, unit: "mg" };
    expect(routeHasDosageContent(route)).toBe(true);
  });

  it("accepts a prose-only route", () => {
    // Salvia's routes carry no dose ladder but explain why one cannot exist.
    const route = hollowDosageRoute("smoked");
    route.notes = "Dose per inhalation is unpredictable with unstandardized extracts.";
    expect(routeHasDosageContent(route)).toBe(true);
  });

  it("accepts bioavailability without dose numbers", () => {
    const route = hollowDosageRoute();
    route.bioavailability = "~50%";
    expect(routeHasDosageContent(route)).toBe(true);
  });

  it("treats whitespace-only prose as empty", () => {
    const route = hollowDosageRoute();
    route.notes = "   ";
    expect(routeHasDosageContent(route)).toBe(false);
  });

  it("tolerates malformed legacy documents", () => {
    expect(routeHasDosageContent(null)).toBe(false);
    expect(routeHasDosageContent(undefined)).toBe(false);
    expect(routeHasDosageContent({ route: "oral" })).toBe(false);
  });
});

describe("routeHasDurationContent", () => {
  it("rejects a fully scaffolded route", () => {
    expect(routeHasDurationContent(hollowDurationRoute())).toBe(false);
  });

  it("accepts a single populated stage", () => {
    const route = hollowDurationRoute();
    route.stages.onset = { min: 30, max: 90, unit: "minutes" };
    expect(routeHasDurationContent(route)).toBe(true);
  });

  it("accepts half-life prose without stage numbers", () => {
    const route = hollowDurationRoute();
    route.half_life = "6-8 hours";
    expect(routeHasDurationContent(route)).toBe(true);
  });
});

describe("routeIsBlank", () => {
  it("is true only when neither side renders anything", () => {
    expect(routeIsBlank({ ...hollowDosageRoute(), ...hollowDurationRoute() })).toBe(true);
  });

  it("protects an annotated route from cleanup tooling", () => {
    const route = { ...hollowDosageRoute(), ...hollowDurationRoute(), notes: "Unstandardized." };
    expect(routeIsBlank(route)).toBe(false);
  });
});

describe("section-level presence", () => {
  it("reports a scaffolded dosage section as empty", () => {
    expect(hasDosageContent({ routes: [hollowDosageRoute()], plateau_dosing: null })).toBe(false);
  });

  it("reports a section present when any one route has content", () => {
    const populated = hollowDosageRoute("insufflated");
    populated.dose_ranges.moderate = { min: 20, max: 40, unit: "mg" };
    expect(
      hasDosageContent({ routes: [hollowDosageRoute(), populated], plateau_dosing: null }),
    ).toBe(true);
  });

  it("keeps DXM plateau dosing alive without routes", () => {
    expect(
      hasDosageContent({
        routes: [],
        plateau_dosing: {
          first_plateau: { min: 100, max: 200, unit: "mg", effects: "Mild stimulation" },
          second_plateau: { min: null, max: null, unit: "mg", effects: "" },
          third_plateau: { min: null, max: null, unit: "mg", effects: "" },
          fourth_plateau: { min: null, max: null, unit: "mg", effects: "" },
          fifth_plateau: null,
          notes: null,
        },
      }),
    ).toBe(true);
  });

  it("reports an empty duration section", () => {
    expect(hasDurationContent({ routes: [hollowDurationRoute()] })).toBe(false);
    expect(hasDurationContent({ routes: [] })).toBe(false);
  });
});

describe("hasDosageDurationContent", () => {
  it("is false for the 3-cl-pcp shape: one hollow route on each side", () => {
    expect(
      hasDosageDurationContent({
        dosage: { routes: [hollowDosageRoute()], plateau_dosing: null },
        duration: { routes: [hollowDurationRoute()] },
      }),
    ).toBe(false);
  });

  it("is true when only duration carries data", () => {
    const duration = hollowDurationRoute();
    duration.stages.total_duration = { min: 5, max: 8, unit: "hours" };
    expect(
      hasDosageDurationContent({
        dosage: { routes: [hollowDosageRoute()], plateau_dosing: null },
        duration: { routes: [duration] },
      }),
    ).toBe(true);
  });

  it("is false for a missing or malformed section", () => {
    expect(hasDosageDurationContent(null)).toBe(false);
    expect(hasDosageDurationContent({})).toBe(false);
    expect(hasDosageDurationContent({ dosage: { routes: null } })).toBe(false);
  });
});
