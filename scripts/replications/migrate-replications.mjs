#!/usr/bin/env node
/**
 * Migration script for importing replications (videos and images) into Convex.
 *
 * Sources:
 * - Videos: /path/to/unified osmanthus app/replications/videos/new/[effect-folder]/
 * - Images: /path/to/unified osmanthus app/replications/images/
 *
 * The script:
 * 1. Reads metadata from esei-replications-index.json
 * 2. Extracts file metadata (dimensions, duration, file size)
 * 3. Uploads files to Convex storage
 * 4. Inserts replication records into Convex
 *
 * Usage:
 *   node scripts/migrate-replications.mjs --dry-run
 *   node scripts/migrate-replications.mjs --execute
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from 'convex/server';
import sharp from 'sharp';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from '@ffmpeg-installer/ffmpeg';
import { withDefaultReplicationRights } from './lib/workspace.mjs';

ffmpeg.setFfmpegPath(ffmpegStatic.path);

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const dryRun = process.argv.includes('--dry-run');
const execute = process.argv.includes('--execute');

if (!dryRun && !execute) {
  console.error('Usage: node migrate-replications.mjs --dry-run|--execute');
  process.exit(1);
}

// Paths to source files
const REPLICATIONS_DIR = '/Users/josie/Documents/Utilities/unified osmanthus app/replications';
const VIDEOS_NEW_DIR = path.join(REPLICATIONS_DIR, 'videos', 'new');
const IMAGES_DIR = path.join(REPLICATIONS_DIR, 'images');
const INDEX_FILE = path.join(REPLICATIONS_DIR, 'esei-replications-index.json');

// Effect mapping: ESEI effect names to DoseWiki effect slugs
const EFFECT_SLUG_MAP = {
  'Aesthetic distillation': 'aesthetic-distillation',
  'Akinetopsia': 'akinetopsia',
  'Autonomous entities': 'autonomous-entities',
  'Blurred vision': 'blurred-vision',
  'Breathing': 'breathing',
  'Chromatic aberration': 'chromatic-aberration',
  'Closed eye visuals': 'closed-eye-visuals',
  'Color enhancement': 'color-enhancement',
  'Color modulation': 'color-modulation',
  'Color transformation': 'color-transformation',
  'Depersonalization': 'depersonalization',
  'Diffraction spikes': 'diffraction-spikes',
  'Double vision': 'double-vision',
  'Environmental cubism': 'environmental-cubism',
  'External hallucinations': 'external-hallucinations',
  'Flowing': 'flowing',
  'Geometry': 'geometry',
  'Hallucinatory entities': 'hallucinatory-entities',
  'Hallucinatory visual acuity': 'hallucinatory-visual-acuity',
  'Immersive hallucinations': 'immersive-hallucinations',
  'Increased pareidolia': 'increased-pareidolia',
  'Internal hallucinations': 'internal-hallucinations',
  'Loss of Contact with Reality': 'loss-of-contact-with-reality',
  'Machinescapes': 'machinescapes',
  'Melting': 'melting',
  'Object activation': 'object-activation',
  'Open eye visuals': 'open-eye-visuals',
  'Peripheral pareidolia': 'peripheral-pareidolia',
  'Recursion': 'recursion',
  'Scenery slicing': 'scenery-slicing',
  'Symmetrical texture repetition': 'symmetrical-texture-repetition',
  'Trails': 'trails',
  'Tracers': 'tracers',
  'Visual acuity enhancement': 'visual-acuity-enhancement',
  'Visual distortions': 'visual-distortions',
  'Visual drifting': 'visual-drifting',
  'Visual geometry': 'visual-geometry',
  'Visual trails': 'visual-trails',
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
    .replace(/-+/g, '-');

  return normalized;
}

/**
 * Get image dimensions using Sharp.
 */
async function getImageDimensions(filePath) {
  try {
    const metadata = await sharp(filePath).metadata();
    return {
      width: metadata.width,
      height: metadata.height,
    };
  } catch (error) {
    console.warn(`Warning: Could not get dimensions for ${filePath}:`, error.message);
    return { width: undefined, height: undefined };
  }
}

/**
 * Get video metadata using FFmpeg.
 */
function getVideoMetadata(filePath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        console.warn(`Warning: Could not get metadata for ${filePath}:`, err.message);
        return resolve({
          duration: undefined,
          width: undefined,
          height: undefined,
        });
      }

      const videoStream = metadata.streams.find(s => s.codec_type === 'video');
      const duration = metadata.format.duration;
      const width = videoStream?.width;
      const height = videoStream?.height;

      resolve({ duration, width, height });
    });
  });
}

/**
 * Extract first frame of video as thumbnail.
 */
async function extractVideoThumbnail(videoPath, outputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .screenshots({
        timestamps: ['0'],
        filename: path.basename(outputPath),
        folder: path.dirname(outputPath),
      })
      .on('end', () => resolve(outputPath))
      .on('error', reject);
  });
}

/**
 * Load and process the replication index.
 */
function loadReplicationIndex() {
  if (!fs.existsSync(INDEX_FILE)) {
    console.error(`Error: Index file not found: ${INDEX_FILE}`);
    process.exit(1);
  }

  const content = fs.readFileSync(INDEX_FILE, 'utf-8');
  return JSON.parse(content);
}

/**
 * Find file in disk.
 */
function findReplicationFile(filename) {
  // Check in videos new directory
  const videoPath = path.join(VIDEOS_NEW_DIR, filename);
  if (fs.existsSync(videoPath)) {
    return videoPath;
  }

  // Check in all video subdirectories
  for (const folder of fs.readdirSync(VIDEOS_NEW_DIR)) {
    const folderPath = path.join(VIDEOS_NEW_DIR, folder);
    if (fs.statSync(folderPath).isDirectory()) {
      const filePath = path.join(folderPath, filename);
      if (fs.existsSync(filePath)) {
        return filePath;
      }
    }
  }

  // Check in images directory
  const imagePath = path.join(IMAGES_DIR, filename);
  if (fs.existsSync(imagePath)) {
    return imagePath;
  }

  return null;
}

/**
 * Main migration function.
 */
async function migrate() {
  console.log(`\n${'='.repeat(60)}`);
  console.log('Replication Migration Script');
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'EXECUTE'}`);
  console.log(`${'='.repeat(60)}\n`);

  // Load the replication index
  const index = loadReplicationIndex();
  const eseiEffects = index.eseiEffects || {};

  let totalReplications = 0;
  let successCount = 0;
  let errorCount = 0;
  const errors = [];
  const replicationsToImport = [];

  // Process each ESEI effect
  for (const [eseiEffectName, data] of Object.entries(eseiEffects)) {
    const replications = data.replications || [];
    const effectSlug = EFFECT_SLUG_MAP[eseiEffectName];

    if (!effectSlug) {
      console.warn(`Warning: No mapping found for ESEI effect: ${eseiEffectName}`);
      continue;
    }

    for (const rep of replications) {
      totalReplications++;
      const filename = rep.filename || rep.videoId;

      if (!filename) {
        errors.push(
          `Skipped: No filename for replication in ${eseiEffectName}`
        );
        errorCount++;
        continue;
      }

      // Try to find the file
      const filePath = findReplicationFile(filename);
      if (!filePath) {
        errors.push(`File not found: ${filename} (for ${eseiEffectName})`);
        errorCount++;
        continue;
      }

      // Get file stats
      const stats = fs.statSync(filePath);
      const fileSize = stats.size;
      const ext = path.extname(filePath).toLowerCase().slice(1);
      const isVideo = ['mp4', 'webm', 'mov', 'm4v'].includes(ext);
      const isImage = ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext);

      if (!isVideo && !isImage) {
        errors.push(`Unsupported file type: ${filename}`);
        errorCount++;
        continue;
      }

      // Parse filename for title and artist
      const { title, artist } = parseFilename(filename);
      const slug = generateSlug(title, artist);

      const repRecord = withDefaultReplicationRights({
        slug,
        title,
        artist,
        artist_url: rep.artistUrl || undefined,
        type: isVideo ? 'video' : 'image',
        effect_slug: effectSlug,
        format: ext,
        file_size: fileSize,
        source_file: filePath,
        source_filename: filename,
      });

      // Get metadata
      try {
        if (isVideo) {
          const videoMeta = await getVideoMetadata(filePath);
          repRecord.duration = videoMeta.duration;
          repRecord.width = videoMeta.width;
          repRecord.height = videoMeta.height;
        } else {
          const imageMeta = await getImageDimensions(filePath);
          repRecord.width = imageMeta.width;
          repRecord.height = imageMeta.height;
        }
      } catch (error) {
        console.warn(`Warning: Could not extract metadata for ${filename}:`, error.message);
      }

      replicationsToImport.push(repRecord);
      successCount++;
    }
  }

  // Print summary
  console.log(`Found ${successCount} replications to import`);
  console.log(`Errors: ${errorCount}\n`);

  if (errors.length > 0) {
    console.log('Errors:');
    errors.slice(0, 10).forEach(e => console.log(`  - ${e}`));
    if (errors.length > 10) {
      console.log(`  ... and ${errors.length - 10} more errors\n`);
    }
  }

  // Group by effect
  const byEffect = {};
  for (const rep of replicationsToImport) {
    if (!byEffect[rep.effect_slug]) {
      byEffect[rep.effect_slug] = [];
    }
    byEffect[rep.effect_slug].push(rep);
  }

  console.log('\nReplications by effect:');
  for (const [effect, reps] of Object.entries(byEffect).sort()) {
    console.log(`  ${effect}: ${reps.length}`);
  }

  if (dryRun) {
    console.log('\n[DRY RUN] No files were uploaded. Run with --execute to import.');
    process.exit(0);
  }

  // Execute migration (would need Convex client setup)
  console.log('\n[EXECUTE MODE] Would upload files to Convex...');
  console.log('Implementation of file upload will be added in the next step.');
}

// Run migration
migrate().catch(error => {
  console.error('Migration error:', error);
  process.exit(1);
});
