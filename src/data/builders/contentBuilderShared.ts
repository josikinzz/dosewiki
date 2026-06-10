import { slugify } from "../../utils/slug";

type NonEmptyString = string & { __brand: "NonEmptyString" };

function isNonEmpty(value: unknown): value is NonEmptyString {
  return typeof value === "string" && value.trim().length > 0;
}

export function normalizeKey(value: string): string {
  return slugify(value);
}

export function titleize(value: string): string {
  return value
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

export function cleanString(value: string | null | undefined): string | undefined {
  if (!isNonEmpty(value)) {
    return undefined;
  }

  return value.trim();
}

export function cleanStringArray(values: unknown): string[] {
  if (!Array.isArray(values)) {
    return [];
  }

  return values
    .map((entry) => (isNonEmpty(entry) ? entry.trim() : undefined))
    .filter((entry): entry is string => Boolean(entry));
}

export function slugifyDrugName(name: string, fallback: string): string {
  return slugify(name) || slugify(fallback) || "article";
}
