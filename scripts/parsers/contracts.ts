import type {
  ParserResult,
  ParsedSourcesOutput,
  ParsedSubstanceData,
  SourceParser,
} from "./types";
import { canonicalizeSourceId } from "./source-identity";

export interface ParsedSourceRecord {
  sourceId: string;
  displayName: string;
  result: ParserResult;
  tokens: number;
}

export type SourceParserRegistry = Record<string, SourceParser>;

interface OutputStats { totalSubstances: number;
sourcesProcessed: string[];
avgCoveragePerSubstance: number; }

export interface ParsedOutputShape extends ParsedSourcesOutput {
  substances: Record<string, ParsedSubstanceData>;
  stats: OutputStats;
}

export interface AggregationPolicySet {
  slug: string;
  name: string;
  policies: AggregationPolicy[];
}

export interface AggregationPolicy {
  merge(aggregate: ParsedSubstanceData, record: ParsedSourceRecord): ParsedSubstanceData;
  finalize?(aggregate: ParsedSubstanceData): ParsedSubstanceData;
}

export function normalizeParserSourceId(sourceId: string): string {
  return canonicalizeSourceId(sourceId) ?? sourceId.trim().toLowerCase();
}
