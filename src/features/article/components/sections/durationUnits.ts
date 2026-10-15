import type { DurationStage } from "@/schema";
import { msg, type Translate } from "@/i18n/messages";

export type TimeUnitKind = "seconds" | "minutes" | "hours" | "days";

const LADDER: readonly TimeUnitKind[] = ["seconds", "minutes", "hours", "days"];
const HIGHEST_PROMOTION_RUNG = LADDER.indexOf("hours");

const MINUTES_PER_UNIT: Record<TimeUnitKind, number> = {
  seconds: 1 / 60,
  minutes: 1,
  hours: 60,
  days: 1440,
};

const UNIT_ALIASES: Record<string, TimeUnitKind> = {
  s: "seconds",
  sec: "seconds",
  secs: "seconds",
  second: "seconds",
  seconds: "seconds",
  m: "minutes",
  min: "minutes",
  mins: "minutes",
  minute: "minutes",
  minutes: "minutes",
  h: "hours",
  hr: "hours",
  hrs: "hours",
  hour: "hours",
  hours: "hours",
  d: "days",
  day: "days",
  days: "days",
};

const ROUNDING_STEP: Record<TimeUnitKind, number> = {
  seconds: 1,
  minutes: 1,
  hours: 0.25,
  days: 0.25,
};

const SINGULAR_LABEL: Record<TimeUnitKind, string> = {
  seconds: msg("second"),
  minutes: msg("minute"),
  hours: msg("hour"),
  days: msg("day"),
};

const PLURAL_LABEL: Record<TimeUnitKind, string> = {
  seconds: msg("seconds"),
  minutes: msg("minutes"),
  hours: msg("hours"),
  days: msg("days"),
};

export function parseTimeUnit(unit: string): TimeUnitKind | null {
  const key = unit.trim().toLowerCase().replace(/\.$/, "");
  return UNIT_ALIASES[key] ?? null;
}

export function formatDurationText(t: Translate, text: string): string {
  const citationTail = /\s*(?:\[cite:[^\]]*\]\s*)+$/.exec(text);
  const body = citationTail ? text.slice(0, citationTail.index) : text;
  const match = /([0-9][0-9.,]*\+?)\s*([A-Za-z][A-Za-z.]*)\s*$/.exec(body);
  if (!match) return text;
  const kind = parseTimeUnit(match[2]);
  if (!kind) return text;
  const isPlural = /s$/i.test(match[2].replace(/\.$/, ""));
  const label = isPlural ? PLURAL_LABEL[kind] : SINGULAR_LABEL[kind];
  const localized = `${body.slice(0, match.index)}${match[1]} ${t(label)}`;
  return localized + (citationTail ? text.slice(citationTail.index) : "");
}

function isPresent(value: number | null): value is number {
  return value !== null && Number.isFinite(value) && value >= 0;
}

function boundsInMinutes(
  min: number | null,
  max: number | null,
  perUnit: number,
): { low: number; high: number } | null {
  const values = [min, max].filter(isPresent).map((value) => value * perUnit);
  if (values.length === 0) return null;
  return { low: Math.min(...values), high: Math.max(...values) };
}

function belongsAtRung(low: number, high: number, unitInMinutes: number): boolean {
  return high >= 3 * unitInMinutes || low >= 1.5 * unitInMinutes;
}

function roundTo(value: number, step: number): number {
  return Math.round(value / step + 1e-9) * step;
}

function clean(value: number): number {
  return Number(value.toFixed(4));
}

function isCleanIn(value: number, kind: TimeUnitKind): boolean {
  if (Number.isInteger(value)) return true;
  if (kind !== "hours" && kind !== "days") return false;
  return Math.abs((value % 1) - 0.5) < 1e-9;
}

function chooseRung(
  startRung: number,
  minutes: { low: number; high: number },
  hasUncleanBound: boolean,
): number {
  let rung = startRung;

  while (rung < HIGHEST_PROMOTION_RUNG) {
    const next = MINUTES_PER_UNIT[LADDER[rung + 1]];
    if (!belongsAtRung(minutes.low, minutes.high, next)) break;
    if (minutes.low < next) break;
    rung += 1;
  }
  if (rung !== startRung) return rung;

  if (!hasUncleanBound) return rung;

  while (rung > 0) {
    const current = MINUTES_PER_UNIT[LADDER[rung]];
    if (belongsAtRung(minutes.low, minutes.high, current)) break;
    rung -= 1;
  }
  return rung;
}

export type NormalizedDurationStage = {
  min: number | null;
  max: number | null;
  unit: string;
};

export function normalizeDurationStageForDisplay(
  t: Translate,
  stage: DurationStage,
): NormalizedDurationStage {
  const verbatim: NormalizedDurationStage = {
    min: stage.min,
    max: stage.max,
    unit: stage.unit,
  };

  const kind = parseTimeUnit(stage.unit);
  if (!kind) return verbatim;

  if ([stage.min, stage.max].some((value) => value !== null && !isPresent(value))) {
    return verbatim;
  }

  const perUnit = MINUTES_PER_UNIT[kind];
  const minutes = boundsInMinutes(stage.min, stage.max, perUnit);
  if (!minutes) return verbatim;

  const stored = [stage.min, stage.max].filter(isPresent);
  const hasUncleanBound = stored.some((value) => !isCleanIn(value, kind));
  const startRung = LADDER.indexOf(kind);
  const rung = chooseRung(startRung, minutes, hasUncleanBound);
  const target = LADDER[rung];
  const step = ROUNDING_STEP[target];

  const convert = (value: number | null): number | null =>
    isPresent(value)
      ? clean(roundTo((value * perUnit) / MINUTES_PER_UNIT[target], step))
      : null;

  const min = convert(stage.min);
  const max = convert(stage.max);

  if (min !== null && max !== null && stage.min !== stage.max && min === max) {
    return verbatim;
  }
  if ((min === 0 && (stage.min ?? 0) > 0) || (max === 0 && (stage.max ?? 0) > 0)) {
    return verbatim;
  }

  const shown = [min, max].filter(isPresent);
  const singular = shown.length > 0 && shown.every((value) => value === 1);

  if (rung === startRung && min === stage.min && max === stage.max) {
    const label = singular ? SINGULAR_LABEL[target] : PLURAL_LABEL[target];
    const printed = t(label);
    if (!singular && printed === label) return verbatim;
    return { ...verbatim, unit: printed };
  }

  return { min, max, unit: t(singular ? SINGULAR_LABEL[target] : PLURAL_LABEL[target]) };
}
