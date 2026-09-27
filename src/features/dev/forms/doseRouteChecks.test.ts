import { describe, expect, it } from "vitest";
import { articleDoseWarnings, doseJumpChecks, doseRangeChecks, doseUnits, durationStageChecks, listWords } from "./doseRouteChecks";

const range = (min: number | null, max: number | null, unit: string) => ({ min, max, unit });

describe("doseRangeChecks", () => {
  it("is quiet for one unit in rising order", () => {
    expect(doseRangeChecks({ threshold: range(10, null, "mg"), light: range(10, 20, "mg"), moderate: range(20, 40, "mg") })).toEqual([]);
  });

  it("names which tiers use which unit", () => {
    const [check] = doseRangeChecks({ light: range(10, 50, "ug"), moderate: range(60, 160, "µg"), strong: range(150, 300, "ug") });
    expect(check.tone).toBe("danger");
    expect(check.message).toBe("Light and Strong use ug and Moderate uses µg. Every tier of a route must use one unit spelled the same way; nothing is converted.");
  });

  it("treats the Greek mu as the micro sign, as the validation does", () => {
    expect(doseRangeChecks({ light: range(10, 50, "μg"), moderate: range(60, 160, "µg") })).toEqual([]);
  });

  it("warns when a tier starts below the one before it", () => {
    expect(doseRangeChecks({ light: range(50, 100, "mg"), moderate: range(20, 40, "mg") })).toEqual([
      { tone: "warning", message: "Moderate starts below Light. Tiers read from the smallest dose to the largest." },
    ]);
  });

  it("warns when a tier reaches past the next one's start, but not when they touch", () => {
    expect(doseRangeChecks({ light: range(10, 50, "ug"), moderate: range(60, 160, "ug"), strong: range(150, 300, "ug") })).toEqual([
      { tone: "warning", message: "Moderate reaches 160 ug, past where Strong starts (150 ug). Check the two tiers." },
    ]);
    expect(doseRangeChecks({ threshold: range(10, 15, "ug"), light: range(10, 50, "ug"), moderate: range(50, 150, "ug") })).toEqual([]);
  });

  it("flags a tenfold slip against the live value", () => {
    expect(doseJumpChecks({ moderate: range(5, 15, "mg") }, { moderate: range(50, 150, "mg") })[0].message).toBe(
      "Moderate changed from 150 to 15 mg, more than double or less than half. Check for a slipped digit.",
    );
    expect(doseJumpChecks({ moderate: range(60, 160, "mg") }, { moderate: range(50, 150, "mg") })).toEqual([]);
  });

  it("ignores empty tiers", () => {
    expect(doseUnits({ light: range(null, null, ""), moderate: range(1, 2, "g") })).toEqual([{ unit: "g", key: "g", tiers: ["Moderate"] }]);
  });
});

describe("durationStageChecks", () => {
  it("wants a time unit", () => {
    expect(durationStageChecks({ onset: range(10, 20, "mg") })[0].message).toMatch(/^Onset needs a time unit/);
  });

  it("warns when a stage outlasts the total", () => {
    expect(durationStageChecks({ peak: range(3, 5, "hours"), total_duration: range(2, 4, "hours") })).toEqual([
      { tone: "warning", message: "Peak can last longer than the total duration. Check both." },
    ]);
    expect(durationStageChecks({ onset: range(20, 40, "minutes"), total_duration: range(8, 12, "hours"), after_effects: range(12, 48, "hours") })).toEqual([]);
  });
});

it("joins words", () => {
  expect(listWords(["A"])).toBe("A");
  expect(listWords(["A", "B", "C"])).toBe("A, B and C");
});

it("collects warnings for changed routes only, by route name", () => {
  const live = { dosage: { routes: [{ route: "Oral", dose_ranges: { moderate: range(50, 150, "ug"), strong: range(150, 300, "ug") } }, { route: "Nasal", dose_ranges: { light: range(9, 1, "mg") } }] } };
  const next = { dosage: { routes: [{ route: "Oral", dose_ranges: { moderate: range(60, 160, "ug"), strong: range(150, 300, "ug") } }, live.dosage.routes[1]] } };
  expect(articleDoseWarnings(next, live)).toEqual(["Oral: Moderate reaches 160 ug, past where Strong starts (150 ug). Check the two tiers."]);
});
