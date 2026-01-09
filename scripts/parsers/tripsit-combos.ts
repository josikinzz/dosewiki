/**
 * TripSit Combos Integration
 *
 * Enriches parsed substance data with interaction information from
 * TripSit's drug combination chart (tripsit-combos.json).
 *
 * This is a post-processing enrichment step that runs after all
 * source parsers, mapping our specific substance slugs to TripSit's
 * class-based category system.
 */

import * as fs from "fs";
import type { ParsedSubstanceData, ParsedInteraction } from "./types";

// === Types for combos JSON ===

interface ComboSource {
  author: string;
  title: string;
  url: string;
}

interface ComboEntry {
  status: string;
  note?: string;
  sources?: ComboSource[];
}

type CombosData = Record<string, Record<string, ComboEntry>>;

// === Status Mapping ===

const STATUS_MAP: Record<string, ParsedInteraction["severity"]> = {
  Dangerous: "dangerous",
  Unsafe: "unsafe",
  Caution: "caution",
  "Low Risk & Synergy": "low-risk-synergy",
  "Low Risk & Decrease": "low-risk-decrease",
  "Low Risk & No Synergy": "low-risk-no-synergy",
};

// === Category Mapping ===

// Direct matches - substance slugs that match combo category names exactly
const DIRECT_MATCHES = new Set([
  "alcohol",
  "amt",
  "caffeine",
  "cannabis",
  "cocaine",
  "dextromethorphan",
  "diphenhydramine",
  "dmt",
  "ketamine",
  "lithium",
  "lsd",
  "mdma",
  "mephedrone",
  "mescaline",
  "nitrous",
  "pcp",
  "pregabalin",
  "tramadol",
]);

// Pattern-based category mapping
// Order matters: more specific patterns should come first
const CATEGORY_PATTERNS: Array<{ category: string; pattern: RegExp }> = [
  // 2C-T-x series (before general 2C-x)
  { category: "2c-t-x", pattern: /^2c-t-/i },

  // 2C-x series (general phenethylamines)
  { category: "2c-x", pattern: /^2c-[a-z]/i },

  // 5-MeO-xxT tryptamines
  { category: "5-meo-xxt", pattern: /^5-meo-/i },

  // DOx amphetamines
  { category: "dox", pattern: /^do[bcimpn]/i },

  // NBOMe compounds (including -nboh, -nbf variants)
  // Fix: Expanded pattern to catch 25x-nboh and other related compounds
  { category: "nbomes", pattern: /nbome|nboh|nbf$/i },

  // LSD analogs (maps to lsd category in combos)
  // Fix: LSD analogs like 1p-lsd, al-lad, eth-lad were unmapped
  {
    category: "lsd",
    pattern:
      /^(1[bdfpv]-lsd|1cp-lsd|1cp-al-lad|1cp-mipla|al-lad|eth-lad|pro-lad|pargy-lad|ald-52|lsz|lsm-775|lsa)$/i,
  },

  // Amphetamines (specific substances)
  {
    category: "amphetamines",
    pattern:
      /^(amphetamine|dextroamphetamine|methamphetamine|lisdexamfetamine|adderall|vyvanse)$/i,
  },

  // Opioids
  {
    category: "opioids",
    pattern:
      /^(morphine|heroin|fentanyl|codeine|oxycodone|hydrocodone|hydromorphone|oxymorphone|buprenorphine|opium|kratom|methadone|hydromorphone|dihydrocodeine|nicomorphine|ethylmorphine|desomorphine|o-desmethyltramadol|.*fentanyl.*)$/i,
  },

  // Benzodiazepines (comprehensive - all substances ending in -zepam or -zolam)
  { category: "benzodiazepines", pattern: /(azepam|azolam|etizolam)$/i },

  // Mushrooms / psilocybin-related
  {
    category: "mushrooms",
    pattern: /^(psilocybin|psilocin|4-aco-|4-ho-|psilocybin-mushrooms)/i,
  },

  // SSRIs
  {
    category: "ssris",
    pattern:
      /^(fluoxetine|sertraline|paroxetine|citalopram|escitalopram|fluvoxamine|prozac|zoloft|lexapro|paxil)$/i,
  },

  // MAOIs
  {
    category: "maois",
    pattern:
      /^(harmaline|harmine|moclobemide|selegiline|phenelzine|tranylcypromine|ayahuasca|syrian-rue|isocarboxazid|rasagiline)$/i,
  },

  // GHB/GBL
  { category: "ghb/gbl", pattern: /^(ghb|gbl|1,4-butanediol|gamma)$/i },

  // MXE
  { category: "mxe", pattern: /^(methoxetamine|mxe)$/i },
];

/**
 * Get the TripSit combo category for a given substance slug
 */
export function getCategoryForSubstance(slug: string): string | undefined {
  const normalizedSlug = slug.toLowerCase();

  // Check direct matches first
  if (DIRECT_MATCHES.has(normalizedSlug)) {
    return normalizedSlug;
  }

  // Check pattern-based matches
  for (const { category, pattern } of CATEGORY_PATTERNS) {
    if (pattern.test(normalizedSlug)) {
      return category;
    }
  }

  return undefined;
}

/**
 * Sources that should be overridden by tripsit-combos
 * (Lower priority for harm-reduction-focused interaction data)
 */
const OVERRIDE_SOURCES = new Set(["drugbank", "wikipedia"]);

/**
 * Format the interaction substance name for display
 * Converts category names to more readable forms
 */
function formatInteractionName(category: string): string {
  const nameMap: Record<string, string> = {
    "2c-t-x": "2C-T-x compounds",
    "2c-x": "2C-x compounds",
    "5-meo-xxt": "5-MeO-xxT tryptamines",
    dox: "DOx compounds",
    nbomes: "NBOMe compounds",
    amphetamines: "Amphetamines",
    opioids: "Opioids",
    benzodiazepines: "Benzodiazepines",
    mushrooms: "Psilocybin mushrooms",
    ssris: "SSRIs",
    maois: "MAOIs",
    "ghb/gbl": "GHB/GBL",
    mxe: "MXE",
    amt: "AMT",
    pcp: "PCP",
  };

  return (
    nameMap[category.toLowerCase()] ||
    category.charAt(0).toUpperCase() + category.slice(1)
  );
}

/**
 * Enrichment statistics
 */
export interface EnrichmentStats {
  substancesEnriched: number;
  interactionsAdded: number;
  interactionsOverridden: number;
  categoriesMapped: Record<string, number>;
}

/**
 * Enrich parsed substances with TripSit combo interaction data
 */
export function enrichWithCombos(
  substances: Record<string, ParsedSubstanceData>,
  combosPath: string
): EnrichmentStats {
  const combos: CombosData = JSON.parse(fs.readFileSync(combosPath, "utf8"));

  const stats: EnrichmentStats = {
    substancesEnriched: 0,
    interactionsAdded: 0,
    interactionsOverridden: 0,
    categoriesMapped: {},
  };

  for (const [slug, data] of Object.entries(substances)) {
    const category = getCategoryForSubstance(slug);
    if (!category || !combos[category]) continue;

    // Track category usage
    stats.categoriesMapped[category] =
      (stats.categoriesMapped[category] || 0) + 1;

    let addedForSubstance = false;

    // Get all interactions for this category
    for (const [interactsWith, info] of Object.entries(combos[category])) {
      const severity = STATUS_MAP[info.status];
      if (!severity) continue; // Skip unknown status values

      const interaction: ParsedInteraction = {
        substance: formatInteractionName(interactsWith),
        severity,
        description: info.note,
        source: "tripsit-combos",
      };

      // Check if we already have this interaction
      const existingIdx = data.interactions.findIndex(
        (i) =>
          i.substance.toLowerCase() === interaction.substance.toLowerCase() ||
          i.substance.toLowerCase() === interactsWith.toLowerCase()
      );

      if (existingIdx === -1) {
        // New interaction - add it
        data.interactions.push(interaction);
        stats.interactionsAdded++;
        addedForSubstance = true;
      } else if (OVERRIDE_SOURCES.has(data.interactions[existingIdx].source)) {
        // Override lower-priority source
        data.interactions[existingIdx] = interaction;
        stats.interactionsOverridden++;
        addedForSubstance = true;
      }
    }

    if (addedForSubstance) {
      stats.substancesEnriched++;

      // Add to sourcesCoverage if not already present
      const alreadyCovered = data.sourcesCoverage.some(
        (s) => s.sourceId === "tripsit-combos"
      );
      if (!alreadyCovered) {
        data.sourcesCoverage.push({
          sourceId: "tripsit-combos",
          displayName: "TripSit Combination Guide",
          sectionsExtracted: ["interactions"],
          tokensOriginal: 0, // Not text-based
        });
      }
    }
  }

  return stats;
}

/**
 * Get all substances that map to a given category
 * Useful for debugging and verification
 */
export function getSubstancesForCategory(
  category: string,
  slugs: string[]
): string[] {
  return slugs.filter(
    (slug) => getCategoryForSubstance(slug)?.toLowerCase() === category.toLowerCase()
  );
}
