import { describe, expect, it } from "vitest";

import type { DoseRange, DurationStage } from "@/schema";
import { formatDose, formatDuration } from "./dosageDurationShared";
import type { Translate } from "@/i18n/messages";
import { normalizeDurationStageForDisplay, parseTimeUnit } from "./durationUnits";

const t: Translate = (text) => text;

const stage = (min: number | null, max: number | null, unit: string): DurationStage => ({
  min,
  max,
  unit,
});

describe("normalizeDurationStageForDisplay: the reported table", () => {
  it("prints the reviewer's own hand correction", () => {
    // The article that triggered the report: onset and come-up were stored in
    // minutes directly above hour-denominated peak/offset rows. The reviewer
    // rewrote them as `2-7 hours` and `3-6 hours` by hand.
    expect(formatDuration(t, stage(120, 420, "minutes"))).toBe("2-7 hours");
    expect(formatDuration(t, stage(180, 360, "minutes"))).toBe("3-6 hours");
  });

  it("leaves the hour rows of that table alone", () => {
    expect(formatDuration(t, stage(6, 12, "hours"))).toBe("6-12 hours");
    expect(formatDuration(t, stage(3, 8, "hours"))).toBe("3-8 hours");
    expect(formatDuration(t, stage(12, 36, "hours"))).toBe("12-36 hours");
    // A long total duration stays in hours: bromo-dragonfly was hand-checked in
    // this form, and promoting only this row to days re-creates the mixed-scale
    // table the fix exists to remove.
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

  // These four span the hour boundary: the upper bound reads as hours but the
  // lower bound is genuinely sub-hour. Promoting them printed `0.75-4 hours` /
  // `0.5-3 hours`, which reads worse than the minutes it replaced — and on mdpv
  // put `Peak 0.5-3 hours` directly above `Offset 30-120 minutes`, spelling the
  // same 30 minutes two ways in one table. They stay in minutes.
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
    // Five minutes is not half an hour by any rounding, so hours would print a
    // bound of `0.08`. Minutes is wrong for the top of the range and right for
    // the bottom; the stored form is the honest one.
    expect(formatDuration(t, stage(5, 180, "minutes"))).toBe("5-180 minutes");
  });

  it("climbs the seconds rung on the same rule", () => {
    // 30s is half a minute, so promoting would have to round it to a whole
    // minute and overstate the lower bound by 100%. Seconds is the honest form.
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
    // `1.9 hours` is 114 minutes — a botched hand conversion, not a measurement.
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
    // Quarter-hour rounding would make both bounds `1.75` and erase the range.
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

  it("renders an absent stage as N/A", () => {
    // How the server spells absence.
    expect(formatDuration(t, stage(null, null, ""))).toBe("N/A");
    expect(formatDuration(t, stage(null, null, "minutes"))).toBe("N/A");
    expect(formatDuration(t, null)).toBe("N/A");
  });

  it("says `hour` once, not `hours`", () => {
    // Six live rows (ibuprofen, melatonin, naproxen, phenylpiracetam, ...) are
    // stored as exactly one unit and printed `1 hours` today.
    expect(formatDuration(t, stage(1, 1, "hours"))).toBe("1 hour");
    expect(formatDuration(t, stage(1, 1, "minutes"))).toBe("1 minute");
    expect(formatDuration(t, stage(null, 1, "minutes"))).toBe("1 minute");
    expect(formatDuration(t, stage(1, 1, "mg"))).toBe("1 mg");
    expect(formatDuration(t, stage(60, 60, "minutes"))).toBe("60 minutes");
    expect(formatDuration(t, stage(90, null, "minutes"))).toBe("1.5+ hours");
    expect(formatDuration(t, stage(30, 30, "seconds"))).toBe("30 seconds");
    expect(formatDuration(t, stage(60, 90, "seconds"))).toBe("60-90 seconds");
  });
});

describe("normalizeDurationStageForDisplay: unrecognized units", () => {
  it("passes an unknown unit through untouched", () => {
    expect(formatDuration(t, stage(2, 4, "unknown"))).toBe("2-4 unknown");
    expect(formatDuration(t, stage(120, 420, ""))).toBe("120-420 ");
    expect(formatDuration(t, stage(1.9, 4, "cycles"))).toBe("1.9-4 cycles");
  });

  it("keeps the author's own spelling when nothing needed changing", () => {
    expect(formatDuration(t, stage(5, 10, "min"))).toBe("5-10 min");
    expect(formatDuration(t, stage(3, 5, "hrs"))).toBe("3-5 hrs");
  });

  it("reads the spellings it does convert", () => {
    expect(parseTimeUnit("Minutes.")).toBe("minutes");
    expect(parseTimeUnit(" HRS ")).toBe("hours");
    expect(parseTimeUnit("mg")).toBeNull();
    expect(parseTimeUnit("")).toBeNull();
    expect(formatDuration(t, stage(120, 420, "mins"))).toBe("2-7 hours");
    expect(formatDuration(t, stage(1, 1.25, "hr"))).toBe("60-75 minutes");
  });
});

describe("dose rendering is untouched", () => {
  const dose = (min: number | null, max: number | null, unit: string): DoseRange => ({
    min,
    max,
    unit,
  });

  it("never converts a dose unit, whatever its magnitude", () => {
    // A dose tier is the same `{min, max, unit}` leaf as a duration stage, and
    // these are the numbers that would move if the duration helper ever reached
    // `formatDose`: 120-420 is the reported onset, in milligrams.
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
    // `m` is a minutes alias. A dose tier can never reach the helper, because
    // `formatDose` does not call it — this asserts that wiring, not the alias.
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
