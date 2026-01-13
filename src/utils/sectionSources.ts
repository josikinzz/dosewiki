/**
 * Section-specific source loading utilities.
 * 
 * Currently supports:
 * - Harm Potential: Extracted quotes from harmpotential-quotes/{slug}-harmpotential.md
 * 
 * Future sections can be added as extraction is completed.
 */

// Import all harm potential quote files using Vite's glob import
const harmPotentialModules = import.meta.glob<string>(
  '/harmpotential-quotes/*-harmpotential.md',
  { query: '?raw', import: 'default', eager: false }
);

// Build a lookup map from slug to module path
const harmPotentialSlugMap = new Map<string, string>();

for (const path of Object.keys(harmPotentialModules)) {
  // Path format: /harmpotential-quotes/{slug}-harmpotential.md
  const match = path.match(/\/harmpotential-quotes\/(.+)-harmpotential\.md$/);
  if (match) {
    harmPotentialSlugMap.set(match[1], path);
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

// Type for section source availability
export interface SectionSourceAvailability {
  harm_potential: boolean;
  dosage_duration: boolean;
  subjective_effects: boolean;
  pharmacology: boolean;
  interactions: boolean;
  tolerance: boolean;
  legality: boolean;
  identification: boolean;
}

/**
 * Check which sections have extracted source data for a given slug.
 * Currently only harm_potential has extracted data.
 */
export function getSectionSourceAvailability(slug: string): SectionSourceAvailability {
  return {
    harm_potential: hasHarmPotentialQuotes(slug),
    dosage_duration: false, // Future: dosage-quotes/{slug}-dosage.md
    subjective_effects: false, // Future: effects-quotes/{slug}-effects.md
    pharmacology: false,
    interactions: false,
    tolerance: false,
    legality: false,
    identification: false,
  };
}

// Re-export section prompts for convenience
export { sectionPrompts, sectionMetadata, type SectionKey } from '../data/config/sectionPrompts';
