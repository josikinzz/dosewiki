#!/usr/bin/env node
/**
 * Direct import using Convex client library.
 * This connects directly to the Convex backend.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const dryRun = process.argv.includes('--dry-run');

// Load replications metadata
const METADATA_FILE = path.join(
  __dirname,
  '..',
  'notes-and-plans',
  'exports',
  'replications',
  'replications-metadata.json'
);
const { replications } = JSON.parse(fs.readFileSync(METADATA_FILE, 'utf-8'));

// Filter to imported replications only
const toImport = replications.filter(r => r.effect_slug);

console.log(`\n${'='.repeat(60)}`);
console.log('Direct Import to Convex');
console.log(`${'='.repeat(60)}\n`);

console.log(`Replications to import: ${toImport.length}`);
console.log(`  Videos: ${toImport.filter(r => r.type === 'video').length}`);
console.log(`  Images: ${toImport.filter(r => r.type === 'image').length}\n`);

if (dryRun) {
  console.log('Dry run - showing first 10:\n');
  toImport.slice(0, 10).forEach(rep => {
    console.log(`  ${rep.type === 'video' ? '🎬' : '🖼️ '} ${rep.slug.padEnd(45)} → ${rep.effect_slug}`);
  });
  if (toImport.length > 10) {
    console.log(`\n  ... and ${toImport.length - 10} more replications`);
  }
  console.log('\n✓ Run with --execute to import\n');
  process.exit(0);
}

// For actual import, we need to use Convex dev tools
console.log(`To import, you need to:

1. In one terminal, run Convex dev:
   npx convex dev

2. In another terminal, use npx convex to import:
   npx convex import convex/replications.bulkImport --data notes-and-plans/exports/replications/replications-metadata.json

3. Or use the Convex dashboard to create records manually.

For now, let's create a setup script that uses the Convex API properly.
`);
