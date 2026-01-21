#!/usr/bin/env node
/**
 * Set gallery order for effects using Convex npm package.
 *
 * This is a simpler approach that doesn't require HTTP server checks.
 * Usage:
 *   npx convex run scripts/set-gallery-order.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const METADATA_FILE = path.join(
  __dirname,
  '..',
  'notes-and-plans',
  'exports',
  'replications',
  'replications-metadata.json'
);

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

// Export for use with convex run
export default async function setGalleryOrder(ctx) {
  const effects = Object.keys(byEffect).sort();

  console.log(`Setting gallery_order for ${effects.length} effects...`);

  let updated = 0;
  let failed = 0;

  for (const effect of effects) {
    const slugs = byEffect[effect];
    try {
      await ctx.runMutation('subjectiveEffects.update', {
        slug: effect,
        updates: {
          gallery_order: slugs,
        },
      });
      updated++;
      console.log(`✓ ${effect} (${slugs.length} replications)`);
    } catch (error) {
      failed++;
      console.log(`✗ ${effect}: ${error.message}`);
    }
  }

  console.log(`\nUpdated: ${updated} effects`);
  if (failed > 0) {
    console.log(`Failed: ${failed} effects`);
  }
}
