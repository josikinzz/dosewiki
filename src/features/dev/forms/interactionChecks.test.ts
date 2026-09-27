import { expect, it } from "vitest";
import { interactionName, interactionOverlaps } from "./interactionChecks";

it("reads the substance before the bracket", () => {
  expect(interactionName("Alcohol (both depress breathing)")).toBe("Alcohol");
  expect(interactionName("  Cannabis ")).toBe("Cannabis");
});

it("finds a substance listed in two tiers, case-insensitively", () => {
  expect(interactionOverlaps({
    dangerous: ["Alcohol (x)", "Opioids (y)"],
    caution: ["alcohol (z)", "Cannabis"],
    unsafe: [],
  })).toEqual([{ name: "alcohol", label: "Alcohol", tiers: ["dangerous", "caution"] }]);
  expect(interactionOverlaps(null)).toEqual([]);
});
