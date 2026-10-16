import { describe, expect, it } from "vitest";

import type { DoseRange, DurationStage } from "@/schema";
import { formatDose, formatDuration } from "./dosageDurationShared";
import type { Translate } from "@/i18n/messages";
import { normalizeDurationStageForDisplay } from "./durationUnits";

const t: Translate = (text) => text;

const stage = (min: number | null, max: number | null, unit: string): DurationStage => ({
  min,
  max,
  unit,
});

describe("normalizeDurationStageForDisplay: the reported table", () => {
  it("prints the reviewer's own hand correction", () => {
    expect(formatDuration(t, stage(120, 420, "minutes"))).toBe("2-7 hours");
    expect(formatDuration(t, stage(180, 360, "minutes"))).toBe("3-6 hours");
  });

  it("leaves the hour rows of that table alone", () => {
    expect(formatDuration(t, stage(6, 12, "hours"))).toBe("6-12 hours");
    expect(formatDuration(t, stage(3, 8, "hours"))).toBe("3-8 hours");
    expect(formatDuration(t, stage(12, 36, "hours"))).toBe("12-36 hours");
    expect(formatDuration(t, stage(24, 96, "hours"))).toBe("24-96 hours");
  });
});

describe("normalizeDurationStageForDisplay: live routes printing hours as minutes", () => {
  it.each([
    { name: "amt oral onset", stored: stage(60, 180, "minutes"), shown: "1-3 hours" },
    { name: "cocaine oral peak", stored: stage(60, 180, "minutes"), shown: "1-3 hours" },
    { name: "cocaine oral total", stored: stage(120, 240, "minutes"), shown: "2-4 hours" },
    {
      name: "desoxypipradrol insufflated come-up",
      stored: stage(120, 360, "minutes"),
      shown: "2-6 hours",
    },
    { name: "mescaline oral onset", stored: stage(60, 180, "minutes"), shown: "1-3 hours" },
    { name: "methadone oral come-up", stored: stage(120, 240, "minutes"), shown: "2-4 hours" },
  ])("promotes $name", ({ stored, shown }) => {
    expect(formatDuration(t, stored)).toBe(shown);
  });

  it.each([
    { name: "allylescaline oral onset", stored: stage(45, 240, "minutes"), shown: "45-240 minutes" },
    { name: "ibogaine oral onset", stored: stage(45, 180, "minutes"), shown: "45-180 minutes" },
    { name: "lsa oral onset", stored: stage(30, 180, "minutes"), shown: "30-180 minutes" },
    { name: "mdpv oral peak", stored: stage(30, 180, "minutes"), shown: "30-180 minutes" },
  ])("leaves boundary-spanning $name in minutes", ({ stored, shown }) => {
    expect(formatDuration(t, stored)).toBe(shown);
  });
});

describe("normalizeDurationStageForDisplay: promotion thresholds", () => {
  it("promotes once the upper bound reaches three hours", () => {
    expect(formatDuration(t, stage(100, 180, "minutes"))).toBe("1.75-3 hours");
  });

  it("promotes once the lower bound passes ninety minutes", () => {
    expect(formatDuration(t, stage(90, 120, "minutes"))).toBe("1.5-2 hours");
    expect(formatDuration(t, stage(90, 90, "minutes"))).toBe("1.5 hours");
  });

  it.each([
    stage(15, 90, "minutes"),
    stage(45, 120, "minutes"),
    stage(60, 120, "minutes"),
    stage(30, 60, "minutes"),
  ])("leaves an honest sub-hour range in minutes: %o", (stored) => {
    expect(formatDuration(t, stored)).toBe(
      `${stored.min}-${stored.max} ${stored.unit}`,
    );
  });

  it("keeps a range with no good single unit exactly as stored", () => {
    expect(formatDuration(t, stage(5, 180, "minutes"))).toBe("5-180 minutes");
  });

  it("climbs the seconds rung on the same rule", () => {
    expect(formatDuration(t, stage(30, 180, "seconds"))).toBe("30-180 seconds");
    expect(formatDuration(t, stage(60, 180, "seconds"))).toBe("1-3 minutes");
    expect(formatDuration(t, stage(15, 120, "seconds"))).toBe("15-120 seconds");
    expect(formatDuration(t, stage(30, 60, "seconds"))).toBe("30-60 seconds");
  });

  it("never promotes hours to days", () => {
    expect(formatDuration(t, stage(72, 72, "hours"))).toBe("72 hours");
    expect(formatDuration(t, stage(24, 72, "hours"))).toBe("24-72 hours");
  });

  it("keeps days an author chose", () => {
    expect(formatDuration(t, stage(3, 6, "days"))).toBe("3-6 days");
    expect(formatDuration(t, stage(1, 7, "days"))).toBe("1-7 days");
  });
});

describe("normalizeDurationStageForDisplay: fractional conversion residue", () => {
  it("rounds away false precision without changing the unit", () => {
    expect(formatDuration(t, stage(1.9, 4, "hours"))).toBe("2-4 hours");
    expect(formatDuration(t, stage(4.5, 8.4, "hours"))).toBe("4.5-8.5 hours");
  });

  it("demotes an unclean range that does not belong in hours", () => {
    expect(formatDuration(t, stage(1, 1.25, "hours"))).toBe("60-75 minutes");
    expect(formatDuration(t, stage(0.5, 0.75, "hours"))).toBe("30-45 minutes");
    expect(formatDuration(t, stage(0.8, 1.7, "hours"))).toBe("48-102 minutes");
    expect(formatDuration(t, stage(0.25, 0.5, "hours"))).toBe("15-30 minutes");
    expect(formatDuration(t, stage(0.75, 1.5, "hours"))).toBe("45-90 minutes");
  });

  it("treats half-hours as idiomatic and half-minutes as residue", () => {
    expect(formatDuration(t, stage(1, 1.5, "hours"))).toBe("1-1.5 hours");
    expect(formatDuration(t, stage(0.5, 1, "hours"))).toBe("0.5-1 hours");
    expect(formatDuration(t, stage(2.5, 5, "hours"))).toBe("2.5-5 hours");
    expect(formatDuration(t, stage(0.5, 1, "minutes"))).toBe("30-60 seconds");
    expect(formatDuration(t, stage(0.25, 2, "minutes"))).toBe("15-120 seconds");
  });

  it("prints the stored value rather than collapse a real span", () => {
    expect(formatDuration(t, stage(100, 110, "minutes"))).toBe("100-110 minutes");
  });

  it("keeps a zero bound out of a rounded range", () => {
    expect(formatDuration(t, stage(0, 0.1, "minutes"))).toBe("0-6 seconds");
  });

  it("prints a nonsense bound rather than dropping it", () => {
    expect(formatDuration(t, stage(-30, 240, "minutes"))).toBe("-30-240 minutes");
    expect(formatDuration(t, stage(Number.NaN, 240, "minutes"))).toBe("NaN-240 minutes");
  });
});

describe("normalizeDurationStageForDisplay: range shapes", () => {
  it("carries the shape of a min-only stage through the conversion", () => {
    expect(formatDuration(t, stage(120, null, "minutes"))).toBe("2+ hours");
    expect(formatDuration(t, stage(4, null, "hours"))).toBe("4+ hours");
  });

  it("carries the shape of a max-only stage through the conversion", () => {
    expect(formatDuration(t, stage(null, 180, "minutes"))).toBe("3 hours");
    expect(formatDuration(t, stage(null, 30, "minutes"))).toBe("30 minutes");
  });

  it("collapses a single-value stage exactly as before", () => {
    expect(formatDuration(t, stage(6, 6, "hours"))).toBe("6 hours");
    expect(formatDuration(t, stage(180, 180, "minutes"))).toBe("3 hours");
  });
});

describe("dose rendering is untouched", () => {
  const dose = (min: number | null, max: number | null, unit: string): DoseRange => ({
    min,
    max,
    unit,
  });

  it("never converts a dose unit, whatever its magnitude", () => {
    expect(formatDose(dose(120, 420, "mg"))).toBe("120-420 mg");
    expect(formatDose(dose(1.9, 4, "mg"))).toBe("1.9-4 mg");
    expect(formatDose(dose(500, 1500, "ug"))).toBe("500-1500 ug");
    expect(formatDose(dose(0.25, 0.5, "g"))).toBe("0.25-0.5 g");
    expect(formatDose(dose(10, null, "mg"), true)).toBe("~10 mg");
    expect(formatDose(dose(60, null, "mg"))).toBe("60+ mg");
    expect(formatDose(dose(null, 20, "mg"))).toBe("20 mg");
    expect(formatDose(dose(null, null, "mg"))).toBe("N/A");
  });

  it("does not convert a dose even when its unit reads as time", () => {
    expect(formatDose(dose(120, 420, "m"))).toBe("120-420 m");
  });

  it("normalizes nothing in place", () => {
    const stored = stage(120, 420, "minutes");
    formatDuration(t, stored);
    expect(stored).toEqual({ min: 120, max: 420, unit: "minutes" });
    expect(normalizeDurationStageForDisplay(t, stored)).toEqual({
      min: 2,
      max: 7,
      unit: "hours",
    });
    expect(stored).toEqual({ min: 120, max: 420, unit: "minutes" });
  });
});
