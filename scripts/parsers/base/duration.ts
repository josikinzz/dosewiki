import type { DurationRange } from "../types";

const DURATION_UNIT_ALIASES: Record<string, string> = {
  sec: "seconds",
  secs: "seconds",
  second: "seconds",
  min: "minutes",
  mins: "minutes",
  minute: "minutes",
  hr: "hours",
  hrs: "hours",
  hour: "hours",
  h: "hours",
  days: "days",
  day: "days",
  d: "days",
};

function normalizeDurationUnit(unit: string): string {
  const normalized = unit.trim().toLowerCase();
  return DURATION_UNIT_ALIASES[normalized] || DURATION_UNIT_ALIASES[unit] || unit;
}

export function parseDurationRange(text: string): DurationRange | undefined {
  if (!text || text.trim() === "" || text.trim() === "-") return undefined;

  const cleaned = text.trim();
  const hhmmRangeMatch = cleaned.match(/^(\d{1,2}):(\d{2})\s*[-–—]+\s*(\d{1,2}):(\d{2})$/);
  if (hhmmRangeMatch) {
    const minTotalMins = parseInt(hhmmRangeMatch[1], 10) * 60 + parseInt(hhmmRangeMatch[2], 10);
    const maxTotalMins = parseInt(hhmmRangeMatch[3], 10) * 60 + parseInt(hhmmRangeMatch[4], 10);

    if (minTotalMins >= 60 && maxTotalMins >= 60 && minTotalMins % 60 === 0 && maxTotalMins % 60 === 0) {
      return { min: minTotalMins / 60, max: maxTotalMins / 60, unit: "hours" };
    }
    return { min: minTotalMins, max: maxTotalMins, unit: "minutes" };
  }

  const underMatch = cleaned.match(/^under\s+([\d.]+)\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?|h|days?|d)?$/i);
  if (underMatch) {
    return { max: parseFloat(underMatch[1]), unit: normalizeDurationUnit(underMatch[2] || "minutes") };
  }

  const rangeMatch = cleaned.match(/^([\d.]+)\s*[-–—to]+\s*([\d.]+)\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?|h|days?|d)?$/i);
  if (rangeMatch) {
    return {
      min: parseFloat(rangeMatch[1]),
      max: parseFloat(rangeMatch[2]),
      unit: normalizeDurationUnit(rangeMatch[3] || "hours"),
    };
  }

  const minOnlyMatch = cleaned.match(/^([>]?\s*[\d.]+)\s*\+?\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?|h|days?|d)?$/i);
  if (minOnlyMatch && (cleaned.includes("+") || cleaned.includes(">"))) {
    return {
      min: parseFloat(minOnlyMatch[1].replace(/[>\s]/g, "")),
      unit: normalizeDurationUnit(minOnlyMatch[2] || "hours"),
    };
  }

  const maxOnlyMatch = cleaned.match(/^<\s*([\d.]+)\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?|h|days?|d)?$/i);
  if (maxOnlyMatch) {
    return {
      max: parseFloat(maxOnlyMatch[1]),
      unit: normalizeDurationUnit(maxOnlyMatch[2] || "hours"),
    };
  }

  const singleMatch = cleaned.match(/^([\d.]+)\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?|h|days?|d)?$/i);
  if (singleMatch) {
    const value = parseFloat(singleMatch[1]);
    return { min: value, max: value, unit: normalizeDurationUnit(singleMatch[2] || "hours") };
  }

  return undefined;
}
