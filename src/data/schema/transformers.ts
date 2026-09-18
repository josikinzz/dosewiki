import type { Transformer } from "./types";
import type { DoseRange, DurationStage, Citation, CountryLegality } from "../../schema";

/**
 * Value transformers for converting between schema objects and form strings.
 * These enable human-friendly editing of structured data.
 */

/**
 * Parse a range string like "10-20 mg", "10+ mg", "~10 mg", or "<20 mg"
 * Returns { min, max, unit } or null if unparseable
 */
export function parseRangeString(str: string): { min: number | null; max: number | null; unit: string } | null {
  const trimmed = str.trim();
  if (!trimmed) return null;

  // Pattern: "10-20 mg" or "10 - 20 mg"
  const rangeMatch = trimmed.match(/^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*(.*)$/);
  if (rangeMatch) {
    return {
      min: parseFloat(rangeMatch[1]),
      max: parseFloat(rangeMatch[2]),
      unit: rangeMatch[3].trim(),
    };
  }

  // Pattern: "10+ mg" (min only, no max), and the "~10 mg" the article itself
  // renders for a threshold dose. Both mean the same stored shape, and only
  // accepting the `+` form is what broke the round trip: a threshold seeded
  // from the page came back unparseable and was thrown away.
  const minOnlyMatch = trimmed.match(/^~?\s*(\d+(?:\.\d+)?)\+\s*(.*)$/)
    ?? trimmed.match(/^~\s*(\d+(?:\.\d+)?)\s*(.*)$/);
  if (minOnlyMatch) {
    return {
      min: parseFloat(minOnlyMatch[1]),
      max: null,
      unit: minOnlyMatch[2].trim(),
    };
  }

  // Pattern: "<20 mg" (max only, no min)
  const maxOnlyMatch = trimmed.match(/^<\s*(\d+(?:\.\d+)?)\s*(.*)$/);
  if (maxOnlyMatch) {
    return {
      min: null,
      max: parseFloat(maxOnlyMatch[1]),
      unit: maxOnlyMatch[2].trim(),
    };
  }

  // Pattern: "20 mg" (single value, treat as both min and max)
  const singleMatch = trimmed.match(/^(\d+(?:\.\d+)?)\s*(.*)$/);
  if (singleMatch) {
    const value = parseFloat(singleMatch[1]);
    return {
      min: value,
      max: value,
      unit: singleMatch[2].trim(),
    };
  }

  return null;
}

/**
 * Format a range object to a human-readable string
 */
function formatRangeToString(min: number | null, max: number | null, unit: string): string {
  const unitStr = unit || "";

  if (min != null && max != null) {
    if (min === max) {
      return `${min} ${unitStr}`.trim();
    }
    return `${min}-${max} ${unitStr}`.trim();
  }

  if (min != null) {
    return `${min}+ ${unitStr}`.trim();
  }

  if (max != null) {
    return `<${max} ${unitStr}`.trim();
  }

  return "";
}

/**
 * Dose range transformer: { min: 10, max: 20, unit: "mg" } <-> "10-20 mg"
 */
export const doseRangeTransformer: Transformer<DoseRange | null, string> = {
  toForm: (value: DoseRange | null): string => {
    if (!value) return "";
    return formatRangeToString(value.min, value.max, value.unit);
  },
  toSchema: (str: string): DoseRange | null => {
    const parsed = parseRangeString(str);
    if (!parsed) return null;
    return {
      min: parsed.min,
      max: parsed.max,
      unit: parsed.unit,
    };
  },
};

/**
 * Duration stage transformer: { min: 15, max: 30, unit: "minutes" } <-> "15-30 minutes"
 */
export const durationStageTransformer: Transformer<DurationStage | null, string> = {
  toForm: (value: DurationStage | null): string => {
    if (!value) return "";
    return formatRangeToString(value.min, value.max, value.unit);
  },
  toSchema: (str: string): DurationStage | null => {
    const parsed = parseRangeString(str);
    if (!parsed) return null;
    return {
      min: parsed.min,
      max: parsed.max,
      unit: parsed.unit,
    };
  },
};

/**
 * Array transformer: string[] <-> comma-separated string
 * ["a", "b", "c"] <-> "a, b, c"
 */
export const arrayTransformer: Transformer<string[], string> = {
  toForm: (arr: string[]): string => {
    if (!Array.isArray(arr)) return "";
    return arr.filter(Boolean).join(", ");
  },
  toSchema: (str: string): string[] => {
    if (!str || typeof str !== "string") return [];
    return str
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  },
};

/**
 * Semicolon array transformer: string[] <-> semicolon-separated string
 * Used for fields where commas might appear in values
 * ["a", "b", "c"] <-> "a; b; c"
 */
export const semicolonArrayTransformer: Transformer<string[], string> = {
  toForm: (arr: string[]): string => {
    if (!Array.isArray(arr)) return "";
    return arr.filter(Boolean).join("; ");
  },
  toSchema: (str: string): string[] => {
    if (!str || typeof str !== "string") return [];
    return str
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean);
  },
};

/**
 * Citation transformer: { name, url }[] <-> multiline "name | url" format
 */
export const citationTransformer: Transformer<Citation[], string> = {
  toForm: (citations: Citation[]): string => {
    if (!Array.isArray(citations)) return "";
    return citations
      .filter((c) => c && (c.name || c.url))
      .map((c) => `${c.name || ""} | ${c.url || ""}`)
      .join("\n");
  },
  toSchema: (str: string): Citation[] => {
    if (!str || typeof str !== "string") return [];
    return str
      .split("\n")
      .map((line) => {
        const [name, url] = line.split("|").map((s) => s.trim());
        return { name: name || "", url: url || "" };
      })
      .filter((c) => c.name || c.url);
  },
};

/**
 * Number transformer: number | null <-> string
 */
export const numberTransformer: Transformer<number | null, string> = {
  toForm: (value: number | null): string => {
    if (value == null) return "";
    return String(value);
  },
  toSchema: (str: string): number | null => {
    if (!str || typeof str !== "string") return null;
    const trimmed = str.trim();
    if (!trimmed) return null;
    const parsed = parseFloat(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  },
};

/**
 * Identity transformer: pass through unchanged (for already-string fields)
 */
export const identityTransformer: Transformer<string, string> = {
  toForm: (value: string): string => value || "",
  toSchema: (str: string): string => str || "",
};

/**
 * Record transformer: Record<string, string> <-> multiline "key: value" format
 * Used for receptor binding, reagent testing, etc.
 */
export const recordTransformer: Transformer<Record<string, string>, string> = {
  toForm: (record: Record<string, string>): string => {
    if (!record || typeof record !== "object") return "";
    return Object.entries(record)
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n");
  },
  toSchema: (str: string): Record<string, string> => {
    if (!str || typeof str !== "string") return {};
    const result: Record<string, string> = {};
    str.split("\n").forEach((line) => {
      const colonIndex = line.indexOf(":");
      if (colonIndex > 0) {
        const key = line.slice(0, colonIndex).trim();
        const value = line.slice(colonIndex + 1).trim();
        if (key) {
          result[key] = value;
        }
      }
    });
    return result;
  },
};

/**
 * Country legality transformer: { countries: Record<string, { status, notes }> } <-> multiline format
 */
export const countryLegalityTransformer: Transformer<Record<string, CountryLegality>, string> = {
  toForm: (countries: Record<string, CountryLegality>): string => {
    if (!countries || typeof countries !== "object") return "";
    return Object.entries(countries)
      .filter(([, v]) => v && (v.status || v.notes))
      .map(([country, info]) => {
        const parts = [country, info.status];
        if (info.notes) parts.push(info.notes);
        return parts.join(" | ");
      })
      .join("\n");
  },
  toSchema: (str: string): Record<string, CountryLegality> => {
    if (!str || typeof str !== "string") return {};
    const result: Record<string, CountryLegality> = {};
    str.split("\n").forEach((line) => {
      const parts = line.split("|").map((s) => s.trim());
      if (parts.length >= 2 && parts[0]) {
        result[parts[0]] = {
          status: parts[1] || "",
          notes: parts[2] || "",
        };
      }
    });
    return result;
  },
};
