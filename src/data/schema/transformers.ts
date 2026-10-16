import type { Transformer } from "./types";
import type { DoseRange, DurationStage, Citation, CountryLegality } from "../../schema";

const CITATION_MARKER_START = /\[(?:cite:|citation-needed)/i;

export function parseRangeString(str: string): { min: number | null; max: number | null; unit: string } | null {
  const trimmed = str.trim();
  if (!trimmed) return null;
  if (CITATION_MARKER_START.test(trimmed)) return null;

  const rangeMatch = trimmed.match(/^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*(.*)$/);
  if (rangeMatch) {
    return {
      min: parseFloat(rangeMatch[1]),
      max: parseFloat(rangeMatch[2]),
      unit: rangeMatch[3].trim(),
    };
  }

  const minOnlyMatch = trimmed.match(/^~?\s*(\d+(?:\.\d+)?)\+\s*(.*)$/)
    ?? trimmed.match(/^~\s*(\d+(?:\.\d+)?)\s*(.*)$/);
  if (minOnlyMatch) {
    return {
      min: parseFloat(minOnlyMatch[1]),
      max: null,
      unit: minOnlyMatch[2].trim(),
    };
  }

  const maxOnlyMatch = trimmed.match(/^<\s*(\d+(?:\.\d+)?)\s*(.*)$/);
  if (maxOnlyMatch) {
    return {
      min: null,
      max: parseFloat(maxOnlyMatch[1]),
      unit: maxOnlyMatch[2].trim(),
    };
  }

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

export const identityTransformer: Transformer<string, string> = {
  toForm: (value: string): string => value || "",
  toSchema: (str: string): string => str || "",
};

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
