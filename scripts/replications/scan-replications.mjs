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
import { execSync } from 'child_process';

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
 * Effect mapping: Folder names to DoseWiki effect slugs
 */
const EFFECT_SLUG_MAP = {
  'breathing': 'breathing',
  'closed eye visuals': 'closed-eye-visuals',
  'color modulation': 'color-modulation',
  'external hallucinations': 'external-hallucinations',
  'geometry': 'visual-geometry',
  'hallucinatory entity': 'hallucinatory-entities',
  'internal hallucinations': 'internal-hallucinations',
  'loss of contact with reality': 'loss-of-contact-with-reality',
  'open eye visuals': 'open-eye-visuals',
  'symmetrical texture repetition': 'symmetrical-texture-repetition',
  'visual amplifications': 'visual-acuity-enhancement',
  'visual distortions': 'visual-distortions',
  'visual drifting': 'visual-drifting',
  'visual flowing': 'melting',
  'visual recursion': 'recursion',
  'visual trails': 'tracers',
};

/**
 * Parse filename to extract title and artist.
 */
function parseFilename(filename) {
  const nameWithoutExt = filename.replace(/\.(mp4|webm|mov|m4v|jpg|jpeg|png|webp|gif)$/i, '');

  let title, artist;
  if (nameWithoutExt.includes(' by ')) {
    [title, artist] = nameWithoutExt.split(' by ').map(s => s.trim());
  } else {
    title = nameWithoutExt;
    artist = 'Unknown';
  }

  return { title, artist };
}

/**
 * Generate a slug from title and artist.
 */
function generateSlug(title, artist) {
  const normalized = `${title}-${artist}`
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();

  return normalized;
}

/**
 * Get file info using ffprobe or identify.
 */
function getFileInfo(filePath, isVideo) {
  try {
    const stats = fs.statSync(filePath);
    const fileSize = stats.size;

    if (isVideo) {
      try {
        // Try to get video metadata using ffprobe
        const output = execSync(
          `ffprobe -v error -select_streams v:0 -show_entries stream=width,height,duration -show_entries format=duration -of csv=p=0 "${filePath}"`,
          { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }
        );
        const lines = output.trim().split('\n');
        if (lines.length >= 1) {
          const [width, height, duration] = lines[0].split(',').map(v => {
            const parsed = parseFloat(v);
            return isNaN(parsed) ? undefined : parsed;
          });

          return {
            width: width ? Math.round(width) : undefined,
            height: height ? Math.round(height) : undefined,
            duration: duration ? parseFloat(duration) : undefined,
            fileSize,
          };
        }
      } catch (error) {
        console.warn(`Warning: Could not get video metadata for ${path.basename(filePath)}`);
      }
    } else {
      // For images, try to get dimensions
      try {
        const output = execSync(
          `identify -format "%wx%h" "${filePath}"`,
          { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }
        );
        const [width, height] = output.trim().split('x').map(v => parseInt(v));
        return {
          width: isNaN(width) ? undefined : width,
          height: isNaN(height) ? undefined : height,
          fileSize,
        };
      } catch (error) {
        console.warn(`Warning: Could not get image dimensions for ${path.basename(filePath)}`);
        return { fileSize };
      }
    }

    return { fileSize };
  } catch (error) {
    console.warn(`Warning: Could not read file info for ${path.basename(filePath)}`);
    return {};
  }
}

/**
 * Main scan function.
 */
function scan() {
  console.log(`\n${'='.repeat(60)}`);
  console.log('Replication Metadata Scanner');
  console.log(`${'='.repeat(60)}\n`);

  const replications = [];
  const errors = [];

  // Scan videos in new folder
  console.log('Scanning videos...');
  for (const folder of fs.readdirSync(VIDEOS_NEW_DIR)) {
    const folderPath = path.join(VIDEOS_NEW_DIR, folder);
    if (!fs.statSync(folderPath).isDirectory()) continue;

    const effectSlug = EFFECT_SLUG_MAP[folder];
    if (!effectSlug) {
      console.warn(`⚠ Warning: No mapping found for effect folder: "${folder}"`);
      continue;
    }

    const files = fs.readdirSync(folderPath);
    for (const filename of files) {
      const ext = path.extname(filename).toLowerCase().slice(1);
      if (!['mp4', 'webm', 'mov', 'm4v'].includes(ext)) continue;

      const filePath = path.join(folderPath, filename);
      const { title, artist } = parseFilename(filename);
      const slug = generateSlug(title, artist);
      const fileInfo = getFileInfo(filePath, true);

      replications.push({
        slug,
        title,
        artist,
        type: 'video',
        effect_slug: effectSlug,
        folder_name: folder,
        filename,
        format: ext,
        ...fileInfo,
      });

      console.log(`  ✓ ${folder}/${filename}`);
    }
  }

  // Scan images folder
  console.log('\nScanning images...');
  const imageFiles = fs.readdirSync(IMAGES_DIR);
  for (const filename of imageFiles) {
    const ext = path.extname(filename).toLowerCase().slice(1);
    if (!['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)) continue;

    const filePath = path.join(IMAGES_DIR, filename);
    const { title, artist } = parseFilename(filename);
    const slug = generateSlug(title, artist);
    const fileInfo = getFileInfo(filePath, false);

    // Try to infer effect from filename or artist mentions
    // For images without folder structure, we'll need manual review
    replications.push({
      slug,
      title,
      artist,
      type: 'image',
      effect_slug: null, // To be filled manually
      folder_name: null,
      filename,
      format: ext,
      ...fileInfo,
    });

    console.log(`  ✓ ${filename}`);
  }

  // Write output file
  const output = {
    metadata: {
      generatedAt: new Date().toISOString(),
      totalReplications: replications.length,
      videoCount: replications.filter(r => r.type === 'video').length,
      imageCount: replications.filter(r => r.type === 'image').length,
      videosWithEffectMapping: replications.filter(r => r.type === 'video' && r.effect_slug).length,
      imagesNeedingManualMapping: replications.filter(r => r.type === 'image' && !r.effect_slug).length,
    },
    replications: replications.sort((a, b) => a.slug.localeCompare(b.slug)),
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
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
    replications
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
