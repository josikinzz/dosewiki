import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

import { tryWriteArtifactLineageSidecar } from "./lib/data-artifact-lineage.mjs";
import {
  enrichWithCombos,
  getParser,
  parseSourceCorpus,
  resolveParserSource,
} from "./parsers/index";
import type {
  ParsedOutputShape,
  ParsedSubstanceData,
  ParseSourceCorpusOptions,
  ParseSourceCorpusReporter,
  ParseSourceCorpusWriteContext,
  ParseSourceCorpusWriteResult,
  SourceCatalogAdapter,
  SourceCatalogEntry,
  SubstanceSourceDocument,
} from "./parsers/index";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SOURCES_DIR = path.join(__dirname, "../src/data/article-sources");
const DEFAULT_OUTPUT = path.join(__dirname, "../src/data/parsed-sources.json");
const COMBOS_PATH = path.join(__dirname, "../data/third-party/tripsit/tripsit-combos.json");

interface CliOptions {
  substance: string;
  output: string;
  verbose: boolean;
  stats: boolean;
}

export function parseCliOptions(args: string[]): CliOptions {
  const options = {
    substance: "",
    output: DEFAULT_OUTPUT,
    verbose: false,
    stats: false,
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--substance" && args[i + 1]) {
      options.substance = args[++i];
    } else if (args[i] === "--output" && args[i + 1]) {
      options.output = args[++i];
    } else if (args[i] === "--verbose") {
      options.verbose = true;
    } else if (args[i] === "--stats") {
      options.stats = true;
    }
  }

  return options;
}

function getSlugFromPath(filePath: string): string {
  return path.basename(filePath, ".ts");
}

function createFileSystemSourceCatalog(sourcesDir: string): SourceCatalogAdapter {
  return {
    listSubstances() {
      const files = fs.readdirSync(sourcesDir);
      return files
        .filter((fileName) => fileName.endsWith(".ts") && fileName !== "index.ts")
        .map((fileName) => ({
          slug: getSlugFromPath(fileName),
          filePath: path.join(sourcesDir, fileName),
        }));
    },

    async loadSubstance(entry: SourceCatalogEntry) {
      const entryWithPath = entry as SourceCatalogEntry & { filePath?: string };
      const filePath = entryWithPath.filePath ?? path.join(sourcesDir, `${entry.slug}.ts`);

      try {
        const module = await import(filePath);
        const { normalizeArticleSourceDocument } = await import("./article-source-documents/contract.mjs");

        return normalizeArticleSourceDocument(
          {
            slug: entry.slug,
            substanceName: module.substanceName,
            sources: module.sources,
            contents: module.contents,
          },
          { adapter: "local-file" },
        ) as SubstanceSourceDocument;
      } catch (error) {
        console.error(`Error loading ${filePath}:`, error);
        return null;
      }
    },
  };
}

function loadExistingParsedData(outputPath: string): Record<string, ParsedSubstanceData> | null {
  try {
    if (fs.existsSync(outputPath)) {
      const existing = JSON.parse(fs.readFileSync(outputPath, "utf-8"));
      return existing.substances || null;
    }
  } catch {
    // Ignore errors, just return null.
  }
  return null;
}

function createFileSystemPersistence(outputPath: string) {
  return {
    readExistingParsedData() {
      return loadExistingParsedData(outputPath);
    },

    writeParsedOutput(
      output: ParsedOutputShape,
      context: ParseSourceCorpusWriteContext,
    ): ParseSourceCorpusWriteResult {
      fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
      const lineage = tryWriteArtifactLineageSidecar({
        artifactPath: outputPath,
        sourceDeployment: "src/data/article-sources",
        schemaVersion: "scripts/parsers/types.ts",
        extra: {
          substanceCount: context.stats.parsed,
          combosStats: context.enrichmentStats,
          preservedManualLegalEntries: context.preservedManualLegalEntries,
        },
      });

      return {
        outputPath,
        lineageOutputPath: lineage?.outputPath,
      };
    },
  };
}

function formatPercentage(count: number, total: number): string {
  return total > 0 ? ((count / total) * 100).toFixed(1) : "0.0";
}

function createConsoleReporter(options: CliOptions): ParseSourceCorpusReporter {
  return {
    start() {
      console.log("🔬 Source Parser - Extracting structured data from article sources\n");
    },

    substanceCatalogFound(count) {
      console.log(`Found ${count} substance files\n`);
    },

    substanceStarted(slug) {
      if (options.verbose) {
        console.log(`Processing: ${slug}`);
      }
    },

    sourceParsed({ source, result }) {
      if (options.verbose) {
        console.log(
          `  ${source.displayName}: extracted [${result.sectionsExtracted.join(", ")}]`,
        );
      }
    },

    warning(message) {
      if (options.verbose) {
        console.warn(message);
      }
    },

    progress(stats) {
      if (!options.verbose && stats.parsed % 50 === 0) {
        process.stdout.write(`Processed ${stats.parsed}/${stats.total}...\r`);
      }
    },

    parseFinished(stats) {
      console.log(`\n✅ Parsed ${stats.parsed} substances\n`);
    },

    enrichmentStarted() {
      console.log("🔗 Enriching with TripSit combo interactions...");
    },

    enrichmentFinished(stats) {
      console.log(`   Substances enriched: ${stats.substancesEnriched}`);
      console.log(`   Interactions added: ${stats.interactionsAdded}`);
      console.log(`   Interactions overridden: ${stats.interactionsOverridden}`);
      console.log();
    },

    statisticsReady(stats, enrichmentStats) {
      if (!options.stats && !options.verbose) return;

      console.log("📊 Extraction Statistics:");
      console.log(`   Total substances: ${stats.parsed}`);
      console.log(
        `   With dosage data: ${stats.withDosage} (${formatPercentage(stats.withDosage, stats.parsed)}%)`,
      );
      console.log(
        `   With duration data: ${stats.withDuration} (${formatPercentage(stats.withDuration, stats.parsed)}%)`,
      );
      console.log(
        `   With effects: ${stats.withEffects} (${formatPercentage(stats.withEffects, stats.parsed)}%)`,
      );
      console.log(
        `   With chemistry: ${stats.withChemistry} (${formatPercentage(stats.withChemistry, stats.parsed)}%)`,
      );
      console.log(
        `   With interactions: ${stats.withInteractions} (${formatPercentage(stats.withInteractions, stats.parsed)}%) [after combos enrichment]`,
      );
      console.log(
        `   With legal status: ${stats.withLegal} (${formatPercentage(stats.withLegal, stats.parsed)}%)`,
      );
      console.log();

      if (Object.keys(enrichmentStats.categoriesMapped).length > 0) {
        console.log("🏷️  Category Mapping:");
        for (const [category, count] of Object.entries(enrichmentStats.categoriesMapped).sort(
          (left, right) => right[1] - left[1],
        )) {
          console.log(`   ${category}: ${count} substances`);
        }
        console.log();
      }
    },

    manualLegalPreserved(count) {
      if (count > 0) {
        console.log(`🔒 Preserved ${count} substances with manually edited legal data\n`);
      }
    },

    outputWritten(result) {
      const writeResult = result as ParseSourceCorpusWriteResult | undefined;
      console.log(`💾 Output written to: ${writeResult?.outputPath ?? options.output}`);
      if (writeResult?.lineageOutputPath) {
        console.log(`🧾 Lineage metadata written to: ${writeResult.lineageOutputPath}`);
      }
    },

    sampleOutput(slug, data) {
      if (options.substance && options.verbose) {
        console.log("\n📋 Sample Output:\n");
        console.log(JSON.stringify(data, null, 2));
      }
    },
  };
}

function createParseSourceCorpusCliOptions(options: CliOptions): ParseSourceCorpusOptions {
  return {
    substance: options.substance || undefined,
    catalog: createFileSystemSourceCatalog(SOURCES_DIR),
    parserRegistry: { getParser, resolveSource: resolveParserSource },
    enrichment: {
      enrich(substances) {
        return enrichWithCombos(substances, COMBOS_PATH);
      },
    },
    persistence: createFileSystemPersistence(options.output),
    reporter: createConsoleReporter(options),
  };
}

export async function runParseSourcesCli(
  args: string[] = process.argv.slice(2),
  invoke = parseSourceCorpus,
) {
  const options = parseCliOptions(args);

  await invoke(createParseSourceCorpusCliOptions(options));
}
