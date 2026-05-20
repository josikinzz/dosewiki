import type { DoseRange } from "../types";

const DOSE_UNIT_ALIASES: Record<string, string> = {
  "μg": "µg",
  "ug": "µg",
  "mcg": "µg",
  "micrograms": "µg",
  "microgram": "µg",
  "milligrams": "mg",
  "milligram": "mg",
  "grams": "g",
  "gram": "g",
  "milliliters": "ml",
  "milliliter": "ml",
  "mL": "ml",
  "mg/kg": "mg/kg",
  "mg/d": "mg/day",
  "mg/day": "mg/day",
  "seed": "seeds",
  "seeds": "seeds",
  "tab": "tabs",
  "tabs": "tabs",
  "hit": "hits",
  "hits": "hits",
  "drop": "drops",
  "drops": "drops",
  "cap": "caps",
  "caps": "caps",
  "capsule": "caps",
  "capsules": "caps",
  "leaf": "leaves",
  "leaves": "leaves",
  "piece": "pieces",
  "pieces": "pieces",
  "unit": "units",
  "units": "units",
  "drink": "drinks",
  "drinks": "drinks",
};

const DOSE_UNIT_PATTERN =
  "(?:µg|ug|μg|mcg|mg/kg|mg/d|mg|grams?|g|ml|mL|units?|seeds?|tabs?|hits?|drops?|drinks?|caps(?:ules?)?|leaves?|pieces?)";

const ROUTE_ALIASES: Record<string, string> = {
  oral: "Oral",
  "by mouth": "Oral",
  swallowed: "Oral",
  sublingual: "Sublingual",
  "under tongue": "Sublingual",
  buccal: "Sublingual",
  insufflated: "Insufflated",
  snorted: "Insufflated",
  intranasal: "Insufflated",
  nasal: "Insufflated",
  inhaled: "Inhaled",
  smoked: "Smoked",
  vaporized: "Smoked",
  vaped: "Smoked",
  intravenous: "Intravenous",
  iv: "Intravenous",
  injected: "Intravenous",
  intramuscular: "Intramuscular",
  im: "Intramuscular",
  rectal: "Rectal",
  plugged: "Rectal",
  transdermal: "Transdermal",
  topical: "Transdermal",
  hbwr: "Oral",
  "hawaiian baby woodrose": "Oral",
  morning_glory: "Oral",
  "morning glory": "Oral",
};

export function normalizeDoseUnit(unit: string): string {
  const normalized = unit.trim().toLowerCase();
  return DOSE_UNIT_ALIASES[normalized] || DOSE_UNIT_ALIASES[unit] || unit;
}

export function parseDoseRange(text: string): DoseRange | undefined {
  if (!text || text.trim() === "" || text.trim() === "-") return undefined;

  let cleaned = text.trim();
  if (cleaned.startsWith("~")) {
    cleaned = cleaned.slice(1).trim();
  }

  cleaned = cleaned.replace(/[.,;:]+$/, "").trim();
  cleaned = cleaned.replace(/\s+(once|twice|per|in|daily|every|each|with|as|for|at|or)\s.*$/i, "").trim();
  cleaned = cleaned.replace(/\s+(THC|Psilocybin|Psilocin|CBD|DXM|HBr|freebase|pure|dried|fresh)(\s*\+)?$/i, "$2").trim();
  cleaned = cleaned.replace(/\s*\([^)]*(?:mg|g|µg|ug|μg|mcg)[^)]*\)\s*$/, "").trim();

  const rangeRegex = new RegExp(
    `^([<>]?\\s*[\\d.]+)\\s*[-–—to]+\\s*([\\d.]+)\\s*\\+?\\s*(${DOSE_UNIT_PATTERN})?\\s*\\+?$`,
    "i",
  );
  const rangeWithPlusMatch = cleaned.match(rangeRegex);
  if (rangeWithPlusMatch) {
    return {
      min: parseFloat(rangeWithPlusMatch[1].replace(/[<>\s]/g, "")),
      max: parseFloat(rangeWithPlusMatch[2]),
      unit: normalizeDoseUnit(rangeWithPlusMatch[3] || "mg"),
    };
  }

  const heavyRegex = new RegExp(`^([>]?\\s*[\\d.]+)\\s*\\+?\\s*(${DOSE_UNIT_PATTERN})?\\s*\\+?$`, "i");
  const heavyMatch = cleaned.match(heavyRegex);
  if (heavyMatch && (cleaned.includes("+") || cleaned.includes(">"))) {
    return {
      min: parseFloat(heavyMatch[1].replace(/[>\s]/g, "")),
      unit: normalizeDoseUnit(heavyMatch[2] || "mg"),
    };
  }

  const lessThanRegex = new RegExp(`^<\\s*([\\d.]+)\\s*(${DOSE_UNIT_PATTERN})?$`, "i");
  const lessThanMatch = cleaned.match(lessThanRegex);
  if (lessThanMatch) {
    return {
      max: parseFloat(lessThanMatch[1]),
      unit: normalizeDoseUnit(lessThanMatch[2] || "mg"),
    };
  }

  const singleRegex = new RegExp(`^([\\d.]+)\\s*(${DOSE_UNIT_PATTERN})?$`, "i");
  const singleMatch = cleaned.match(singleRegex);
  if (singleMatch) {
    const value = parseFloat(singleMatch[1]);
    return {
      min: value,
      max: value,
      unit: normalizeDoseUnit(singleMatch[2] || "mg"),
    };
  }

  return undefined;
}

export function parseDoseRangeWithUnit(value: string, fallbackUnit: string = "mg"): DoseRange | undefined {
  const result = parseDoseRange(value);
  if (result && !result.unit) {
    result.unit = normalizeDoseUnit(fallbackUnit);
  }
  return result;
}

export function normalizeRoute(route: string): string {
  const stripped = route.replace(/\s*\([^)]*\)\s*/g, "").trim();
  const lower = stripped.toLowerCase().trim();
  return ROUTE_ALIASES[lower] || stripped.charAt(0).toUpperCase() + stripped.slice(1).toLowerCase();
}
