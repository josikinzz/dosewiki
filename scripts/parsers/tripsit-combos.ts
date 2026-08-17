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
import { getSourceDescriptor, TRIPSIT_COMBOS_SOURCE_ID } from "./source-identity";

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
  { category: "dox", pattern: /^do[bceimpn]/i },

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
const TRIPSIT_COMBOS_SOURCE = getSourceDescriptor(TRIPSIT_COMBOS_SOURCE_ID);

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

interface TripSitComboPolicyResult {
  aggregate: ParsedSubstanceData;
  category?: string;
  interactionsAdded: number;
  interactionsOverridden: number;
  enriched: boolean;
}

function applyTripSitComboPolicy(
  slug: string,
  data: ParsedSubstanceData,
  combos: CombosData,
): TripSitComboPolicyResult {
  const category = getCategoryForSubstance(slug);
  if (!category || !combos[category]) {
    return {
      aggregate: data,
      interactionsAdded: 0,
      interactionsOverridden: 0,
      enriched: false,
    };
  }

  let interactions = [...data.interactions];
  let interactionsAdded = 0;
  let interactionsOverridden = 0;

  for (const [interactsWith, info] of Object.entries(combos[category])) {
    const severity = STATUS_MAP[info.status];
    if (!severity) continue; // Skip unknown status values

    const interaction: ParsedInteraction = {
      substance: formatInteractionName(interactsWith),
      severity,
      description: info.note,
      source: TRIPSIT_COMBOS_SOURCE.id,
    };

    const existingIdx = interactions.findIndex(
      (i) =>
        i.substance.toLowerCase() === interaction.substance.toLowerCase() ||
        i.substance.toLowerCase() === interactsWith.toLowerCase(),
    );

    if (existingIdx === -1) {
      interactions = [...interactions, interaction];
      interactionsAdded++;
    } else if (OVERRIDE_SOURCES.has(interactions[existingIdx].source)) {
      interactions = interactions.map((existing, idx) =>
        idx === existingIdx ? interaction : existing,
      );
      interactionsOverridden++;
    }
  }

  const enriched = interactionsAdded > 0 || interactionsOverridden > 0;
  if (!enriched) {
    return {
      aggregate: data,
      category,
      interactionsAdded,
      interactionsOverridden,
      enriched,
    };
  }

  const alreadyCovered = data.sourcesCoverage.some(
    (source) => source.sourceId === TRIPSIT_COMBOS_SOURCE.id,
  );

  return {
    aggregate: {
      ...data,
      interactions,
      sourcesCoverage: alreadyCovered
        ? data.sourcesCoverage
        : [
            ...data.sourcesCoverage,
            {
              sourceId: TRIPSIT_COMBOS_SOURCE.id,
              displayName: TRIPSIT_COMBOS_SOURCE.displayName,
              sectionsExtracted: ["interactions"],
              tokensOriginal: 0,
            },
          ],
    },
    category,
    interactionsAdded,
    interactionsOverridden,
    enriched,
  };
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
    const result = applyTripSitComboPolicy(slug, data, combos);
    if (!result.category) continue;

    stats.categoriesMapped[result.category] =
      (stats.categoriesMapped[result.category] || 0) + 1;

    stats.interactionsAdded += result.interactionsAdded;
    stats.interactionsOverridden += result.interactionsOverridden;

    if (result.enriched) {
      substances[slug] = result.aggregate;
      stats.substancesEnriched++;
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
