/**
 * Section-specific source utilities.
 *
 * IMPORTANT: Quote files are now loaded exclusively from Convex.
 * This file only exports types and helper functions - no Vite glob imports.
 *
 * The static loaders are kept as no-op stubs for backwards compatibility
 * during the transition period. All actual quote loading should use the
 * useQuote() hook from src/hooks/useQuotes.ts.
 */

// Type for extracted source info with favicon metadata
export interface ExtractedSourceInfo {
  /** Raw markdown content */
  content: string;
  /** Number of sources found */
  count: number;
  /** Parsed source details */
  sources: Array<{
    name: string;
    favicon: string | null;
  }>;
}

/**
 * Parse extracted quotes content to get list of source names.
 * Looks for "## Source: {Name}" headers.
 */
export function parseSourcesFromQuotes(content: string): string[] {
  const regex = /^## Source:\s*(.+)$/gm;
  const sources: string[] = [];
  let match;
  while ((match = regex.exec(content)) !== null) {
    sources.push(match[1].trim());
  }
  return sources;
}

// Type for section source availability
export interface SectionSourceAvailability {
  harm_potential: boolean;
  dosage_duration: boolean;
  subjective_effects: boolean;
  pharmacology: boolean;
  interactions: boolean;
  tolerance: boolean;
  history_culture: boolean;
  legality: boolean;
  identification: boolean;
}

// =============================================================================
// DEPRECATED: Static loaders - Use useQuote() hook instead
// These are kept as no-op stubs for backwards compatibility.
// =============================================================================

/** @deprecated Use useQuote(slug, "summary") instead */
export function hasSummaryQuotes(_slug: string): boolean {
  return false;
}

/** @deprecated Use useQuote(slug, "summary") instead */
export async function loadSummaryQuotes(_slug: string): Promise<string | null> {
  return null;
}

/** @deprecated No longer used */
export function getSummarySlugs(): string[] {
  return [];
}

/** @deprecated Use useQuote(slug, "harm_potential") instead */
export function hasHarmPotentialQuotes(_slug: string): boolean {
  return false;
}

/** @deprecated Use useQuote(slug, "harm_potential") instead */
export async function loadHarmPotentialQuotes(_slug: string): Promise<string | null> {
  return null;
}

/** @deprecated No longer used */
export function getHarmPotentialSlugs(): string[] {
  return [];
}

/** @deprecated Use useQuote(slug, "pharmacology") instead */
export function hasPharmacologyQuotes(_slug: string): boolean {
  return false;
}

/** @deprecated Use useQuote(slug, "pharmacology") instead */
export async function loadPharmacologyQuotes(_slug: string): Promise<string | null> {
  return null;
}

/** @deprecated No longer used */
export function getPharmacologySlugs(): string[] {
  return [];
}

/** @deprecated Use useQuote(slug, "history_culture") instead */
export function hasHistoryCultureQuotes(_slug: string): boolean {
  return false;
}

/** @deprecated Use useQuote(slug, "history_culture") instead */
export async function loadHistoryCultureQuotes(_slug: string): Promise<string | null> {
  return null;
}

/** @deprecated No longer used */
export function getHistoryCultureSlugs(): string[] {
  return [];
}

/** @deprecated Use useQuote(slug, "dosage_duration") instead */
export function hasDosageDurationQuotes(_slug: string): boolean {
  return false;
}

/** @deprecated Use useQuote(slug, "dosage_duration") instead */
export async function loadDosageDurationQuotes(_slug: string): Promise<string | null> {
  return null;
}

/** @deprecated No longer used */
export function getDosageDurationSlugs(): string[] {
  return [];
}

/** @deprecated Use useQuote(slug, "tolerance") instead */
export function hasToleranceQuotes(_slug: string): boolean {
  return false;
}

/** @deprecated Use useQuote(slug, "tolerance") instead */
export async function loadToleranceQuotes(_slug: string): Promise<string | null> {
  return null;
}

/** @deprecated No longer used */
export function getToleranceSlugs(): string[] {
  return [];
}

/** @deprecated Use useQuote(slug, "legality") instead */
export function hasLegalityQuotes(_slug: string): boolean {
  return false;
}

/** @deprecated Use useQuote(slug, "legality") instead */
export async function loadLegalityQuotes(_slug: string): Promise<string | null> {
  return null;
}

/** @deprecated No longer used */
export function getLegalitySlugs(): string[] {
  return [];
}

/**
 * Check which sections have extracted source data for a given slug.
 * @deprecated Use useQuote() hooks instead
 */
export function getSectionSourceAvailability(_slug: string): SectionSourceAvailability {
  return {
    harm_potential: false,
    dosage_duration: false,
    subjective_effects: false,
    pharmacology: false,
    interactions: false,
    tolerance: false,
    history_culture: false,
    legality: false,
    identification: false,
  };
}

// Re-export section prompts for convenience (metadata only - prompts come from Convex)
export { sectionMetadata, type SectionKey } from '../data/config/sectionPrompts';
