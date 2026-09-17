#!/usr/bin/env node
/**
 * Reorder fields in a local substance export to match the canonical order defined in the Zod schema.
 *
 * Usage:
 *   node scripts/data/reorder-fields.mjs --input <local-substance-export.json>
 *   node scripts/data/reorder-fields.mjs --input <local-substance-export.json> --dry-run
 *   node scripts/data/reorder-fields.mjs --input <local-substance-export.json> --verbose
 *
 * The input is a local Postgres export (scripts/data-ops/export-data-to-json.mjs);
 * it is never the tracked public/SubstanceIndex.json archive.
 */

import fs from 'fs';
import path from 'path';

import { reorderArticles, validateReordering } from './reorder-fields/index.mjs';

function parseArgs(argv) {
  const args = argv.slice(2);
  const inputIndex = args.indexOf('--input');
  if (inputIndex < 0 || !args[inputIndex + 1]) {
    throw new Error('Pass --input <path> naming the local substance export to reorder.');
  }
  return {
    articlesPath: path.resolve(args[inputIndex + 1]),
    dryRun: args.includes('--dry-run'),
    verbose: args.includes('--verbose'),
  };
}

function readArticles(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Substance export not found at ${filePath}`);
  }

  const raw = fs.readFileSync(filePath, 'utf8');
  const articles = JSON.parse(raw);

  if (!Array.isArray(articles)) {
    throw new Error('Substance export must be an array');
  }

  return articles;
}

function writeBackup(filePath) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const backupPath = filePath.replace('.json', `.backup.${timestamp}.json`);
  fs.copyFileSync(filePath, backupPath);
  return backupPath;
}

function printValidation(validation, verbose) {
  if (verbose) {
    console.log(`Before: ${validation.beforeCount} primitive values, hash: ${validation.beforeHash}`);
    console.log(`After: ${validation.afterCount} primitive values, hash: ${validation.afterHash}`);
  }

  if (!validation.primitiveCountMatches) {
    throw new Error(
      `Primitive count mismatch! Before: ${validation.beforeCount}, After: ${validation.afterCount}`,
    );
  }

  if (!validation.contentHashMatches) {
    throw new Error(
      `Content hash mismatch! Before: ${validation.beforeHash}, After: ${validation.afterHash}`,
    );
  }

  console.log('\nValidation passed: no data loss detected');
}

function main() {
  const { articlesPath, dryRun, verbose } = parseArgs(process.argv);

  console.log(`Reordering ${articlesPath} fields to canonical order...\n`);

  const articles = readArticles(articlesPath);
  console.log(`Found ${articles.length} articles`);

  const ordered = reorderArticles(articles, { verbose, logger: console });
  const validation = validateReordering(articles, ordered);

  printValidation(validation, verbose);

  if (dryRun) {
    console.log('\n[DRY RUN] Would write reordered articles to:', articlesPath);
    if (ordered.length > 0) {
      console.log('\nSample reordered article top-level fields:');
      console.log('  ' + Object.keys(ordered[0]).join(', '));
    }
    console.log('\nRun without --dry-run to apply changes.');
    return;
  }

  const backupPath = writeBackup(articlesPath);
  console.log(`\nCreated backup: ${path.basename(backupPath)}`);

  fs.writeFileSync(articlesPath, JSON.stringify(ordered, null, 2) + '\n');
  console.log(`Wrote reordered articles to: ${path.basename(articlesPath)}`);

  console.log('\n✓ Reordering complete');
  console.log('\nNext steps:');
  console.log('  1. Run: npm run dev');
  console.log('  2. Verify articles render correctly');
}

try {
  main();
} catch (error) {
  console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
