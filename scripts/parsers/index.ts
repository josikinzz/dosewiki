/**
 * Parser compatibility facade.
 * Re-exports the explicit contract, registry, and aggregation helpers.
 */

export * from "./types";
export * from "./contracts";
export * from "./source-identity";

export { enrichWithCombos, getCategoryForSubstance, getSubstancesForCategory } from "./tripsit-combos";
export type { EnrichmentStats } from "./tripsit-combos";

export { parsers, getParser, parseSource, resolveParserSource } from "./registry";
export { pharmacologySourcePriority, aggregateResults, createParsedOutput } from "./aggregation";
export { parseSourceCorpus, preserveManualLegalEdits, ParseSourceCorpusError } from "./parse-source-corpus";
export type {
  EnrichmentAdapter,
  ParseSourceCorpusOptions,
  ParseSourceCorpusReporter,
  ParseSourceCorpusResult,
  ParseSourceCorpusStats,
  ParseSourceCorpusWriteContext,
  ParseSourceCorpusWriteResult,
  ParserRegistryAdapter,
  PersistenceAdapter,
  SourceCatalogAdapter,
  SourceCatalogEntry,
  SourceInfo,
  SubstanceSourceDocument,
} from "./parse-source-corpus";
