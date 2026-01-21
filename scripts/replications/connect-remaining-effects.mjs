#!/usr/bin/env node
/**
 * Connect remaining 11 effects to their replications with proper mappings.
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

// Load metadata
const { replications } = JSON.parse(fs.readFileSync(METADATA_FILE, 'utf-8'));

// Mapping: effect_slug_in_metadata -> convex_slug
const EFFECT_MAPPING = {
  'closed-eye-visuals': 'internal-hallucination',
  'color-modulation': 'colour-shifting',
  'external-hallucinations': 'external-hallucination',
  'hallucinatory-entities': 'autonomous-entity',
  'internal-hallucinations': 'internal-hallucination',
  'loss-of-contact-with-reality': 'derealization',
  'open-eye-visuals': 'environmental-patterning',
  'visual-distortions': 'perspective-distortion',
  'visual-geometry': 'geometry',
};

console.log('\n' + '='.repeat(60));
console.log('Connect Remaining Effects to Replications');
console.log('='.repeat(60) + '\n');

let updated = 0;
let failed = 0;
const failedEffects = [];

for (const [metadataSlug, convexSlug] of Object.entries(EFFECT_MAPPING)) {
  // Find all replications with this metadata slug
  const reps = replications.filter(r => r.effect_slug === metadataSlug);
  
  if (reps.length === 0) {
    console.log(`⏭️  ${metadataSlug}: No replications found`);
    continue;
  }

  const slugList = reps.map(r => r.slug);
  const timestamp = Date.now();
  const randomId = Math.random().toString(36).substring(7);
  const tempFile = path.join(os.tmpdir(), `convex-gallery-${timestamp}-${randomId}.json`);

  try {
    const args = JSON.stringify({
      slug: convexSlug,
      updates: {
        gallery_order: slugList,
      },
    });

    fs.writeFileSync(tempFile, args, 'utf-8');

    try {
      execSync(
        `cd "${PROJECT_DIR}" && npx convex run "subjectiveEffects:update" "$(cat ${tempFile})"`,
        { stdio: 'pipe', cwd: PROJECT_DIR }
      );
      updated++;
      console.log(`✓ ${metadataSlug} → ${convexSlug} (${slugList.length} replications)`);
    } catch (error) {
      failed++;
      failedEffects.push(metadataSlug);
      console.log(`✗ ${metadataSlug} → ${convexSlug}: Failed`);
    }
  } finally {
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
  }
}

console.log('\n' + '='.repeat(60));
console.log(`✓ Updated: ${updated} effects`);
if (failed > 0) {
  console.log(`✗ Failed: ${failed} effects`);
  if (failedEffects.length > 0) {
    console.log('\nFailed effects:');
    failedEffects.forEach(e => console.log(`  • ${e}`));
  }
}
console.log('='.repeat(60) + '\n');

if (failed === 0) {
  console.log('✅ All remaining effects connected! Galleries are ready.\n');
}

process.exit(failed > 0 ? 1 : 0);
