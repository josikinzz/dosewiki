#!/usr/bin/env node
/**
 * Update gallery_order for all effects using npx convex run.
 * Run this from the project root with convex dev running.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import os from 'os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const METADATA_FILE = path.join(__dirname, '..', 'replications-metadata.json');

// Load metadata
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

console.log(`\n${'='.repeat(60)}`);
console.log('Update Gallery Order');
console.log(`${'='.repeat(60)}\n`);
console.log(`Updating gallery_order for ${effects.length} effects...\n`);

let updated = 0;
let failed = 0;

for (const effect of effects) {
  const slugs = byEffect[effect];

  const tempFile = path.join(os.tmpdir(), `convex-gallery-${Date.now()}.json`);
  try {
    const args = JSON.stringify({
      slug: effect,
      updates: {
        gallery_order: slugs,
      },
    });

    // Write args to temp file to avoid shell injection
    fs.writeFileSync(tempFile, args, 'utf-8');

    execSync(
      `npx convex run subjectiveEffects.update "$(cat ${tempFile})"`,
      { stdio: 'pipe', cwd: path.join(__dirname, '..') }
    );

    updated++;
    console.log(`✓ ${effect} (${slugs.length} replications)`);
  } catch (error) {
    failed++;
    console.log(`✗ ${effect}: Failed`);
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
}
console.log(`${'='.repeat(60)}\n`);

if (failed === 0) {
  console.log('✅ All effects updated! Galleries are ready to go.\n');
}
