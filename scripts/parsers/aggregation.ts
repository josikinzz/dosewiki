/**
 * Shared parser aggregation and output shaping utilities.
 * Keeps parser registry concerns separate from merge behavior.
 */

import type { ParsedSubstanceData } from "./types";
import type { ParsedOutputShape, ParsedSourceRecord } from "./contracts";

export const pharmacologySourcePriority: Record<string, number> = {
  drugbank: 1,
  psychonautwiki: 2,
  wikipedia: 3,
};

export function aggregateResults(
  slug: string,
  name: string,
  results: ParsedSourceRecord[],
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

  for (const { sourceId, displayName, result, tokens } of results) {
    aggregated.dosage.push(...result.dosage);
    aggregated.duration.push(...result.duration);
    aggregated.effects.push(...result.effects);
    aggregated.interactions.push(...result.interactions);
    aggregated.legal.push(...result.legal);
    aggregated.internationalLaw.push(...result.internationalLaw);

    if (result.chemistry) {
      if (!aggregated.chemistry) {
        aggregated.chemistry = { ...result.chemistry };
      } else {
        aggregated.chemistry.sources = [
          ...(aggregated.chemistry.sources || []),
          ...(result.chemistry.sources || []),
        ];
        for (const [key, value] of Object.entries(result.chemistry)) {
          if (key !== "sources" && value && !(aggregated.chemistry as Record<string, unknown>)[key]) {
            (aggregated.chemistry as Record<string, unknown>)[key] = value;
          }
        }
      }
    }

    if (result.pharmacology) {
      if (!aggregated.pharmacology) {
        aggregated.pharmacology = { sources: [] };
      }
      (aggregated.pharmacology as Record<string, unknown>)[`_src_${sourceId}`] = result.pharmacology;
      aggregated.pharmacology.sources = [
        ...(aggregated.pharmacology.sources || []),
        ...(result.pharmacology.sources || []),
      ];
    }

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

    if (result.tolerance) {
      if (!aggregated.tolerance) {
        aggregated.tolerance = [result.tolerance];
      } else {
        aggregated.tolerance.push(result.tolerance);
      }
    }

    aggregated.narrativeContent.experienceReports.push(...result.narrativeContent.experienceReports);
    aggregated.narrativeContent.synthesis.push(...result.narrativeContent.synthesis);
    aggregated.narrativeContent.qualitativeComments.push(...result.narrativeContent.qualitativeComments);
    aggregated.narrativeContent.generalNotes.push(...result.narrativeContent.generalNotes);

    aggregated.sourcesCoverage.push({
      sourceId,
      displayName,
      sectionsExtracted: result.sectionsExtracted,
      tokensOriginal: tokens,
    });
  }

  if (aggregated.pharmacology) {
    const pharmacology = aggregated.pharmacology as Record<string, unknown>;
    const sourceKeys = Object.keys(pharmacology).filter((key) => key.startsWith("_src_"));

    sourceKeys.sort((left, right) => {
      const leftSource = left.replace("_src_", "");
      const rightSource = right.replace("_src_", "");
      const leftPriority = pharmacologySourcePriority[leftSource] ?? 99;
      const rightPriority = pharmacologySourcePriority[rightSource] ?? 99;
      return leftPriority - rightPriority;
    });

    const pharmacologyFields = [
      "halfLife",
      "bioavailability",
      "metabolism",
      "receptors",
      "mechanismOfAction",
    ];

    for (const sourceKey of sourceKeys) {
      const sourceData = pharmacology[sourceKey] as Record<string, unknown>;
      for (const field of pharmacologyFields) {
        if (sourceData[field] && !pharmacology[field]) {
          pharmacology[field] = sourceData[field];
        }
      }
      delete pharmacology[sourceKey];
    }
  }

  return aggregated;
}

export function createParsedOutput(
  substances: Record<string, ParsedSubstanceData>,
): ParsedOutputShape {
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
