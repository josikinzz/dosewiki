import type {
  ParsedSourcesOutput,
  ParsedSubstanceData,
  ParserResult,
  SourceParser,
} from "./types";

export interface ParsedSourceRecord {
  sourceId: string;
  displayName: string;
  result: ParserResult;
  tokens: number;
}

export type SourceParserRegistry = Record<string, SourceParser>;

export interface OutputStats {
  totalSubstances: number;
  sourcesProcessed: string[];
  avgCoveragePerSubstance: number;
}

export interface ParsedOutputShape extends ParsedSourcesOutput {
  substances: Record<string, ParsedSubstanceData>;
  stats: OutputStats;
}

export function normalizeParserSourceId(sourceId: string): string {
  return sourceId.toLowerCase();
}
