import type { Reference } from "@/schema";

/**
 * Re-exported from the shared intake module, which is where the blank-reference
 * shape now lives so a server route can build the same object without importing
 * an editor-form module. Form code keeps importing it from here.
 */
export { createEmptyReference } from "@/lib/citations/referenceIntake";

export const REFERENCE_TYPE_OPTIONS = [
  "journal_article",
  "book",
  "book_chapter",
  "webpage",
  "database_entry",
  "report",
  "unknown",
] as const;

export const REFERENCE_SOURCE_TYPE_OPTIONS = [
  "primary_literature",
  "review_literature",
  "book",
  "government_or_regulatory",
  "medical_database",
  "drug_database",
  "community_wiki",
  "experience_archive",
  "harm_reduction_org",
  "news_media",
  "vendor_or_commercial",
  "unknown",
] as const;

export const REFERENCE_QUALITY_OPTIONS = [
  "high",
  "medium",
  "low",
  "fallback",
] as const;

export function normalizeOptionalReferenceText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function parseReferenceAuthors(value: string): string[] {
  return value
    .split(",")
    .map((author) => author.trim())
    .filter(Boolean);
}

export function formatReferenceAuthors(value: string[] | null | undefined): string {
  return Array.isArray(value) ? value.join(", ") : "";
}

export function parseReferenceYear(value: string): number | string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return /^\d{1,4}$/.test(trimmed) ? Number(trimmed) : trimmed;
}

export function formatReferenceYear(value: Reference["year"]): string {
  return value == null ? "" : String(value);
}
