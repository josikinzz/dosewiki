#!/usr/bin/env node
/**
 * Import replications into Convex database.
 *
 * This script:
 * 1. Reads metadata from replications-metadata.json
 * 2. For each replication, uploads the file to Convex storage
 * 3. Inserts metadata into the replications table
 *
 * Prerequisites:
 * - npx convex dev must be running in another terminal
 * - Convex schema must be deployed
 *
 * Usage:
 *   node scripts/import-replications.mjs --dry-run
 *   node scripts/import-replications.mjs --execute [--skip-videos] [--skip-images]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
// Built-in fetch in Node 18+

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const dryRun = process.argv.includes('--dry-run');
const execute = process.argv.includes('--execute');
const skipVideos = process.argv.includes('--skip-videos');
const skipImages = process.argv.includes('--skip-images');

if (!dryRun && !execute) {
  console.error('Usage: node import-replications.mjs --dry-run|--execute [--skip-videos] [--skip-images]');
  process.exit(1);
}

// Paths
const REPLICATIONS_DIR = '/Users/josie/Documents/Utilities/unified osmanthus app/replications';
const VIDEOS_NEW_DIR = path.join(REPLICATIONS_DIR, 'videos', 'new');
const IMAGES_DIR = path.join(REPLICATIONS_DIR, 'images');
const METADATA_FILE = path.join(__dirname, '..', 'replications-metadata.json');
const CONVEX_URL = 'http://localhost:3210';

// Load metadata
if (!fs.existsSync(METADATA_FILE)) {
  console.error(`Error: Metadata file not found: ${METADATA_FILE}`);
  console.error('Run: node scripts/scan-replications.mjs');
  process.exit(1);
}

const { replications } = JSON.parse(fs.readFileSync(METADATA_FILE, 'utf-8'));

/**
 * Generate upload URL from Convex.
 */
async function generateUploadUrl() {
  try {
    const response = await fetch(`${CONVEX_URL}/api/replications.generateUploadUrl`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error generating upload URL:', error);
    return null;
  }
}

/**
 * Upload file to Convex storage.
 */
async function uploadFile(filePath, filename) {
  try {
    // Generate upload URL
    const uploadUrl = await generateUploadUrl();
    if (!uploadUrl) {
      throw new Error('Failed to get upload URL');
    }

    // Read file
    const fileBuffer = fs.readFileSync(filePath);

    // Upload to URL
    const response = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
      },
      body: fileBuffer,
    });

    if (!response.ok) {
      throw new Error(`Upload failed: HTTP ${response.status}`);
    }

    const result = await response.json();
    return result.storageId;
  } catch (error) {
    console.error(`Error uploading ${filename}:`, error.message);
    return null;
  }
}

/**
 * Insert replication into Convex.
 */
async function insertReplication(repData, storageId) {
  try {
    const response = await fetch(`${CONVEX_URL}/api/replications.insertReplication`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...repData,
        storage_id: storageId,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return true;
  } catch (error) {
    console.error('Error inserting replication:', error);
    return false;
  }
}

/**
 * Find file path.
 */
function findFile(rep) {
  if (rep.type === 'video') {
    // Videos are in subfolders
    const folderPath = path.join(VIDEOS_NEW_DIR, rep.folder_name);
    return path.join(folderPath, rep.filename);
  } else {
    // Images are in root folder
    return path.join(IMAGES_DIR, rep.filename);
  }
}

/**
 * Main import function.
 */
async function importReplications() {
  console.log(`\n${'='.repeat(60)}`);
  console.log('Replication Import');
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'EXECUTE'}`);
  if (skipVideos) console.log('Skip Videos: YES');
  if (skipImages) console.log('Skip Images: YES');
  console.log(`${'='.repeat(60)}\n`);

  // Filter replications
  let toImport = replications.filter(r => {
    if (skipVideos && r.type === 'video') return false;
    if (skipImages && r.type === 'image') return false;
    // Skip images without effect_slug
    if (r.type === 'image' && !r.effect_slug) return false;
    return true;
  });

  console.log(`Total to import: ${toImport.length}`);
  console.log(`  Videos: ${toImport.filter(r => r.type === 'video').length}`);
  console.log(`  Images: ${toImport.filter(r => r.type === 'image').length}\n`);

  if (dryRun) {
    console.log('DRY RUN: Showing what would be imported:\n');
    toImport.slice(0, 10).forEach(rep => {
      const filePath = findFile(rep);
      const exists = fs.existsSync(filePath);
      console.log(
        `${exists ? '✓' : '✗'} ${rep.slug} (${rep.type}) → ${rep.effect_slug || 'NO EFFECT'}`
      );
    });
    if (toImport.length > 10) {
      console.log(`... and ${toImport.length - 10} more\n`);
    }
    console.log('[DRY RUN] No files were uploaded.');
    return;
  }

  console.log('Starting import... Make sure convex dev is running!\n');

  let imported = 0;
  let failed = 0;
  const errors = [];

  for (let i = 0; i < toImport.length; i++) {
    const rep = toImport[i];
    const filePath = findFile(rep);

    if (!fs.existsSync(filePath)) {
      console.log(`✗ File not found: ${rep.filename}`);
      failed++;
      errors.push(`File not found: ${rep.filename}`);
      continue;
    }

    console.log(`[${i + 1}/${toImport.length}] Uploading ${rep.slug}...`);

    const storageId = await uploadFile(filePath, rep.filename);
    if (!storageId) {
      failed++;
      errors.push(`Upload failed: ${rep.filename}`);
      continue;
    }

    const success = await insertReplication(rep, storageId);
    if (!success) {
      failed++;
      errors.push(`Insert failed: ${rep.filename}`);
      continue;
    }

    imported++;
    console.log(`  ✓ Imported`);
  }

  // Summary
  console.log(`\n${'='.repeat(60)}`);
  console.log('Import Complete');
  console.log(`${'='.repeat(60)}`);
  console.log(`Imported: ${imported}`);
  console.log(`Failed: ${failed}`);

  if (errors.length > 0) {
    console.log('\nErrors:');
    errors.forEach(e => console.log(`  - ${e}`));
  }

  console.log(`\n${'='.repeat(60)}\n`);
}

// Run import
importReplications().catch(error => {
  console.error('Import error:', error);
  process.exit(1);
});
