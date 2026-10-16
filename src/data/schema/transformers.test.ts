import { describe, expect, it } from "vitest";

import { formatDose } from "@/features/article/components/sections/dosageDurationShared";
import type { DoseRange } from "@/schema";
import { doseRangeTransformer, durationStageTransformer, parseRangeString } from "./transformers";

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
        expect(stored).toBeNull();
        return;
      }
      expect(doseRangeTransformer.toSchema(rendered)).toEqual(stored);
    },
  );

  it("does not round trip a max-only dose through the rendered string", () => {
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

describe("range parsers refuse citation markers", () => {
  it.each([
    "10-20 mg[cite:x]",
    "10-20 mg [cite:smith-2020]",
    "10+ mg[citation-needed]",
    "<20 mg[cite:x]",
    "20 mg [cite:",
  ])("rejects %s", (raw) => {
    expect(parseRangeString(raw)).toBeNull();
    expect(doseRangeTransformer.toSchema(raw)).toBeNull();
    expect(durationStageTransformer.toSchema(raw.replace("mg", "minutes"))).toBeNull();
  });

  it("still reads the same text without the marker", () => {
    expect(parseRangeString("10-20 mg")).toEqual({ min: 10, max: 20, unit: "mg" });
    expect(durationStageTransformer.toSchema("30-60 minutes")).toEqual({
      min: 30,
      max: 60,
      unit: "minutes",
    });
  });
});
