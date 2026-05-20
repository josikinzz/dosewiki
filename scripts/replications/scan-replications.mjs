#!/usr/bin/env node
/**
 * Scan replications folder and generate metadata JSON.
 *
 * This script:
 * 1. Traverses videos/new and images folders
 * 2. Extracts metadata from folder names (effect) and filenames (title, artist)
 * 3. Generates notes-and-plans/exports/replications/replications-metadata.json
 *
 * Usage:
 *   node scripts/scan-replications.mjs
 *
 * Output:
 *   notes-and-plans/exports/replications/replications-metadata.json - JSON file with all replication metadata
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  DEFAULT_EFFECT_FOLDER_SLUGS,
  getReplicationFileInfo,
  scanSourceMedia,
} from './lib/workspace.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Paths to source files
const REPLICATIONS_DIR = '/Users/josie/Documents/Utilities/unified osmanthus app/replications';
const VIDEOS_NEW_DIR = path.join(REPLICATIONS_DIR, 'videos', 'new');
const IMAGES_DIR = path.join(REPLICATIONS_DIR, 'images');
const OUTPUT_FILE = path.join(
  __dirname,
  '..',
  'notes-and-plans',
  'exports',
  'replications',
  'replications-metadata.json'
);

/**
 * Main scan function.
 */
function scan() {
  console.log(`\n${'='.repeat(60)}`);
  console.log('Replication Metadata Scanner');
  console.log(`${'='.repeat(60)}\n`);

  console.log('Scanning videos...');
  const output = scanSourceMedia({
    videosDir: VIDEOS_NEW_DIR,
    imagesDir: IMAGES_DIR,
    effectSlugMap: DEFAULT_EFFECT_FOLDER_SLUGS,
    getFileInfo: getReplicationFileInfo,
  });

  for (const warning of output.warnings) {
    console.warn(`⚠ Warning: ${warning}`);
  }

  for (const replication of output.replications.filter((replication) => replication.type === 'video')) {
    console.log(`  ✓ ${replication.folder_name}/${replication.filename}`);
  }

  console.log('\nScanning images...');
  for (const replication of output.replications.filter((replication) => replication.type === 'image')) {
    console.log(`  ✓ ${replication.filename}`);
  }

  // Write output file
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify({
    metadata: output.metadata,
    replications: output.replications,
  }, null, 2));
  console.log(`\n✓ Wrote metadata to ${OUTPUT_FILE}`);

  // Summary
  console.log(`\n${'='.repeat(60)}`);
  console.log('Summary');
  console.log(`${'='.repeat(60)}`);
  console.log(`Total replications: ${output.metadata.totalReplications}`);
  console.log(`  Videos: ${output.metadata.videoCount}`);
  console.log(`  Images: ${output.metadata.imageCount}`);
  console.log(`\nVideos with effect mapping: ${output.metadata.videosWithEffectMapping}`);
  console.log(`Images needing manual mapping: ${output.metadata.imagesNeedingManualMapping}`);

  // Show images that need manual mapping
  if (output.metadata.imagesNeedingManualMapping > 0) {
    console.log('\nImages requiring manual effect assignment:');
    output.replications
      .filter(r => r.type === 'image' && !r.effect_slug)
      .slice(0, 10)
      .forEach(r => {
        console.log(`  - ${r.filename} (by ${r.artist})`);
      });
    if (output.metadata.imagesNeedingManualMapping > 10) {
      console.log(`  ... and ${output.metadata.imagesNeedingManualMapping - 10} more`);
    }
  }

  console.log(`\n${'='.repeat(60)}\n`);
}

// Run scan
scan();
