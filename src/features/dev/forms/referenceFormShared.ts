import type { Reference } from "@/schema";

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

export function createEmptyReference(): Reference {
  return {
    id: "",
    type: "unknown",
    title: "",
    authors: [],
    year: null,
    date: null,
    containerTitle: null,
    siteName: null,
    publisher: null,
    volume: null,
    issue: null,
    pages: null,
    articleNumber: null,
    doi: null,
    pmid: null,
    isbn: null,
    url: null,
    accessedAt: null,
    sourceType: "unknown",
    quality: "fallback",
    apaText: null,
  };
}

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
