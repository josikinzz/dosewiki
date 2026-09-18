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

import { runParseSourcesCli } from "./parse-sources-cli";
import { ParseSourceCorpusError } from "./parsers/index";

runParseSourcesCli().catch((error: unknown) => {
  if (error instanceof ParseSourceCorpusError && error.code === "SUBSTANCE_NOT_FOUND") {
    console.error(error.message);
  } else {
    console.error(error);
  }
  process.exitCode = 1;
});
