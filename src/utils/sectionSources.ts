/**
 * Section-specific source loading utilities.
 * 
 * Currently supports:
 * - Harm Potential: Extracted quotes from harmpotential-quotes/{slug}-harmpotential.md
 * - Pharmacology: Extracted quotes from pharmacology-quotes/{slug}-pharmacology.md
 * - History & Culture: Extracted quotes from history-culture-quotes/{slug}-history-culture.md
 * 
 * Future sections can be added as extraction is completed.
 */

// Import all harm potential quote files using Vite's glob import
const harmPotentialModules = import.meta.glob<string>(
  '/harmpotential-quotes/*-harmpotential.md',
  { query: '?raw', import: 'default', eager: false }
);

// Import all pharmacology quote files using Vite's glob import
const pharmacologyModules = import.meta.glob<string>(
  '/pharmacology-quotes/*-pharmacology.md',
  { query: '?raw', import: 'default', eager: false }
);

// Import all history & culture quote files using Vite's glob import
const historyCultureModules = import.meta.glob<string>(
  '/history-culture-quotes/*-history-culture.md',
  { query: '?raw', import: 'default', eager: false }
);

// Build a lookup map from slug to module path for harm potential
const harmPotentialSlugMap = new Map<string, string>();

for (const path of Object.keys(harmPotentialModules)) {
  // Path format: /harmpotential-quotes/{slug}-harmpotential.md
  const match = path.match(/\/harmpotential-quotes\/(.+)-harmpotential\.md$/);
  if (match) {
    harmPotentialSlugMap.set(match[1], path);
  }
}

// Build a lookup map from slug to module path for pharmacology
const pharmacologySlugMap = new Map<string, string>();

for (const path of Object.keys(pharmacologyModules)) {
  // Path format: /pharmacology-quotes/{slug}-pharmacology.md
  const match = path.match(/\/pharmacology-quotes\/(.+)-pharmacology\.md$/);
  if (match) {
    pharmacologySlugMap.set(match[1], path);
  }
}

// Build a lookup map from slug to module path for history & culture
const historyCultureSlugMap = new Map<string, string>();

for (const path of Object.keys(historyCultureModules)) {
  // Path format: /history-culture-quotes/{slug}-history-culture.md
  const match = path.match(/\/history-culture-quotes\/(.+)-history-culture\.md$/);
  if (match) {
    historyCultureSlugMap.set(match[1], path);
  }
}

/**
 * Check if harm potential extracted sources exist for a given slug.
 */
export function hasHarmPotentialQuotes(slug: string): boolean {
  return harmPotentialSlugMap.has(slug);
}

/**
 * Load harm potential extracted quotes for a substance.
 * Returns null if no extracted quotes exist.
 */
export async function loadHarmPotentialQuotes(slug: string): Promise<string | null> {
  const path = harmPotentialSlugMap.get(slug);
  if (!path) {
    return null;
  }
  
  const loader = harmPotentialModules[path];
  if (!loader) {
    return null;
  }
  
  try {
    const content = await loader();
    return content;
  } catch (error) {
    console.error(`Failed to load harm potential quotes for ${slug}:`, error);
    return null;
  }
}

/**
 * Get list of all slugs that have harm potential extracted sources.
 */
export function getHarmPotentialSlugs(): string[] {
  return Array.from(harmPotentialSlugMap.keys());
}

/**
 * Check if pharmacology extracted sources exist for a given slug.
 */
export function hasPharmacologyQuotes(slug: string): boolean {
  return pharmacologySlugMap.has(slug);
}

/**
 * Load pharmacology extracted quotes for a substance.
 * Returns null if no extracted quotes exist.
 */
export async function loadPharmacologyQuotes(slug: string): Promise<string | null> {
  const path = pharmacologySlugMap.get(slug);
  if (!path) {
    return null;
  }
  
  const loader = pharmacologyModules[path];
  if (!loader) {
    return null;
  }
  
  try {
    const content = await loader();
    return content;
  } catch (error) {
    console.error(`Failed to load pharmacology quotes for ${slug}:`, error);
    return null;
  }
}

/**
 * Get list of all slugs that have pharmacology extracted sources.
 */
export function getPharmacologySlugs(): string[] {
  return Array.from(pharmacologySlugMap.keys());
}

/**
 * Check if history & culture extracted sources exist for a given slug.
 */
export function hasHistoryCultureQuotes(slug: string): boolean {
  return historyCultureSlugMap.has(slug);
}

/**
 * Load history & culture extracted quotes for a substance.
 * Returns null if no extracted quotes exist.
 */
export async function loadHistoryCultureQuotes(slug: string): Promise<string | null> {
  const path = historyCultureSlugMap.get(slug);
  if (!path) {
    return null;
  }
  
  const loader = historyCultureModules[path];
  if (!loader) {
    return null;
  }
  
  try {
    const content = await loader();
    return content;
  } catch (error) {
    console.error(`Failed to load history & culture quotes for ${slug}:`, error);
    return null;
  }
}

/**
 * Get list of all slugs that have history & culture extracted sources.
 */
export function getHistoryCultureSlugs(): string[] {
  return Array.from(historyCultureSlugMap.keys());
}

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

/**
 * Check which sections have extracted source data for a given slug.
 */
export function getSectionSourceAvailability(slug: string): SectionSourceAvailability {
  return {
    harm_potential: hasHarmPotentialQuotes(slug),
    dosage_duration: false, // Future: dosage-quotes/{slug}-dosage.md
    subjective_effects: false, // Future: effects-quotes/{slug}-effects.md
    pharmacology: hasPharmacologyQuotes(slug),
    interactions: false,
    tolerance: false,
    history_culture: hasHistoryCultureQuotes(slug),
    legality: false,
    identification: false,
  };
}

// Re-export section prompts for convenience
export { sectionPrompts, sectionMetadata, type SectionKey } from '../data/config/sectionPrompts';
