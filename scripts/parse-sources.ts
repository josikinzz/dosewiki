#!/usr/bin/env npx tsx

/**
 * Parse Sources Script
 *
 * Parses all article source files and generates a structured JSON output
 * containing extracted dosage, duration, effects, chemistry, and other data.
 *
 * Usage:
 *   npx tsx scripts/parse-sources.ts [options]
 *
 * Options:
 *   --substance <slug>   Parse only a specific substance
 *   --output <path>      Output file path (default: src/data/parsed-sources.json)
 *   --verbose            Show detailed parsing output
 *   --stats              Show extraction statistics
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

import {
  parseSource,
  aggregateResults,
  createParsedOutput,
  enrichWithCombos,
  ParsedSubstanceData,
  ParserResult,
} from "./parsers/index";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const SOURCES_DIR = path.join(__dirname, "../src/data/article-sources");
const DEFAULT_OUTPUT = path.join(__dirname, "../src/data/parsed-sources.json");
const COMBOS_PATH = path.join(__dirname, "../src/data/tripsit-combos.json");

// CLI argument parsing
const args = process.argv.slice(2);
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

interface SourceInfo {
  id: string;
  fileName: string;
  displayName: string;
  size: number;
  tokens: number;
}

interface SubstanceModule {
  substanceName: string;
  sources: SourceInfo[];
  contents: Record<string, string>;
}

/**
 * Get all substance file paths from the sources directory
 */
function getSubstanceFiles(): string[] {
  const files = fs.readdirSync(SOURCES_DIR);
  return files
    .filter((f) => f.endsWith(".ts") && f !== "index.ts")
    .map((f) => path.join(SOURCES_DIR, f));
}

/**
 * Dynamic import of a substance module
 */
async function loadSubstanceModule(filePath: string): Promise<SubstanceModule | null> {
  try {
    const module = await import(filePath);
    return {
      substanceName: module.substanceName,
      sources: module.sources,
      contents: module.contents,
    };
  } catch (error) {
    console.error(`Error loading ${filePath}:`, error);
    return null;
  }
}

/**
 * Extract slug from file path
 */
function getSlugFromPath(filePath: string): string {
  return path.basename(filePath, ".ts");
}

/**
 * Parse a single substance
 */
function parseSubstance(
  slug: string,
  module: SubstanceModule,
  verbose: boolean
): ParsedSubstanceData {
  const results: Array<{
    sourceId: string;
    displayName: string;
    result: ParserResult;
    tokens: number;
  }> = [];

  for (const source of module.sources) {
    const content = module.contents[source.id];
    if (!content) continue;

    const result = parseSource(source.id, content, module.substanceName);
    if (result) {
      results.push({
        sourceId: source.id,
        displayName: source.displayName,
        result,
        tokens: source.tokens,
      });

      if (verbose) {
        console.log(
          `  ${source.displayName}: extracted [${result.sectionsExtracted.join(", ")}]`
        );
      }
    }
  }

  return aggregateResults(slug, module.substanceName, results);
}

/**
 * Main execution
 */
async function main() {
  console.log("🔬 Source Parser - Extracting structured data from article sources\n");

  const substanceFiles = getSubstanceFiles();
  console.log(`Found ${substanceFiles.length} substance files\n`);

  const substances: Record<string, ParsedSubstanceData> = {};
  const stats = {
    total: 0,
    parsed: 0,
    withDosage: 0,
    withDuration: 0,
    withEffects: 0,
    withChemistry: 0,
    withInteractions: 0,
    withLegal: 0,
  };

  // Filter to specific substance if requested
  const filesToProcess = options.substance
    ? substanceFiles.filter((f) => getSlugFromPath(f) === options.substance)
    : substanceFiles;

  if (options.substance && filesToProcess.length === 0) {
    console.error(`Substance "${options.substance}" not found`);
    process.exit(1);
  }

  for (const filePath of filesToProcess) {
    const slug = getSlugFromPath(filePath);
    stats.total++;

    if (options.verbose) {
      console.log(`Processing: ${slug}`);
    }

    const module = await loadSubstanceModule(filePath);
    if (!module) continue;

    const parsed = parseSubstance(slug, module, options.verbose);
    substances[slug] = parsed;
    stats.parsed++;

    // Collect stats
    if (parsed.dosage.length > 0) stats.withDosage++;
    if (parsed.duration.length > 0) stats.withDuration++;
    if (parsed.effects.length > 0) stats.withEffects++;
    if (parsed.chemistry) stats.withChemistry++;
    if (parsed.interactions.length > 0) stats.withInteractions++;
    if (parsed.legal.length > 0) stats.withLegal++;

    // Progress indicator
    if (!options.verbose && stats.parsed % 50 === 0) {
      process.stdout.write(`Processed ${stats.parsed}/${stats.total}...\r`);
    }
  }

  console.log(`\n✅ Parsed ${stats.parsed} substances\n`);

  // Enrich with TripSit combos data
  console.log("🔗 Enriching with TripSit combo interactions...");
  const combosStats = enrichWithCombos(substances, COMBOS_PATH);
  console.log(`   Substances enriched: ${combosStats.substancesEnriched}`);
  console.log(`   Interactions added: ${combosStats.interactionsAdded}`);
  console.log(`   Interactions overridden: ${combosStats.interactionsOverridden}`);
  console.log();

  // Recalculate interaction stats after enrichment
  let withInteractionsAfter = 0;
  for (const data of Object.values(substances)) {
    if (data.interactions.length > 0) withInteractionsAfter++;
  }
  stats.withInteractions = withInteractionsAfter;

  // Show statistics
  if (options.stats || options.verbose) {
    console.log("📊 Extraction Statistics:");
    console.log(`   Total substances: ${stats.parsed}`);
    console.log(`   With dosage data: ${stats.withDosage} (${((stats.withDosage / stats.parsed) * 100).toFixed(1)}%)`);
    console.log(`   With duration data: ${stats.withDuration} (${((stats.withDuration / stats.parsed) * 100).toFixed(1)}%)`);
    console.log(`   With effects: ${stats.withEffects} (${((stats.withEffects / stats.parsed) * 100).toFixed(1)}%)`);
    console.log(`   With chemistry: ${stats.withChemistry} (${((stats.withChemistry / stats.parsed) * 100).toFixed(1)}%)`);
    console.log(`   With interactions: ${stats.withInteractions} (${((stats.withInteractions / stats.parsed) * 100).toFixed(1)}%) [after combos enrichment]`);
    console.log(`   With legal status: ${stats.withLegal} (${((stats.withLegal / stats.parsed) * 100).toFixed(1)}%)`);
    console.log();

    // Show category mapping stats
    if (Object.keys(combosStats.categoriesMapped).length > 0) {
      console.log("🏷️  Category Mapping:");
      for (const [category, count] of Object.entries(combosStats.categoriesMapped).sort((a, b) => b[1] - a[1])) {
        console.log(`   ${category}: ${count} substances`);
      }
      console.log();
    }
  }

  // Create output
  const output = createParsedOutput(substances);

  // Write to file
  const outputPath = options.output;
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`💾 Output written to: ${outputPath}`);

  // Show sample output for single substance
  if (options.substance && options.verbose) {
    console.log("\n📋 Sample Output:\n");
    console.log(JSON.stringify(substances[options.substance], null, 2));
  }
}

main().catch(console.error);
