#!/usr/bin/env node
/**
 * Import replications to Convex database.
 *
 * This script imports replications directly to Convex without file uploads
 * (assumes files will be referenced by path in metadata).
 *
 * Prerequisites:
 * - convex dev must be running
 * - Replications schema deployed
 *
 * Usage:
 *   npx convex dev  # In separate terminal
 *   node scripts/import-to-convex.mjs --dry-run
 *   node scripts/import-to-convex.mjs --execute
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  assertDataOpsWriteAllowed,
  createDataOpsRunContext,
  printDataOpsRunContext,
  requireTargetUrl,
} from '../lib/data-ops-run-context.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const dryRun = process.argv.includes('--dry-run');
const execute = process.argv.includes('--execute');
const skipVideos = process.argv.includes('--skip-videos');
const skipImages = process.argv.includes('--skip-images');

if (!dryRun && !execute) {
  console.error('Usage: node import-to-convex.mjs --dry-run|--execute [--skip-videos] [--skip-images]');
  console.error('');
  console.error('Make sure to run: npx convex dev');
  process.exit(1);
}

const runContext = createDataOpsRunContext({
  operation: 'import replications to Convex',
  intent: 'dev-convex-import',
  sourceUrlKeys: [],
  requiresExecute: true,
  defaultTargetUrl: 'http://localhost:3210',
  allowLocalTarget: true,
});
const CONVEX_URL = requireTargetUrl(runContext);

// Paths
const METADATA_FILE = path.join(
  __dirname,
  '..',
  'notes-and-plans',
  'exports',
  'replications',
  'replications-metadata.json'
);

/**
 * Call Convex mutation via HTTP
 */
async function callConvexMutation(functionPath, args) {
  const response = await fetch(`${CONVEX_URL}/api/${functionPath}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`HTTP ${response.status}: ${error}`);
  }

  return response.json();
}

/**
 * Main import function
 */
async function importReplications() {
  console.log(`\n${'='.repeat(60)}`);
  console.log('Import Replications to Convex');
  printDataOpsRunContext(runContext);
  if (skipVideos) console.log('Skip Videos: YES');
  if (skipImages) console.log('Skip Images: YES');
  console.log(`${'='.repeat(60)}\n`);

  // Load metadata
  if (!fs.existsSync(METADATA_FILE)) {
    console.error(`Error: Metadata file not found: ${METADATA_FILE}`);
    console.error(`Run: node scripts/scan-replications.mjs`);
    process.exit(1);
  }

  const { replications } = JSON.parse(fs.readFileSync(METADATA_FILE, 'utf-8'));

  // Filter replications
  let toImport = replications.filter(r => {
    if (skipVideos && r.type === 'video') return false;
    if (skipImages && r.type === 'image') return false;
    // Skip images without effect_slug
    if (r.type === 'image' && !r.effect_slug) return false;
    return true;
  });

  console.log(`Replications to import: ${toImport.length}`);
  console.log(`  Videos: ${toImport.filter(r => r.type === 'video').length}`);
  console.log(`  Images: ${toImport.filter(r => r.type === 'image').length}\n`);

  if (dryRun) {
    console.log('Dry run - showing first 10:\n');
    toImport.slice(0, 10).forEach(rep => {
      console.log(
        `  ${rep.type === 'video' ? '🎬' : '🖼️ '} ${rep.slug.padEnd(45)} → ${rep.effect_slug}`
      );
    });
    if (toImport.length > 10) {
      console.log(`\n  ... and ${toImport.length - 10} more replications`);
    }
    console.log('\n[DRY RUN] No data was imported. Run with --execute to proceed.\n');
    return;
  }

  try {
    assertDataOpsWriteAllowed(runContext);
  } catch (error) {
    console.error(`\n✗ ${error.message}`);
    process.exit(1);
  }

  // Check Convex connection
  console.log('Testing Convex connection...');
  try {
    await fetch(`${CONVEX_URL}/_health`);
    console.log('✓ Convex dev server is running\n');
  } catch {
    console.error('\n✗ Cannot connect to Convex dev server!');
    console.error('Make sure you have convex dev running in another terminal:');
    console.error('\n  npx convex dev\n');
    process.exit(1);
  }

  console.log('Starting bulk import...\n');

  let imported = 0;
  let failed = 0;
  const errors = [];

  try {
    // Use bulk import mutation
    const result = await callConvexMutation('replications.bulkImport', {
      replications: toImport,
    });

    imported = result.created;
    failed = result.errors.length;
    errors.push(...result.errors);

    console.log(`✓ Bulk import complete\n`);
  } catch (error) {
    console.error(`✗ Bulk import failed: ${error.message}\n`);
    process.exit(1);
  }

  // Summary
  console.log(`${'='.repeat(60)}`);
  console.log('Import Summary');
  console.log(`${'='.repeat(60)}`);
  console.log(`✓ Created: ${imported}`);
  if (failed > 0) {
    console.log(`✗ Errors: ${failed}`);
  }
  console.log(`Total: ${toImport.length}`);

  if (errors.length > 0) {
    console.log('\nErrors:');
    errors.slice(0, 10).forEach(e => console.log(`  - ${e}`));
    if (errors.length > 10) {
      console.log(`  ... and ${errors.length - 10} more`);
    }
  }

  console.log(`\n${'='.repeat(60)}\n`);

  if (failed === 0) {
    console.log('✅ All replications imported successfully!\n');
    console.log('Next: Create gallery_order arrays in effect articles');
    console.log('Run: node scripts/create-gallery-order.mjs\n');
  }
}

// Run
importReplications().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
