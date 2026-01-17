#!/usr/bin/env node
/**
 * Create gallery_order arrays for subjective effects.
 *
 * This script:
 * 1. Queries the replications table via Convex
 * 2. Groups replications by effect_slug
 * 3. Updates each effect's gallery_order field
 *
 * Usage:
 *   npx convex dev  # In separate terminal
 *   node scripts/create-gallery-order.mjs --dry-run
 *   node scripts/create-gallery-order.mjs --execute
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const dryRun = process.argv.includes('--dry-run');
const execute = process.argv.includes('--execute');

if (!dryRun && !execute) {
  console.error('Usage: node create-gallery-order.mjs --dry-run|--execute');
  console.error('');
  console.error('Make sure to run: npx convex dev');
  process.exit(1);
}

const CONVEX_URL = 'http://localhost:3210';
const METADATA_FILE = path.join(__dirname, '..', 'replications-metadata.json');

/**
 * Call Convex query/mutation via HTTP
 */
async function callConvex(functionPath, args) {
  try {
    const response = await fetch(`${CONVEX_URL}/api/${functionPath}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`HTTP ${response.status}: ${error}`);
    }

    return await response.json();
  } catch (error) {
    throw error;
  }
}

/**
 * Main function
 */
async function createGalleryOrder() {
  console.log(`\n${'='.repeat(60)}`);
  console.log('Create Gallery Order for Effects');
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'EXECUTE'}`);
  console.log(`${'='.repeat(60)}\n`);

  // Load metadata to see what's imported
  if (!fs.existsSync(METADATA_FILE)) {
    console.error(`Error: Metadata file not found: ${METADATA_FILE}`);
    process.exit(1);
  }

  const { replications } = JSON.parse(fs.readFileSync(METADATA_FILE, 'utf-8'));

  // Filter to only imported replications
  const imported = replications.filter(r => r.effect_slug);

  // Group by effect
  const byEffect = {};
  for (const rep of imported) {
    if (!byEffect[rep.effect_slug]) {
      byEffect[rep.effect_slug] = [];
    }
    byEffect[rep.effect_slug].push(rep.slug);
  }

  const effects = Object.keys(byEffect).sort();

  console.log(`Found ${effects.length} effects with replications:`);
  console.log(`Total replications: ${imported.length}\n`);

  effects.forEach(effect => {
    const count = byEffect[effect].length;
    console.log(`  ${effect.padEnd(35)} (${count})`);
  });

  console.log('');

  if (dryRun) {
    console.log('[DRY RUN] Would update gallery_order for all effects above\n');
    console.log('Sample gallery_order for "breathing":');
    if (byEffect['breathing']) {
      console.log(JSON.stringify(byEffect['breathing'].slice(0, 3), null, 2));
    }
    console.log('\nRun with --execute to apply updates\n');
    return;
  }

  // Test Convex connection with retries
  console.log('Testing Convex connection...');
  let connected = false;
  for (let i = 0; i < 10; i++) {
    try {
      const response = await fetch(`${CONVEX_URL}/api/subjectiveEffects.getBySlug`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: 'breathing' }),
      });
      if (response.ok) {
        connected = true;
        break;
      }
    } catch (error) {
      // Keep trying
    }
    if (i < 9) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  if (!connected) {
    console.error('\n✗ Cannot connect to Convex dev server!');
    console.error('Make sure you have convex dev running:\n');
    console.error('  npx convex dev\n');
    process.exit(1);
  }
  console.log('✓ Convex dev server is running\n');

  console.log(`Starting to update ${effects.length} effects...\n`);

  let updated = 0;
  let failed = 0;
  const errors = [];

  for (const effect of effects) {
    const slugs = byEffect[effect];
    try {
      await callConvex('subjectiveEffects.update', {
        slug: effect,
        updates: {
          gallery_order: slugs,
        },
      });
      updated++;
      console.log(`✓ Updated ${effect} (${slugs.length} replications)`);
    } catch (error) {
      failed++;
      errors.push(`${effect}: ${error.message}`);
      console.log(`✗ Failed to update ${effect}: ${error.message}`);
    }
  }

  // Summary
  console.log(`\n${'='.repeat(60)}`);
  console.log('Update Summary');
  console.log(`${'='.repeat(60)}`);
  console.log(`✓ Updated: ${updated} effects`);
  if (failed > 0) {
    console.log(`✗ Failed: ${failed} effects`);
  }
  console.log(`Total: ${effects.length}`);

  if (errors.length > 0) {
    console.log('\nErrors:');
    errors.forEach(e => console.log(`  - ${e}`));
  }

  console.log(`\n${'='.repeat(60)}\n`);

  if (failed === 0) {
    console.log('✅ All effects updated with gallery order!\n');
    console.log('Gallery should now display on effect pages.\n');
  }
}

// Run
createGalleryOrder().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
