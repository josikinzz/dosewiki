#!/usr/bin/env node
/**
 * Connect replications to effect galleries.
 * Groups replications by effect_slug and updates the gallery_order field.
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

// Filter to only imported replications (those with effect_slug)
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

console.log(`\n${'='.repeat(60)}`);
console.log('Connect Replications to Effect Galleries');
console.log(`${'='.repeat(60)}\n`);
console.log(`Connecting ${effects.length} effects with replications...\n`);

let updated = 0;
let failed = 0;
const failedEffects = [];

for (const effect of effects) {
  const slugs = byEffect[effect];
  const tempFile = path.join(os.tmpdir(), `convex-gallery-${Date.now()}-${Math.random()}.json`);
  
  try {
    const args = JSON.stringify({
      slug: effect,
      updates: {
        gallery_order: slugs,
      },
    });

    // Write args to temp file to avoid shell injection
    fs.writeFileSync(tempFile, args, 'utf-8');

    try {
      execSync(
        `cd "${PROJECT_DIR}" && npx convex run "subjectiveEffects:update" "$(cat ${tempFile})"`,
        { stdio: 'pipe', cwd: PROJECT_DIR }
      );
      updated++;
      console.log(`✓ ${effect} (${slugs.length} replications)`);
    } catch (error) {
      failed++;
      failedEffects.push(effect);
      console.log(`✗ ${effect}: Failed`);
    }
  } finally {
    // Clean up temp file
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
  }
}

console.log(`\n${'='.repeat(60)}`);
console.log(`✓ Updated: ${updated} effects`);
if (failed > 0) {
  console.log(`✗ Failed: ${failed} effects`);
  if (failedEffects.length > 0) {
    console.log('\nFailed effects:');
    failedEffects.forEach(e => console.log(`  • ${e}`));
  }
}
console.log(`${'='.repeat(60)}\n`);

if (failed === 0) {
  console.log('✅ All replications connected! Galleries are ready to display.\n');
}

process.exit(failed > 0 ? 1 : 0);
