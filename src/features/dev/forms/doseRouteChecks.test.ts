import { describe, expect, it } from "vitest";
import { doseJumpChecks, doseRangeChecks } from "./doseRouteChecks";

const range = (min: number | null, max: number | null, unit: string) => ({ min, max, unit });

describe("doseRangeChecks", () => {
  it("warns when a tier starts below the one before it", () => {
    expect(doseRangeChecks({ light: range(50, 100, "mg"), moderate: range(20, 40, "mg") })).toEqual([
      { tone: "warning", message: "Moderate starts below Light. Tiers read from the smallest dose to the largest." },
    ]);
  });

  it("flags a tenfold slip against the live value", () => {
    expect(doseJumpChecks({ moderate: range(5, 15, "mg") }, { moderate: range(50, 150, "mg") })[0].message).toBe(
      "Moderate changed from 150 to 15 mg, more than double or less than half. Check for a slipped digit.",
    );
    expect(doseJumpChecks({ moderate: range(60, 160, "mg") }, { moderate: range(50, 150, "mg") })).toEqual([]);
  });
});
