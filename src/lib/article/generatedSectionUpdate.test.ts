import { describe, expect, it } from "vitest";

import { createEmptyArticle } from "@/data/schema/defaults.generated";
import { createEmptyDosageRoute, createEmptyDurationRoute } from "@/data/schema/defaultFactories";
import { buildGeneratedSectionUpdate } from "./generatedSectionUpdate";

function article() {
  return createEmptyArticle();
}

describe("buildGeneratedSectionUpdate", () => {
  it("parses wrapped and unwrapped generated YAML with empty defaults", () => {
    const wrapped = buildGeneratedSectionUpdate(
      article(),
      "tolerance",
      {
        kind: "generated_yaml",
        content: `
tolerance:
  full_tolerance: 7 days
  half_tolerance: 3 days
`,
      },
      "editor_apply",
    );

    expect(wrapped.patch.tolerance).toEqual({
      full_tolerance: "7 days",
      half_tolerance: "3 days",
      baseline_tolerance: "",
      cross_tolerance: [],
    });

    const unwrapped = buildGeneratedSectionUpdate(
      article(),
      "interactions",
      {
        kind: "generated_yaml",
        content: `
dangerous:
  - Alcohol
`,
      },
      "batch_apply",
    );

    expect(unwrapped.patch.interactions).toEqual({
      dangerous: ["Alcohol"],
      unsafe: [],
      caution: [],
    });
  });

  it("normalizes legacy harm-potential ld50 and reports skipped editorial review", () => {
    const result = buildGeneratedSectionUpdate(
      article(),
      "harm_potential",
      {
        kind: "generated_yaml",
        content: `
harm_potential:
  editorial_review:
    status: completed
  toxicity:
    ld50:
      - species: rat
        route: oral
        value: 100
        unit: mg/kg
`,
      },
      "editor_apply",
    );

    expect(result.patch).not.toHaveProperty("editorial_review");
    expect(result.skippedFields).toEqual(["editorial_review"]);
    expect(result.patch.harm_potential?.toxicity?.lethal_dosage?.ld50).toEqual([
      { species: "rat", route: "oral", value: 100, unit: "mg/kg" },
    ]);
  });

  it("preserves legality countries when a generated update omits them", () => {
    const current = article();
    current.legality.countries = {
      US: { status: "Schedule I", notes: "Existing note" },
    };

    const result = buildGeneratedSectionUpdate(
      current,
      "legality",
      {
        kind: "generated_yaml",
        content: `
international:
  - UN 1971 Convention
`,
      },
      "prepopulate_apply",
    );

    expect(result.patch.legality?.international).toEqual(["UN 1971 Convention"]);
    expect(result.patch.legality?.countries).toEqual(current.legality.countries);
  });

  it("updates pharmacology route maps without dropping dose ranges or duration stages", () => {
    const current = article();
    current.dosage.routes = [{
      route: "Oral",
      bioavailability: "",
      bioavailability_notes: "",
      dose_ranges: {
        threshold: { min: 1, max: 2, unit: "mg" },
        light: { min: null, max: null, unit: "" },
        moderate: { min: null, max: null, unit: "" },
        strong: { min: null, max: null, unit: "" },
        heavy: { min: null, max: null, unit: "" },
      },
      notes: "keep",
    }];
    current.duration.routes = [{
      route: "Oral",
      half_life: "",
      half_life_notes: "",
      stages: {
        onset: { min: 10, max: 20, unit: "minutes" },
        come_up: { min: null, max: null, unit: "" },
        peak: { min: null, max: null, unit: "" },
        offset: { min: null, max: null, unit: "" },
        after_effects: { min: null, max: null, unit: "" },
        total_duration: { min: null, max: null, unit: "" },
      },
    }];

    const result = buildGeneratedSectionUpdate(
      current,
      "pharmacology",
      {
        kind: "generated_yaml",
        content: `
route_bioavailability:
  oral: 70%
  intranasal: 50%
route_half_life:
  oral: 4 hours
`,
      },
      "editor_apply",
    );

    expect(result.nextArticle.dosage.routes[0]?.dose_ranges.threshold).toEqual({ min: 1, max: 2, unit: "mg" });
    expect(result.nextArticle.duration.routes[0]?.stages.onset).toEqual({ min: 10, max: 20, unit: "minutes" });
    expect(result.nextArticle.dosage.routes.find((route) => route.route === "Oral")?.bioavailability).toBe("70%");
    expect(result.nextArticle.dosage.routes.find((route) => route.route === "Insufflated")).toEqual({
      ...createEmptyDosageRoute("Insufflated"),
      bioavailability: "50%",
    });
    expect(result.nextArticle.duration.routes.find((route) => route.route === "Oral")?.half_life).toBe("4 hours");
    expect(result.nextArticle.duration.routes.find((route) => route.route === "Insufflated")).toEqual(
      createEmptyDurationRoute("Insufflated"),
    );
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === "route_added")).toBe(true);
  });

  it("returns validation failures for invalid section data", () => {
    expect(() => buildGeneratedSectionUpdate(
      article(),
      "tolerance",
      { kind: "generated_yaml", content: "tolerance: []" },
      "editor_apply",
    )).toThrow();
  });
});
