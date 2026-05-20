import type { ParsedOutputShape, ParsedSourceRecord } from "./contracts";
import type { ParsedSubstanceData, ParserResult, SourceParser } from "./types";
import type { EnrichmentStats } from "./tripsit-combos";
import { aggregateResults, createParsedOutput } from "./aggregation";
import { describeSourceCoverage, resolveSourceIdentity } from "./source-identity";
import type { ParserSourceResolution } from "./source-identity";

export interface SourceInfo {
  id: string;
  fileName: string;
  displayName: string;
  size: number;
  tokens: number;
}

export interface SourceCatalogEntry {
  slug: string;
}

export interface SubstanceSourceDocument {
  slug?: string;
  substanceName: string;
  sources: SourceInfo[];
  contents: Record<string, string>;
}

export interface SourceCatalogAdapter {
  listSubstances(): SourceCatalogEntry[] | Promise<SourceCatalogEntry[]>;
  loadSubstance(
    entry: SourceCatalogEntry,
  ): SubstanceSourceDocument | null | Promise<SubstanceSourceDocument | null>;
}

export interface ParserRegistryAdapter {
  getParser(sourceId: string): SourceParser | undefined;
  resolveSource?(sourceId: string): ParserSourceResolution & { parser?: SourceParser };
}

export interface EnrichmentAdapter {
  enrich(substances: Record<string, ParsedSubstanceData>): EnrichmentStats | Promise<EnrichmentStats>;
}

export interface ParseSourceCorpusWriteContext {
  stats: ParseSourceCorpusStats;
  enrichmentStats: EnrichmentStats;
  preservedManualLegalEntries: number;
}

export interface ParseSourceCorpusWriteResult {
  outputPath?: string;
  lineageOutputPath?: string;
}

export interface PersistenceAdapter {
  readExistingParsedData():
    | Record<string, ParsedSubstanceData>
    | null
    | Promise<Record<string, ParsedSubstanceData> | null>;
  writeParsedOutput(
    output: ParsedOutputShape,
    context: ParseSourceCorpusWriteContext,
  ): void | ParseSourceCorpusWriteResult | Promise<void | ParseSourceCorpusWriteResult>;
}

export interface ParseSourceCorpusStats {
  total: number;
  parsed: number;
  withDosage: number;
  withDuration: number;
  withEffects: number;
  withChemistry: number;
  withInteractions: number;
  withLegal: number;
}

export interface ParseSourceCorpusReporter {
  start?(): void;
  substanceCatalogFound?(count: number): void;
  substanceStarted?(slug: string): void;
  sourceParsed?(event: {
    slug: string;
    source: SourceInfo;
    result: ParserResult;
  }): void;
  progress?(stats: ParseSourceCorpusStats): void;
  warning?(message: string): void;
  parseFinished?(stats: ParseSourceCorpusStats): void;
  enrichmentStarted?(): void;
  enrichmentFinished?(stats: EnrichmentStats): void;
  statisticsReady?(stats: ParseSourceCorpusStats, enrichmentStats: EnrichmentStats): void;
  manualLegalPreserved?(count: number): void;
  outputWritten?(result: ParseSourceCorpusWriteResult | void): void;
  sampleOutput?(slug: string, data: ParsedSubstanceData | undefined): void;
}

export interface ParseSourceCorpusOptions {
  substance?: string;
  catalog: SourceCatalogAdapter;
  parserRegistry: ParserRegistryAdapter;
  enrichment: EnrichmentAdapter;
  persistence: PersistenceAdapter;
  reporter?: ParseSourceCorpusReporter;
}

export interface ParseSourceCorpusResult {
  output: ParsedOutputShape;
  substances: Record<string, ParsedSubstanceData>;
  stats: ParseSourceCorpusStats;
  enrichmentStats: EnrichmentStats;
  preservedManualLegalEntries: number;
  writeResult: ParseSourceCorpusWriteResult | void;
}

export class ParseSourceCorpusError extends Error {
  readonly code: "SUBSTANCE_NOT_FOUND";

  constructor(message: string, code: "SUBSTANCE_NOT_FOUND") {
    super(message);
    this.name = "ParseSourceCorpusError";
    this.code = code;
  }
}

function createEmptyStats(): ParseSourceCorpusStats {
  return {
    total: 0,
    parsed: 0,
    withDosage: 0,
    withDuration: 0,
    withEffects: 0,
    withChemistry: 0,
    withInteractions: 0,
    withLegal: 0,
  };
}

function updateStatsForParsedSubstance(
  stats: ParseSourceCorpusStats,
  parsed: ParsedSubstanceData,
) {
  if (parsed.dosage.length > 0) stats.withDosage++;
  if (parsed.duration.length > 0) stats.withDuration++;
  if (parsed.effects.length > 0) stats.withEffects++;
  if (parsed.chemistry) stats.withChemistry++;
  if (parsed.interactions.length > 0) stats.withInteractions++;
  if (parsed.legal.length > 0) stats.withLegal++;
}

function recalculateInteractionStatsAfterEnrichment(
  stats: ParseSourceCorpusStats,
  substances: Record<string, ParsedSubstanceData>,
) {
  let withInteractionsAfter = 0;
  for (const data of Object.values(substances)) {
    if (data.interactions.length > 0) withInteractionsAfter++;
  }
  stats.withInteractions = withInteractionsAfter;
}

function parseSubstance(
  slug: string,
  module: SubstanceSourceDocument,
  parserRegistry: ParserRegistryAdapter,
  reporter?: ParseSourceCorpusReporter,
): ParsedSubstanceData {
  const results: ParsedSourceRecord[] = [];

  for (const source of module.sources) {
    const content = module.contents[source.id];
    if (!content) {
      reporter?.warning?.(`Skipping ${slug}:${source.id}; no source content found`);
      continue;
    }

    const resolution = parserRegistry.resolveSource?.(source.id) ?? {
      ...resolveSourceIdentity(source.id),
      parser: parserRegistry.getParser(source.id),
    };
    const parser = resolution.parser;
    if (!parser) {
      if (resolution.kind === "unsupported" && resolution.descriptor) {
        reporter?.warning?.(
          `Skipping ${slug}:${resolution.descriptor.id}; known unsupported source (${resolution.descriptor.displayName})`,
        );
      } else if (resolution.kind === "synthetic" && resolution.descriptor) {
        reporter?.warning?.(
          `Skipping ${slug}:${resolution.descriptor.id}; synthetic source is not parsed directly`,
        );
      } else {
        reporter?.warning?.(`Skipping ${slug}:${source.id}; unknown parser source`);
      }
      continue;
    }

    const result = parser.parse(content, module.substanceName);
    const coverage = describeSourceCoverage(parser.sourceId, source.displayName);
    results.push({
      sourceId: coverage.sourceId,
      displayName: coverage.displayName,
      result,
      tokens: source.tokens,
    });

    reporter?.sourceParsed?.({
      slug,
      source,
      result,
    });
  }

  return aggregateResults(slug, module.substanceName, results);
}

type LegalEntryWithManualFlag = ParsedSubstanceData["legal"][number] & {
  manuallyEdited?: boolean;
};

export function preserveManualLegalEdits(
  newData: Record<string, ParsedSubstanceData>,
  existingData: Record<string, ParsedSubstanceData> | null,
): number {
  if (!existingData) return 0;

  let preserved = 0;

  for (const [slug, existing] of Object.entries(existingData)) {
    if (!newData[slug] || !existing.legal) continue;

    const manualEntries = (existing.legal as LegalEntryWithManualFlag[]).filter(
      (entry) => entry.manuallyEdited === true,
    );

    if (manualEntries.length > 0) {
      newData[slug].legal = existing.legal;
      preserved++;
    }
  }

  return preserved;
}

export async function parseSourceCorpus(
  options: ParseSourceCorpusOptions,
): Promise<ParseSourceCorpusResult> {
  const { catalog, enrichment, parserRegistry, persistence, reporter } = options;

  reporter?.start?.();

  const existingData = await persistence.readExistingParsedData();
  const catalogEntries = await catalog.listSubstances();
  reporter?.substanceCatalogFound?.(catalogEntries.length);

  const entriesToProcess = options.substance
    ? catalogEntries.filter((entry) => entry.slug === options.substance)
    : catalogEntries;

  if (options.substance && entriesToProcess.length === 0) {
    throw new ParseSourceCorpusError(
      `Substance "${options.substance}" not found`,
      "SUBSTANCE_NOT_FOUND",
    );
  }

  const substances: Record<string, ParsedSubstanceData> = {};
  const stats = createEmptyStats();

  for (const entry of entriesToProcess) {
    const slug = entry.slug;
    stats.total++;
    reporter?.substanceStarted?.(slug);

    const module = await catalog.loadSubstance(entry);
    if (!module) {
      reporter?.warning?.(`Skipping ${slug}; source module could not be loaded`);
      continue;
    }

    const parsed = parseSubstance(slug, module, parserRegistry, reporter);
    substances[slug] = parsed;
    stats.parsed++;

    updateStatsForParsedSubstance(stats, parsed);
    reporter?.progress?.(stats);
  }

  reporter?.parseFinished?.(stats);

  reporter?.enrichmentStarted?.();
  const enrichmentStats = await enrichment.enrich(substances);
  reporter?.enrichmentFinished?.(enrichmentStats);

  recalculateInteractionStatsAfterEnrichment(stats, substances);
  reporter?.statisticsReady?.(stats, enrichmentStats);

  const preservedManualLegalEntries = preserveManualLegalEdits(substances, existingData);
  reporter?.manualLegalPreserved?.(preservedManualLegalEntries);

  const output = createParsedOutput(substances);
  const writeResult = await persistence.writeParsedOutput(output, {
    stats,
    enrichmentStats,
    preservedManualLegalEntries,
  });
  reporter?.outputWritten?.(writeResult);

  if (options.substance) {
    reporter?.sampleOutput?.(options.substance, substances[options.substance]);
  }

  return {
    output,
    substances,
    stats,
    enrichmentStats,
    preservedManualLegalEntries,
    writeResult,
  };
}
