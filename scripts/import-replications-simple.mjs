#!/usr/bin/env node
/**
 * Simple replication import using metadata-only approach.
 * Files can be uploaded separately or referenced from original locations.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const METADATA_FILE = path.join(__dirname, '..', 'replications-metadata.json');
const dryRun = process.argv.includes('--dry-run');

if (!fs.existsSync(METADATA_FILE)) {
  console.error(`Metadata file not found: ${METADATA_FILE}`);
  process.exit(1);
}

const { replications } = JSON.parse(fs.readFileSync(METADATA_FILE, 'utf-8'));

// Filter for videos with effect slugs
const toImport = replications.filter(r => 
  r.type === 'video' && r.effect_slug
);

console.log(`\nReplications to import: ${toImport.length}`);
console.log(`  Videos with effect: ${toImport.filter(r => r.type === 'video').length}`);
console.log();

if (dryRun) {
  console.log('Sample data (first 5):\n');
  toImport.slice(0, 5).forEach(r => {
    console.log(`  ${r.slug}`);
    console.log(`    - Title: ${r.title}`);
    console.log(`    - Artist: ${r.artist}`);
    console.log(`    - Effect: ${r.effect_slug}`);
    console.log(`    - Duration: ${r.duration}s\n`);
  });
  console.log(`[DRY RUN] ${toImport.length} replications ready to import\n`);
  process.exit(0);
}

// Transform for Convex import (with placeholder storage IDs)
const forConvex = toImport.map((r, idx) => ({
  slug: r.slug,
  title: r.title,
  artist: r.artist || 'Unknown',
  artist_url: undefined,
  type: r.type,
  storage_id: `placeholder_${idx}_${Date.now()}`,
  effect_slug: r.effect_slug,
  thumbnail_storage_id: undefined,
  width: r.width,
  height: r.height,
  format: r.format,
  file_size: r.file_size,
  duration: r.duration,
}));

// Write to a file that can be imported
const importFile = path.join(__dirname, '..', 'replications-import.jsonl');
forConvex.forEach(rep => {
  fs.appendFileSync(importFile, JSON.stringify(rep) + '\n');
});

console.log(`✓ Written ${forConvex.length} replications to ${importFile}`);
console.log('\nNext steps:');
console.log('  1. Review the JSONL file: replications-import.jsonl');
console.log('  2. Upload files to Convex storage separately');
console.log('  3. Use Convex dashboard to update storage_ids\n');
