#!/usr/bin/env node
/**
 * Fix replication effect_slug values to match Convex effect slugs.
 * The replications were uploaded with old metadata effect_slug names,
 * but queries look for replications by the new Convex effect slugs.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import os from 'os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const METADATA_FILE = path.join(
  __dirname,
  '..',
  'notes-and-plans',
  'exports',
  'replications',
  'replications-metadata.json'
);
const PROJECT_DIR = path.join(__dirname, '../..');

// Mapping: old metadata effect_slug -> new Convex effect_slug
const EFFECT_SLUG_MAPPING = {
  'breathing': 'drifting',
  'melting': 'drifting',
  'flowing': 'drifting',
  'warping': 'drifting',
  'closed-eye-visuals': 'internal-hallucination',
  'color-modulation': 'colour-shifting',
  'external-hallucinations': 'external-hallucination',
  'hallucinatory-entities': 'autonomous-entity',
  'internal-hallucinations': 'internal-hallucination',
  'loss-of-contact-with-reality': 'derealization',
  'open-eye-visuals': 'environmental-patterning',
  'visual-distortions': 'perspective-distortion',
  'visual-drifting': 'drifting',
  'visual-geometry': 'geometry',
  'visual-acuity-enhancement': 'visual-acuity-enhancement',
  'recursion': 'recursion',
  'symmetrical-texture-repetition': 'symmetrical-texture-repetition',
  'tracers': 'tracers',
};

// Load metadata
const { replications } = JSON.parse(fs.readFileSync(METADATA_FILE, 'utf-8'));

console.log('\n' + '='.repeat(60));
console.log('Fix Replication Effect Slugs');
console.log('='.repeat(60) + '\n');

let updated = 0;
let skipped = 0;
let failed = 0;
const failedReps = [];

for (const rep of replications) {
  if (!rep.effect_slug) {
    skipped++;
    continue;
  }

  const newEffectSlug = EFFECT_SLUG_MAPPING[rep.effect_slug];
  if (!newEffectSlug) {
    skipped++;
    continue;
  }

  // If already correct, skip
  if (rep.effect_slug === newEffectSlug) {
    skipped++;
    continue;
  }

  const timestamp = Date.now();
  const randomId = Math.random().toString(36).substring(7);
  const tempFile = path.join(os.tmpdir(), `convex-update-slug-${timestamp}-${randomId}.json`);

  try {
    const args = JSON.stringify({
      slug: rep.slug,
      effect_slug: newEffectSlug,
    });

    fs.writeFileSync(tempFile, args, 'utf-8');

    try {
      execSync(
        `cd "${PROJECT_DIR}" && npx convex run "replications:updateEffectSlug" "$(cat ${tempFile})"`,
        { stdio: 'pipe', cwd: PROJECT_DIR }
      );
      updated++;
      if (updated % 10 === 0) {
        console.log(`✓ Updated ${updated} replications...`);
      }
    } catch (error) {
      failed++;
      failedReps.push(`${rep.slug}: ${error.message}`);
    }
  } finally {
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
  }
}

console.log('\n' + '='.repeat(60));
console.log(`✓ Updated: ${updated} replications`);
console.log(`⏭️  Skipped: ${skipped} replications`);
if (failed > 0) {
  console.log(`✗ Failed: ${failed} replications`);
  if (failedReps.length > 0) {
    console.log('\nFailed replications:');
    failedReps.slice(0, 10).forEach(r => console.log(`  • ${r}`));
    if (failedReps.length > 10) {
      console.log(`  ... and ${failedReps.length - 10} more`);
    }
  }
}
console.log('='.repeat(60) + '\n');

if (failed === 0) {
  console.log('✅ All replications updated! Galleries should now load.\n');
}

process.exit(failed > 0 ? 1 : 0);
