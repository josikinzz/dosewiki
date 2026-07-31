import { describe, expect, it } from "vitest";

import { formatDose } from "@/features/article/components/sections/dosageDurationShared";
import type { DoseRange } from "@/schema";
import { doseRangeTransformer, durationStageTransformer, parseRangeString } from "./transformers";

/**
 * Every shape a dose tier can hold, with the two strings the app renders for
 * it: the editor's form string and the article's own display string. Both have
 * to survive a trip back into the stored object, because both end up seeding an
 * input — the form field from `toForm`, an inline edit from the rendered page.
 */
const CASES: Array<{ name: string; stored: DoseRange | null; isThreshold?: boolean }> = [
  { name: "a threshold dose", stored: { min: 10, max: null, unit: "mg" }, isThreshold: true },
  { name: "a min-only dose", stored: { min: 60, max: null, unit: "mg" } },
  { name: "a max-only dose", stored: { min: null, max: 20, unit: "mg" } },
  { name: "a full range", stored: { min: 10, max: 20, unit: "mg" } },
  { name: "a single-value dose (min === max)", stored: { min: 15, max: 15, unit: "mg" } },
  { name: "an empty dose", stored: null },
];

describe("doseRangeTransformer round trip", () => {
  it.each(CASES)("survives the form string for $name", ({ stored }) => {
    const form = doseRangeTransformer.toForm(stored);
    expect(doseRangeTransformer.toSchema(form)).toEqual(stored);
  });

  it.each(CASES.filter(({ stored }) => stored?.min != null || stored == null))(
    "survives the rendered string for $name",
    ({ stored, isThreshold }) => {
      const rendered = formatDose(stored, isThreshold ?? false);
      if (rendered === "N/A") {
        // The article renders nothing for an empty tier, so there is no string
        // to parse back — the field simply has no value yet.
        expect(stored).toBeNull();
        return;
      }
      expect(doseRangeTransformer.toSchema(rendered)).toEqual(stored);
    },
  );

  it("does not round trip a max-only dose through the rendered string", () => {
    // `formatDose` drops the `<` for a max-only tier, so `{min: null, max: 20}`
    // renders as a bare `20 mg` and reads back as `{min: 20, max: 20}`. The
    // renderer is public copy and is left alone; the consequence is that an
    // inline dose editor must seed itself from `doseRangeTransformer.toForm`,
    // which is lossless for every shape, and never from the rendered string.
    expect(formatDose({ min: null, max: 20, unit: "mg" })).toBe("20 mg");
    expect(doseRangeTransformer.toSchema("20 mg")).toEqual({
      min: 20,
      max: 20,
      unit: "mg",
    });
    expect(doseRangeTransformer.toForm({ min: null, max: 20, unit: "mg" })).toBe("<20 mg");
  });
});

describe("parseRangeString", () => {
  it("reads the tilde form the article renders for a threshold", () => {
    expect(parseRangeString("~10 mg")).toEqual({ min: 10, max: null, unit: "mg" });
    expect(parseRangeString("~ 2.5 mg")).toEqual({ min: 2.5, max: null, unit: "mg" });
    // The `+` form the editor emits still means the same thing.
    expect(parseRangeString("10+ mg")).toEqual({ min: 10, max: null, unit: "mg" });
    expect(parseRangeString("~10+ mg")).toEqual({ min: 10, max: null, unit: "mg" });
  });

  it("returns null for text that is not a range at all", () => {
    expect(parseRangeString("")).toBeNull();
    expect(parseRangeString("unknown")).toBeNull();
    expect(parseRangeString("a lot")).toBeNull();
  });
});

describe("durationStageTransformer round trip", () => {
  it.each([
    { min: 20, max: 40, unit: "minutes" },
    { min: 4, max: null, unit: "hours" },
    { min: null, max: 30, unit: "minutes" },
    { min: 6, max: 6, unit: "hours" },
  ])("survives %o", (stage) => {
    expect(durationStageTransformer.toSchema(durationStageTransformer.toForm(stage))).toEqual(
      stage,
    );
  });
});
