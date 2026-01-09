/**
 * Unified Parser Registry
 * Maps source IDs to their respective parsers
 */

import type { SourceParser, ParsedSubstanceData, ParsedSourcesOutput, ParserResult } from "./types";

// Import all parsers
import { tripsitFactsheetsParser, tripsitWikiParser } from "./tripsit";
import { psychonautWikiParser } from "./psychonautwiki";
import { drugBankParser } from "./drugbank";
import { erowidParser } from "./erowid";
import {
  isomerDesignParser,
  saferPartyParser,
  deiaParser,
  drugUsersBibleParser,
  drugClassroomParser,
  wikipediaParser,
} from "./others";

// Re-export types
export * from "./types";

// Export combos enrichment
export { enrichWithCombos, getCategoryForSubstance, getSubstancesForCategory } from "./tripsit-combos";
export type { EnrichmentStats } from "./tripsit-combos";

// Parser registry
export const parsers: Record<string, SourceParser> = {
  "tripsit-factsheets": tripsitFactsheetsParser,
  "tripsit-wiki": tripsitWikiParser,
  psychonautwiki: psychonautWikiParser,
  drugbank: drugBankParser,
  erowid: erowidParser,
  isomerdesign: isomerDesignParser,
  saferparty: saferPartyParser,
  disregardeverythingisay: deiaParser,
  drugusersbible: drugUsersBibleParser,
  thedrugclassroom: drugClassroomParser,
  wikipedia: wikipediaParser,
};

// Source priority for conflict resolution
// NOTE: Priority system removed - all data from all sources is now preserved
// Consumers can implement their own deduplication/priority logic
// export const sourcePriority: Record<string, Record<string, number>> = { ... };

/**
 * Get parser for a given source ID
 */
export function getParser(sourceId: string): SourceParser | undefined {
  return parsers[sourceId.toLowerCase()];
}

/**
 * Parse content from a specific source
 */
export function parseSource(
  sourceId: string,
  content: string,
  substanceName: string
): ParserResult | undefined {
  const parser = getParser(sourceId);
  if (!parser) return undefined;
  return parser.parse(content, substanceName);
}

/**
 * Aggregate results from multiple sources into a single ParsedSubstanceData
 * NOTE: No deduplication - all data from all sources is preserved for maximum transparency
 */
export function aggregateResults(
  slug: string,
  name: string,
  results: Array<{ sourceId: string; displayName: string; result: ParserResult; tokens: number }>
): ParsedSubstanceData {
  const aggregated: ParsedSubstanceData = {
    slug,
    name,
    dosage: [],
    duration: [],
    effects: [],
    interactions: [],
    legal: [],
    narrativeContent: {
      experienceReports: [],
      synthesis: [],
      qualitativeComments: [],
      generalNotes: [],
    },
    sourcesCoverage: [],
  };

  // Collect ALL data from ALL sources - no deduplication
  for (const { sourceId, displayName, result, tokens } of results) {
    // Append ALL entries without deduplication
    aggregated.dosage.push(...result.dosage);
    aggregated.duration.push(...result.duration);
    aggregated.effects.push(...result.effects);
    aggregated.interactions.push(...result.interactions);
    aggregated.legal.push(...result.legal);

    // Chemistry: merge fields, track all sources
    if (result.chemistry) {
      if (!aggregated.chemistry) {
        aggregated.chemistry = { ...result.chemistry };
      } else {
        aggregated.chemistry.sources = [
          ...(aggregated.chemistry.sources || []),
          ...(result.chemistry.sources || []),
        ];
        // Fill in any missing fields from this source
        for (const [key, value] of Object.entries(result.chemistry)) {
          if (key !== "sources" && value && !(aggregated.chemistry as Record<string, unknown>)[key]) {
            (aggregated.chemistry as Record<string, unknown>)[key] = value;
          }
        }
      }
    }

    // Pharmacology: same merge pattern
    if (result.pharmacology) {
      if (!aggregated.pharmacology) {
        aggregated.pharmacology = { ...result.pharmacology };
      } else {
        aggregated.pharmacology.sources = [
          ...(aggregated.pharmacology.sources || []),
          ...(result.pharmacology.sources || []),
        ];
        for (const [key, value] of Object.entries(result.pharmacology)) {
          if (key !== "sources" && value && !(aggregated.pharmacology as Record<string, unknown>)[key]) {
            (aggregated.pharmacology as Record<string, unknown>)[key] = value;
          }
        }
      }
    }

    // HarmReduction: append all rules/risks
    if (result.harmReduction) {
      if (!aggregated.harmReduction) {
        aggregated.harmReduction = { ...result.harmReduction };
      } else {
        aggregated.harmReduction.rules = [
          ...(aggregated.harmReduction.rules || []),
          ...(result.harmReduction.rules || []),
        ];
        aggregated.harmReduction.shortTermRisks = [
          ...(aggregated.harmReduction.shortTermRisks || []),
          ...(result.harmReduction.shortTermRisks || []),
        ];
        aggregated.harmReduction.longTermRisks = [
          ...(aggregated.harmReduction.longTermRisks || []),
          ...(result.harmReduction.longTermRisks || []),
        ];
        aggregated.harmReduction.contraindications = [
          ...(aggregated.harmReduction.contraindications || []),
          ...(result.harmReduction.contraindications || []),
        ];
        aggregated.harmReduction.sources = [
          ...(aggregated.harmReduction.sources || []),
          ...(result.harmReduction.sources || []),
        ];
      }
    }

    // Tolerance: append all entries
    if (result.tolerance) {
      if (!aggregated.tolerance) {
        aggregated.tolerance = [result.tolerance];
      } else {
        aggregated.tolerance.push(result.tolerance);
      }
    }

    // Narrative content: append all
    aggregated.narrativeContent.experienceReports.push(
      ...result.narrativeContent.experienceReports
    );
    aggregated.narrativeContent.synthesis.push(...result.narrativeContent.synthesis);
    aggregated.narrativeContent.qualitativeComments.push(
      ...result.narrativeContent.qualitativeComments
    );
    aggregated.narrativeContent.generalNotes.push(...result.narrativeContent.generalNotes);

    // Track source coverage
    aggregated.sourcesCoverage.push({
      sourceId,
      displayName,
      sectionsExtracted: result.sectionsExtracted,
      tokensOriginal: tokens,
    });
  }

  // NO SORTING - keep source processing order
  return aggregated;
}

/**
 * Create the final output structure
 */
export function createParsedOutput(
  substances: Record<string, ParsedSubstanceData>
): ParsedSourcesOutput {
  const allSources = new Set<string>();
  let totalCoverage = 0;
  let count = 0;

  for (const substance of Object.values(substances)) {
    for (const source of substance.sourcesCoverage) {
      allSources.add(source.sourceId);
    }
    totalCoverage += substance.sourcesCoverage.length;
    count++;
  }

  return {
    generatedAt: new Date().toISOString(),
    version: "1.0.0",
    stats: {
      totalSubstances: count,
      sourcesProcessed: Array.from(allSources),
      avgCoveragePerSubstance: count > 0 ? totalCoverage / count : 0,
    },
    substances,
  };
}
