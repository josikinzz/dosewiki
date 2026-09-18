/**
 * Shared parser aggregation and output shaping utilities.
 * Keeps parser registry concerns separate from merge behavior.
 */

import type { ParsedSubstanceData } from "./types";
import type { ParsedOutputShape, ParsedSourceRecord } from "./contracts";
import {
  aggregateParsedSources,
  createDefaultAggregationPolicySet,
  pharmacologySourcePriority,
} from "./aggregation-policy";

export {
  aggregateParsedSources,
  createDefaultAggregationPolicySet,
  pharmacologySourcePriority,
};

export function aggregateResults(
  slug: string,
  name: string,
  results: ParsedSourceRecord[],
): ParsedSubstanceData {
  return aggregateParsedSources(results, createDefaultAggregationPolicySet(slug, name));
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
