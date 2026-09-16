import { describe, expect, it } from "vitest";

import {
  applyRouteEquivalenceFillPlan,
  buildRouteEquivalenceFillPlan,
  normalizeArticleForRouteEquivalenceSave,
} from "./route-equivalence-fill.mjs";

function range(min, max, unit = "mg") {
  return { min, max, unit };
}

function emptyRange(unit = "mg") {
  return range(null, null, unit);
}

function doseRoute(route, overrides = {}) {
  return {
    route,
    bioavailability: "",
    bioavailability_notes: "",
    dose_ranges: {
      threshold: range(1, 2),
      light: range(2, 4),
      moderate: range(4, 8),
      strong: range(8, 12),
      heavy: range(12, null),
    },
    notes: "",
    ...overrides,
  };
}

function shellDoseRoute(route, overrides = {}) {
  return doseRoute(route, {
    dose_ranges: {
      threshold: emptyRange(),
      light: emptyRange(),
      moderate: emptyRange(),
      strong: emptyRange(),
      heavy: emptyRange(),
    },
    ...overrides,
  });
}

function durationRoute(route, overrides = {}) {
  return {
    route,
    half_life: "",
    half_life_notes: "",
    stages: {
      onset: range(5, 15, "minutes"),
      come_up: range(15, 30, "minutes"),
      peak: range(1, 2, "hours"),
      offset: range(2, 3, "hours"),
      after_effects: range(1, 2, "hours"),
      total_duration: range(4, 6, "hours"),
    },
    ...overrides,
  };
}

function shellDurationRoute(route, overrides = {}) {
  return durationRoute(route, {
    stages: {
      onset: emptyRange("minutes"),
      come_up: emptyRange("minutes"),
      peak: emptyRange("hours"),
      offset: emptyRange("hours"),
      after_effects: emptyRange("hours"),
      total_duration: emptyRange("hours"),
    },
    ...overrides,
  });
}

function article(overrides = {}) {
  return {
    id: 1,
    title: "Fixtureamine",
    slug: "fixtureamine",
    dosage: { routes: [] },
    duration: { routes: [] },
    ...overrides,
  };
}

function routeByName(routes, routeName) {
  return routes.find((route) => route.route === routeName);
}

describe("route equivalence fill planner", () => {
  it("does not create both dosage and duration for a brand-new target route", () => {
    const plan = buildRouteEquivalenceFillPlan(
      [
        article({
          dosage: { routes: [doseRoute("Insufflated")] },
          duration: { routes: [durationRoute("Insufflated")] },
        }),
      ],
      { direction: "insufflated-to-rectal" },
    );

    expect(plan.candidates).toHaveLength(0);
    expect(plan.summary.skippedByReason["target-route-not-established"]).toBe(2);
  });

  it("fills missing rectal duration when rectal dosage already exists", () => {
    const sourceDuration = durationRoute("Insufflated", { reference_ids: ["source-ref"] });
    const plan = buildRouteEquivalenceFillPlan(
      [
        article({
          dosage: { routes: [doseRoute("Insufflated"), doseRoute("Rectal")] },
          duration: { routes: [sourceDuration] },
        }),
      ],
      { direction: "insufflated-to-rectal", sections: ["duration"] },
    );

    expect(plan.candidates).toMatchObject([
      {
        section: "duration",
        sourceRoute: "Insufflated",
        targetRoute: "Rectal",
        action: "add-route",
        copiedFields: ["stages"],
        copiedReferenceIds: false,
      },
    ]);

    const [updated] = applyRouteEquivalenceFillPlan(
      [
        article({
          dosage: { routes: [doseRoute("Insufflated"), doseRoute("Rectal")] },
          duration: { routes: [sourceDuration] },
        }),
      ],
      plan,
    );
    const rectalDuration = routeByName(updated.duration.routes, "Rectal");

    expect(rectalDuration.stages).toEqual(sourceDuration.stages);
    expect(rectalDuration.reference_ids).toBeUndefined();
  });

  it("fills missing rectal dosage when rectal duration already exists", () => {
    const sourceDosage = doseRoute("Insufflated", { reference_ids: ["source-ref"] });
    const plan = buildRouteEquivalenceFillPlan(
      [
        article({
          dosage: { routes: [sourceDosage] },
          duration: { routes: [durationRoute("Insufflated"), durationRoute("Rectal")] },
        }),
      ],
      { direction: "insufflated-to-rectal", sections: ["dosage"] },
    );

    expect(plan.candidates).toHaveLength(1);
    expect(plan.candidates[0]).toMatchObject({
      section: "dosage",
      action: "add-route",
      requiresExistingPath: "duration.routes[route=Rectal]",
    });

    const [updated] = applyRouteEquivalenceFillPlan(
      [
        article({
          dosage: { routes: [sourceDosage] },
          duration: { routes: [durationRoute("Insufflated"), durationRoute("Rectal")] },
        }),
      ],
      plan,
    );
    const rectalDosage = routeByName(updated.dosage.routes, "Rectal");

    expect(rectalDosage.dose_ranges).toEqual(sourceDosage.dose_ranges);
    expect(rectalDosage.bioavailability).toBe("");
    expect(rectalDosage.reference_ids).toBeUndefined();
  });

  it("replaces shell-only target routes while preserving target metadata and references", () => {
    const targetShell = shellDurationRoute("Rectal", {
      half_life: "target half-life note",
      reference_ids: ["target-ref"],
    });
    const sourceDuration = durationRoute("Insufflated", { reference_ids: ["source-ref"] });
    const plan = buildRouteEquivalenceFillPlan(
      [
        article({
          dosage: { routes: [doseRoute("Insufflated"), doseRoute("Rectal")] },
          duration: { routes: [sourceDuration, targetShell] },
        }),
      ],
      { direction: "insufflated-to-rectal", sections: ["duration"] },
    );

    expect(plan.candidates[0].action).toBe("replace-shell-route");

    const [updated] = applyRouteEquivalenceFillPlan(
      [
        article({
          dosage: { routes: [doseRoute("Insufflated"), doseRoute("Rectal")] },
          duration: { routes: [sourceDuration, targetShell] },
        }),
      ],
      plan,
    );
    const rectalDuration = routeByName(updated.duration.routes, "Rectal");

    expect(rectalDuration.stages).toEqual(sourceDuration.stages);
    expect(rectalDuration.half_life).toBe("target half-life note");
    expect(rectalDuration.reference_ids).toEqual(["target-ref"]);
  });

  it("does not overwrite target routes that already have structured values", () => {
    const plan = buildRouteEquivalenceFillPlan(
      [
        article({
          dosage: { routes: [doseRoute("Insufflated"), doseRoute("Rectal")] },
          duration: { routes: [durationRoute("Insufflated"), durationRoute("Rectal")] },
        }),
      ],
      { direction: "insufflated-to-rectal" },
    );

    expect(plan.candidates).toHaveLength(0);
    expect(plan.skipped).toHaveLength(0);
  });

  it("does not create insufflated dosage and duration together from rectal-only data", () => {
    const plan = buildRouteEquivalenceFillPlan(
      [
        article({
          dosage: { routes: [doseRoute("Rectal")] },
          duration: { routes: [durationRoute("Rectal")] },
        }),
      ],
      { direction: "rectal-to-insufflated" },
    );

    expect(plan.candidates).toHaveLength(0);
    expect(plan.summary.skippedByReason["target-route-not-established"]).toBe(2);
  });

  it("can explicitly merge copied source reference IDs when requested", () => {
    const plan = buildRouteEquivalenceFillPlan(
      [
        article({
          dosage: {
            routes: [
              doseRoute("Insufflated", { reference_ids: ["source-ref"] }),
              shellDoseRoute("Rectal", { reference_ids: ["target-ref"] }),
            ],
          },
          duration: { routes: [durationRoute("Rectal")] },
        }),
      ],
      {
        direction: "insufflated-to-rectal",
        sections: ["dosage"],
        copyReferenceIds: true,
      },
    );

    const [updated] = applyRouteEquivalenceFillPlan(
      [
        article({
          dosage: {
            routes: [
              doseRoute("Insufflated", { reference_ids: ["source-ref"] }),
              shellDoseRoute("Rectal", { reference_ids: ["target-ref"] }),
            ],
          },
          duration: { routes: [durationRoute("Rectal")] },
        }),
      ],
      plan,
    );

    expect(routeByName(updated.dosage.routes, "Rectal").reference_ids).toEqual([
      "target-ref",
      "source-ref",
    ]);
  });

  it("normalizes only legacy save-blocking article shapes before saveSubstances", () => {
    const normalized = normalizeArticleForRouteEquivalenceSave({
      ...article(),
      references: [
        { id: "good", title: "Good", template: "cite_web" },
        { id: "bad", title: "Bad", template: "citation needed" },
      ],
      subjective_effects: {
        notes: { overview: "overview", sensory: "", cognitive: "", physical: "" },
        sensory: {
          visual: ["Color enhancement"],
          auditory: [],
          tactile: [],
          olfactory: [],
          gustatory: [],
          multisensory: [],
        },
        cognitive: ["Euphoria"],
        physical: [{ name: "Stimulation", description: "Body stimulation." }],
      },
    });

    expect(normalized.references).toEqual([
      { id: "good", title: "Good", template: "cite_web" },
      { id: "bad", title: "Bad", template: "unknown" },
    ]);
    expect(normalized.subjective_effects.cognitive).toEqual({
      General: {
        note: "",
        effects: [{ name: "Euphoria", description: "" }],
      },
    });
    expect(normalized.subjective_effects.physical).toEqual({
      General: {
        note: "",
        effects: [{ name: "Stimulation", description: "Body stimulation." }],
      },
    });
    expect(normalized.subjective_effects.sensory.visual).toEqual({
      note: "",
      subcategories: {
        General: {
          note: "",
          effects: [{ name: "Color enhancement", description: "" }],
        },
      },
    });
  });
});
