/**
 * Parser compatibility facade.
 * Re-exports the explicit contract, registry, and aggregation helpers.
 */

export * from "./types";
export * from "./contracts";

export { enrichWithCombos, getCategoryForSubstance, getSubstancesForCategory } from "./tripsit-combos";
export type { EnrichmentStats } from "./tripsit-combos";

export { parsers, getParser, parseSource } from "./registry";
export { pharmacologySourcePriority, aggregateResults, createParsedOutput } from "./aggregation";
