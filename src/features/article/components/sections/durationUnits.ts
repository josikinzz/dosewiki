import type { DurationStage } from "@/schema";
import { msg, type Translate } from "@/i18n/messages";

/**
 * Display-only unit normalization for duration stages.
 *
 * Duration stages are stored as `{min, max, unit}` where `unit` is free text
 * (`src/schema/substance/shared.ts`), so a table can legitimately hold
 * `onset: 120-420 minutes` directly above `peak: 6-12 hours`. Postgres is
 * authoritative for content, so the fix lives here: the stored triple is never
 * touched, only the string the article prints. The inline editor seeds itself
 * from `durationStageTransformer.toForm(stage)` — the raw value — so nothing
 * below can move what a reviewer edits or what the write path validates.
 *
 * ## The rules
 *
 * Promotion (a range printed in too small a unit) happens when the range is
 * predominantly one rung up:
 *
 *   - the upper bound reaches 3 of the larger unit (180 min -> hours), OR
 *   - the lower bound already exceeds 1.5 of the larger unit (90 min -> hours).
 *
 * The lower bound must then be worth at least one whole unit of the larger
 * rung, otherwise the promotion prints a sub-hour bound as a fraction
 * (`45-240 minutes` -> `0.75-4 hours`), which reads worse than the minutes it
 * replaced. Such a range spans the boundary and has no good single unit, so it
 * is left alone.
 *
 * These thresholds are calibrated on real reviewer corrections: the reported
 * article's `120-420 minutes` and `180-360 minutes` become `2-7 hours` and
 * `3-6 hours`, which is exactly what the reviewer typed by hand. They also
 * leave the many honest sub-hour-to-just-over ranges (`15-90 minutes`,
 * `45-120 minutes`, `30-60 seconds`) in the unit an author would have picked.
 *
 * Promotion stops at hours. Harm-reduction duration tables conventionally run
 * to `24-96 hours` for a long total duration — that render was hand-checked by
 * a reviewer and must stay hours — so `days` is only ever a unit an author
 * chose, never one this helper introduces.
 *
 * Demotion (a range carrying fractional noise from a botched hand conversion,
 * e.g. `1-1.25 hours`, `0.5-0.75 hours`) happens when a bound is *unclean* AND
 * the range does not meet the promotion bar for the unit it is stored in — i.e.
 * it does not belong at this rung anyway. `2.5-5 hours` keeps its unit;
 * `0.8-1.7 hours` becomes `48-102 minutes`.
 *
 * "Unclean" is unit-aware, because half-hours are idiomatic and half-minutes
 * are not: an hour or day bound is clean at `.0` and `.5` (`1-1.5 hours` is
 * left exactly as written), while a minute or second bound must be whole
 * (`0.5-1 minutes` becomes `30-60 seconds`).
 *
 * Rounding kills false precision: hours and days snap to quarters (`1.9-4
 * hours` -> `2-4 hours`, `4.5-8.4 hours` -> `4.5-8.5 hours`), minutes and
 * seconds to whole units. If rounding would collapse a real span into a single
 * value, the stored triple is printed verbatim instead of pretending to a
 * precision it lost.
 *
 * A row whose printed value is exactly one gets a singular unit (`1 hour`, not
 * the `1 hours` a handful of live rows print today). Otherwise a row that needs
 * no conversion keeps the author's own spelling — `5-10 min` is not rewritten
 * to `5-10 minutes`.
 *
 * Anything whose unit is not a recognized TIME unit — every dose unit (`mg`,
 * `ug`, `g`), an empty unit, free text like `unknown` — is returned unchanged.
 * `formatDose` never calls this helper at all; the unit allowlist is the second
 * line of defence.
 */

export type TimeUnitKind = "seconds" | "minutes" | "hours" | "days";

/** Rungs in ascending size. Promotion never climbs past `hours` (see above). */
const LADDER: readonly TimeUnitKind[] = ["seconds", "minutes", "hours", "days"];
const HIGHEST_PROMOTION_RUNG = LADDER.indexOf("hours");

const MINUTES_PER_UNIT: Record<TimeUnitKind, number> = {
  seconds: 1 / 60,
  minutes: 1,
  hours: 60,
  days: 1440,
};

/**
 * Only these spellings are treated as time. Deliberately exhaustive rather than
 * fuzzy: a unit this table does not recognize is printed exactly as stored.
 */
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

/** Quarter-unit rounding above minutes; whole units at or below. */
const ROUNDING_STEP: Record<TimeUnitKind, number> = {
  seconds: 1,
  minutes: 1,
  hours: 0.25,
  days: 0.25,
};

/** Printed unit words. `msg` marks them for the UI catalog; `t` renders them. */
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

/** `"Minutes."` and `"hrs"` are the same unit; anything else is not time. */
export function parseTimeUnit(unit: string): TimeUnitKind | null {
  const key = unit.trim().toLowerCase().replace(/\.$/, "");
  return UNIT_ALIASES[key] ?? null;
}

/**
 * Localize the trailing unit word of a free-text duration ("1.2-2.5 hours",
 * "3-4 hr"), the shape `half_life` stores. Only a recognized time unit directly
 * after a number is replaced — prose that merely ends in a word keeps the
 * author's wording — and trailing `[cite:…]` markers are carried through
 * untouched so citation parsing still sees them.
 */
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

/** Upper bound of the range in minutes — what decides which unit it reads as. */
function boundsInMinutes(
  min: number | null,
  max: number | null,
  perUnit: number,
): { low: number; high: number } | null {
  const values = [min, max].filter(isPresent).map((value) => value * perUnit);
  if (values.length === 0) return null;
  return { low: Math.min(...values), high: Math.max(...values) };
}

/** True when the range reads as `unit` rather than as the rung below it. */
function belongsAtRung(low: number, high: number, unitInMinutes: number): boolean {
  return high >= 3 * unitInMinutes || low >= 1.5 * unitInMinutes;
}

function roundTo(value: number, step: number): number {
  // `1e-9` absorbs float drift so 1.125 lands on 1.25 rather than 1.0.
  return Math.round(value / step + 1e-9) * step;
}

/** Trims float noise (`2.0000000004`) without inventing precision. */
function clean(value: number): number {
  return Number(value.toFixed(4));
}

/**
 * A bound that reads as hand-written rather than as conversion residue. Halves
 * are idiomatic for the large units only — nobody writes `0.5 minutes`.
 */
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

  // Climb while the range plainly reads as the next unit up and both bounds
  // survive that unit without turning into a fraction of it.
  while (rung < HIGHEST_PROMOTION_RUNG) {
    const next = MINUTES_PER_UNIT[LADDER[rung + 1]];
    if (!belongsAtRung(minutes.low, minutes.high, next)) break;
    // The lower bound must survive as at least *one* of the larger unit. At half
    // a unit the promotion trades one readability problem for a worse one:
    // `30-180 minutes` becomes `0.5-3 hours`, and on an article like mdpv that
    // prints `Peak 0.5-3 hours` directly above `Offset 30-120 minutes` — the
    // same 30 minutes spelled two ways in one table. A sub-hour lower bound is
    // honest in minutes; only the upper bound was ever the complaint.
    if (minutes.low < next) break;
    rung += 1;
  }
  if (rung !== startRung) return rung;

  // Nothing to demote unless the stored numbers carry fractional noise.
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
  /** Ready to print: pluralized, or the stored spelling when nothing changed. */
  unit: string;
};

/**
 * Returns the stage as it should be *printed*. Never mutates its argument, and
 * returns the stored triple untouched whenever the unit is not a time unit,
 * the stage is empty, or normalization cannot improve on what is stored.
 */
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

  // A negative or non-finite bound is nonsense for a duration, and dropping it
  // silently would hide it. It prints exactly as stored.
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

  // A round that erases the span, or that zeroes a real bound, is a worse lie
  // than the ugly stored value.
  if (min !== null && max !== null && stage.min !== stage.max && min === max) {
    return verbatim;
  }
  if ((min === 0 && (stage.min ?? 0) > 0) || (max === 0 && (stage.max ?? 0) > 0)) {
    return verbatim;
  }

  const shown = [min, max].filter(isPresent);
  const singular = shown.length > 0 && shown.every((value) => value === 1);

  // Same rung and same numbers: keep the author's own spelling ("min", "hrs")
  // rather than rewriting a row that was never wrong. The one exception is a
  // row that reads `1 hours`, which no conversion can produce but six live
  // rows are stored as. On a translated mirror the stored spelling is English
  // either way, so the translated canonical word replaces it.
  if (rung === startRung && min === stage.min && max === stage.max) {
    const label = singular ? SINGULAR_LABEL[target] : PLURAL_LABEL[target];
    const printed = t(label);
    if (!singular && printed === label) return verbatim;
    return { ...verbatim, unit: printed };
  }

  return { min, max, unit: t(singular ? SINGULAR_LABEL[target] : PLURAL_LABEL[target]) };
}
