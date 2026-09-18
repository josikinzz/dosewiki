import { describe, expect, it } from "vitest";

import {
  createEmptyDosageRoute,
  createEmptyDoseRange,
  createEmptyDurationRoute,
  createEmptyDurationStage,
} from "./defaultFactories";

describe("schema default factories", () => {
  it("creates canonical dosage and duration route row defaults", () => {
    expect(createEmptyDoseRange()).toEqual({ min: null, max: null, unit: "" });
    expect(createEmptyDurationStage()).toEqual({ min: null, max: null, unit: "" });
    expect(createEmptyDosageRoute()).toEqual({
      route: "",
      bioavailability: "",
      bioavailability_notes: "",
      dose_ranges: {
        threshold: createEmptyDoseRange(),
        light: createEmptyDoseRange(),
        moderate: createEmptyDoseRange(),
        strong: createEmptyDoseRange(),
        heavy: createEmptyDoseRange(),
      },
      notes: "",
      reference_ids: [],
    });
    expect(createEmptyDurationRoute()).toEqual({
      route: "",
      half_life: "",
      half_life_notes: "",
      stages: {
        onset: createEmptyDurationStage(),
        come_up: createEmptyDurationStage(),
        peak: createEmptyDurationStage(),
        offset: createEmptyDurationStage(),
        after_effects: createEmptyDurationStage(),
        total_duration: createEmptyDurationStage(),
      },
      reference_ids: [],
    });
  });

  it("returns fresh nested objects for each default route", () => {
    const first = createEmptyDosageRoute();
    const second = createEmptyDosageRoute();

    first.dose_ranges.light.min = 1;

    expect(second.dose_ranges.light.min).toBeNull();
    expect(first.dose_ranges.light).not.toBe(second.dose_ranges.light);
  });
});
