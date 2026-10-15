export type RangeValue = { min?: number | null; max?: number | null; unit?: string } | null | undefined;

export const DOSE_TIERS = [
  ["threshold", "Threshold"],
  ["light", "Light"],
  ["moderate", "Moderate"],
  ["strong", "Strong"],
  ["heavy", "Heavy"],
] as const;
export type DoseTier = (typeof DOSE_TIERS)[number][0];

export const DURATION_STAGES = [
  ["onset", "Onset"],
  ["come_up", "Come-up"],
  ["peak", "Peak"],
  ["offset", "Offset"],
  ["after_effects", "After effects"],
  ["total_duration", "Total duration"],
] as const;
export type DurationStageKey = (typeof DURATION_STAGES)[number][0];

export type RouteCheck = { tone: "danger" | "warning"; message: string };

function populated(range: RangeValue): range is { min?: number | null; max?: number | null; unit?: string } {
  return !!range && (typeof range.min === "number" || typeof range.max === "number");
}

export function unitKey(unit: string | undefined): string {
  return (unit ?? "").trim().replace(/μ/g, "µ").toLowerCase();
}

const SAME_UNIT_SPELLINGS: Array<readonly string[]> = [["µg", "ug", "mcg"]];

export function listWords(words: readonly string[]): string {
  if (words.length <= 1) return words.join("");
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

export function doseUnits(ranges: Partial<Record<DoseTier, RangeValue>> | null | undefined) {
  const groups: Array<{ unit: string; key: string; tiers: string[] }> = [];
  for (const [tier, label] of DOSE_TIERS) {
    const range = ranges?.[tier];
    if (!populated(range)) continue;
    const key = unitKey(range.unit);
    const group = groups.find((entry) => entry.key === key);
    if (group) group.tiers.push(label);
    else groups.push({ unit: (range.unit ?? "").trim() || "no unit", key, tiers: [label] });
  }
  return groups;
}

const lower = (range: { min?: number | null; max?: number | null }) => (typeof range.min === "number" ? range.min : range.max ?? 0);

export function doseRangeChecks(ranges: Partial<Record<DoseTier, RangeValue>> | null | undefined): RouteCheck[] {
  const checks: RouteCheck[] = [];
  const units = doseUnits(ranges);
  if (units.length > 1) {
    const spelled = units.map((group) => `${listWords(group.tiers)} ${group.tiers.length === 1 ? "uses" : "use"} ${group.unit}`);
    const sameAmount = SAME_UNIT_SPELLINGS.some((spellings) => units.every((group) => spellings.includes(group.key)));
    checks.push({
      tone: "danger",
      message: `${listWords(spelled)}. Every tier of a route must use one unit${sameAmount ? " spelled the same way" : ""}; nothing is converted.`,
    });
  }
  let previous: { tier: DoseTier; label: string; range: { min?: number | null; max?: number | null; unit?: string } } | null = null;
  for (const [tier, label] of DOSE_TIERS) {
    const range = ranges?.[tier];
    if (!populated(range)) continue;
    if (previous && units.length <= 1) {
      if (lower(range) < lower(previous.range)) {
        checks.push({ tone: "warning", message: `${label} starts below ${previous.label}. Tiers read from the smallest dose to the largest.` });
      } else if (previous.tier !== "threshold" && typeof previous.range.max === "number" && typeof range.min === "number" && previous.range.max > range.min) {
        const unit = (range.unit ?? "").trim();
        checks.push({ tone: "warning", message: `${previous.label} reaches ${previous.range.max} ${unit}, past where ${label} starts (${range.min} ${unit}). Check the two tiers.` });
      }
    }
    previous = { tier, label, range };
  }
  return checks;
}

export function doseJumpChecks(
  ranges: Partial<Record<DoseTier, RangeValue>> | null | undefined,
  live: Partial<Record<DoseTier, RangeValue>> | null | undefined,
): RouteCheck[] {
  const checks: RouteCheck[] = [];
  for (const [tier, label] of DOSE_TIERS) {
    const next = ranges?.[tier];
    const before = live?.[tier];
    if (!populated(next) || !populated(before) || unitKey(next.unit) !== unitKey(before.unit)) continue;
    const top = (range: { min?: number | null; max?: number | null }) => (typeof range.max === "number" ? range.max : range.min ?? 0);
    const now = top(before);
    const then = top(next);
    if (now > 0 && (then > now * 2 || then < now / 2)) {
      checks.push({ tone: "warning", message: `${label} changed from ${now} to ${then} ${(next.unit ?? "").trim()}, more than double or less than half. Check for a slipped digit.` });
    }
  }
  return checks;
}

const MINUTES_PER: Record<string, number> = {
  s: 1 / 60, sec: 1 / 60, secs: 1 / 60, second: 1 / 60, seconds: 1 / 60,
  min: 1, mins: 1, minute: 1, minutes: 1,
  h: 60, hr: 60, hrs: 60, hour: 60, hours: 60,
  d: 1440, day: 1440, days: 1440,
  week: 10080, weeks: 10080,
};

function longestMinutes(range: RangeValue): number | null {
  if (!populated(range)) return null;
  const factor = MINUTES_PER[unitKey(range.unit)];
  if (factor === undefined) return null;
  const top = typeof range.max === "number" ? range.max : range.min;
  return typeof top === "number" ? top * factor : null;
}

export function durationStageChecks(stages: Partial<Record<DurationStageKey, RangeValue>> | null | undefined): RouteCheck[] {
  const checks: RouteCheck[] = [];
  for (const [stage, label] of DURATION_STAGES) {
    const range = stages?.[stage];
    if (populated(range) && MINUTES_PER[unitKey(range.unit)] === undefined) {
      checks.push({ tone: "danger", message: `${label} needs a time unit (minutes, hours or days), not “${(range.unit ?? "").trim() || "nothing"}”.` });
    }
  }
  const total = longestMinutes(stages?.total_duration);
  if (total !== null) {
    for (const [stage, label] of DURATION_STAGES) {
      if (stage === "total_duration" || stage === "after_effects") continue;
      const longest = longestMinutes(stages?.[stage]);
      if (longest !== null && longest > total) {
        checks.push({ tone: "warning", message: `${label} can last longer than the total duration. Check both.` });
      }
    }
  }
  return checks;
}

type RouteLike = { route?: string | null; dose_ranges?: Partial<Record<DoseTier, RangeValue>> | null; stages?: Partial<Record<DurationStageKey, RangeValue>> | null };
type ArticleLike = { dosage?: { routes?: readonly RouteLike[] | null } | null; duration?: { routes?: readonly RouteLike[] | null } | null };

const routeKeyOf = (route: RouteLike) => (route.route ?? "").trim().toLowerCase();

export function articleDoseWarnings(article: ArticleLike, live: ArticleLike | null): string[] {
  const warnings: string[] = [];
  const liveDosage = live?.dosage?.routes ?? [];
  const liveDuration = live?.duration?.routes ?? [];
  for (const route of article.dosage?.routes ?? []) {
    const before = liveDosage.find((entry) => routeKeyOf(entry) === routeKeyOf(route));
    if (before && JSON.stringify(before.dose_ranges) === JSON.stringify(route.dose_ranges)) continue;
    const name = (route.route ?? "").trim() || "A route";
    for (const check of [...doseRangeChecks(route.dose_ranges), ...doseJumpChecks(route.dose_ranges, before?.dose_ranges)]) {
      warnings.push(`${name}: ${check.message}`);
    }
  }
  for (const route of article.duration?.routes ?? []) {
    const before = liveDuration.find((entry) => routeKeyOf(entry) === routeKeyOf(route));
    if (before && JSON.stringify(before.stages) === JSON.stringify(route.stages)) continue;
    const name = (route.route ?? "").trim() || "A route";
    for (const check of durationStageChecks(route.stages)) warnings.push(`${name}: ${check.message}`);
  }
  return warnings;
}
