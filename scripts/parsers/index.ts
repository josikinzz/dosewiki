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

// Source priority for pharmacology fields (lower number = higher priority)
// DrugBank > PsychonautWiki > Wikipedia > others
export const pharmacologySourcePriority: Record<string, number> = {
  drugbank: 1,
  psychonautwiki: 2,
  wikipedia: 3,
  // All others default to 99
};

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
    internationalLaw: [],
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
    aggregated.internationalLaw.push(...result.internationalLaw);

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

    // Pharmacology: collect all results for priority-based merging later
    if (result.pharmacology) {
      if (!aggregated.pharmacology) {
        aggregated.pharmacology = { sources: [] };
      }
      // Store source with its data for later priority resolution
      (aggregated.pharmacology as Record<string, unknown>)[`_src_${sourceId}`] = result.pharmacology;
      aggregated.pharmacology.sources = [
        ...(aggregated.pharmacology.sources || []),
        ...(result.pharmacology.sources || []),
      ];
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

  // Resolve pharmacology fields by priority (Wikipedia > PsychonautWiki > DrugBank)
  if (aggregated.pharmacology) {
    const pharm = aggregated.pharmacology as Record<string, unknown>;
    const sourceKeys = Object.keys(pharm).filter((k) => k.startsWith("_src_"));

    // Sort sources by priority
    sourceKeys.sort((a, b) => {
      const srcA = a.replace("_src_", "");
      const srcB = b.replace("_src_", "");
      const prioA = pharmacologySourcePriority[srcA] ?? 99;
      const prioB = pharmacologySourcePriority[srcB] ?? 99;
      return prioA - prioB;
    });

    // Merge fields in priority order (highest priority source wins for each field)
    const pharmacologyFields = ["halfLife", "bioavailability", "metabolism", "receptors", "mechanismOfAction"];
    for (const srcKey of sourceKeys) {
      const srcData = pharm[srcKey] as Record<string, unknown>;
      for (const field of pharmacologyFields) {
        if (srcData[field] && !pharm[field]) {
          pharm[field] = srcData[field];
        }
      }
      // Clean up temporary source data
      delete pharm[srcKey];
    }
  }

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
