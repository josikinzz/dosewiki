#!/usr/bin/env node
/**
 * Upload replications to Convex storage.
 * Processes videos first, then images.
 * Uses Convex generateUploadUrl + HTTP upload pattern.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { ConvexHttpClient } from 'convex/browser';
import sharp from 'sharp';
import { api } from '../../convex/_generated/api.js';
import {
  readSimpleEnvFile,
  resolveReplicationsPaths,
} from './lib/reconciliation.mjs';
import {
  withDefaultReplicationRights,
} from './lib/workspace.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Paths
const REPLICATIONS_SOURCE_DIR = '/Users/josie/Documents/Utilities/unified osmanthus app/replications';
const VIDEOS_DIR = path.join(REPLICATIONS_SOURCE_DIR, 'videos', 'new');
const IMAGES_DIR = path.join(REPLICATIONS_SOURCE_DIR, 'images');
const { metadataFile: METADATA_FILE, envFile: ENV_FILE } = resolveReplicationsPaths(__dirname);

const env = {
  ...readSimpleEnvFile(ENV_FILE),
  ...process.env,
};

const CONVEX_URL = env.CONVEX_URL || env.VITE_CONVEX_URL || env.NEXT_PUBLIC_CONVEX_URL;
const CONVEX_ADMIN_KEY = env.CONVEX_ADMIN_KEY;

if (!CONVEX_URL) {
  throw new Error('Convex URL is not configured. Set CONVEX_URL, VITE_CONVEX_URL, or NEXT_PUBLIC_CONVEX_URL.');
}

if (!CONVEX_ADMIN_KEY) {
  throw new Error('CONVEX_ADMIN_KEY is not configured. Uploads require admin authentication.');
}

const client = new ConvexHttpClient(CONVEX_URL);

const CONTENT_TYPES = {
  gif: 'image/gif',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  m4v: 'video/x-m4v',
  mov: 'video/quicktime',
  mp4: 'video/mp4',
  png: 'image/png',
  webm: 'video/webm',
  webp: 'image/webp',
};

const THUMBNAIL_MAX_WIDTH = 640;
const THUMBNAIL_QUALITY = 80;
const RIGHTS_FIELDS = [
  'rights_status',
  'license_name',
  'license_url',
  'credit_line',
  'source_url',
  'rightsholder',
  'permission_notes',
  'removal_contact',
];

// State
let uploadUrlCache = null;
let uploadUrlExpiry = 0;

function formatTimestamp(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return '0.5';
  }

  return seconds.toFixed(3);
}

function getVideoMetadata(filePath) {
  const result = spawnSync(
    'ffprobe',
    [
      '-v',
      'error',
      '-select_streams',
      'v:0',
      '-show_entries',
      'stream=width,height:format=duration',
      '-of',
      'json',
      filePath,
    ],
    { encoding: 'utf8' },
  );

  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `ffprobe failed for ${filePath}`);
  }

  const metadata = JSON.parse(result.stdout);
  const stream = metadata.streams?.[0] ?? {};
  const duration = Number.parseFloat(metadata.format?.duration ?? '');

  return {
    width: Number.isFinite(stream.width) ? stream.width : undefined,
    height: Number.isFinite(stream.height) ? stream.height : undefined,
    duration: Number.isFinite(duration) ? duration : undefined,
  };
}

function getThumbnailTimestamp(duration) {
  if (!Number.isFinite(duration) || duration <= 0) {
    return 0.5;
  }

  return Math.max(0.25, Math.min(1.0, duration * 0.15));
}

function extractVideoFrame(videoPath, outputPath, timestampSeconds) {
  const result = spawnSync(
    'ffmpeg',
    [
      '-y',
      '-ss',
      formatTimestamp(timestampSeconds),
      '-i',
      videoPath,
      '-frames:v',
      '1',
      outputPath,
    ],
    { encoding: 'utf8' },
  );

  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `ffmpeg failed for ${videoPath}`);
  }
}

async function createVideoThumbnail(videoPath, slug, duration) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dosewiki-replication-thumb-'));
  const framePath = path.join(tempDir, `${slug}.jpg`);
  const outputPath = path.join(tempDir, `${slug}.webp`);

  try {
    extractVideoFrame(videoPath, framePath, getThumbnailTimestamp(duration));

    await sharp(framePath)
      .resize({ width: THUMBNAIL_MAX_WIDTH, withoutEnlargement: true })
      .webp({ quality: THUMBNAIL_QUALITY })
      .toFile(outputPath);

    return outputPath;
  } catch (error) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    throw error;
  }
}

function removeTempFile(filePath) {
  if (!filePath) {
    return;
  }

  fs.rmSync(path.dirname(filePath), { recursive: true, force: true });
}

function dedupeBySlug(replications) {
  const seen = new Set();
  return replications.filter((replication) => {
    if (seen.has(replication.slug)) {
      return false;
    }

    seen.add(replication.slug);
    return true;
  });
}

function pickRightsUpdates(replication) {
  return Object.fromEntries(
    RIGHTS_FIELDS
      .map((field) => [field, replication[field]])
      .filter(([, value]) => value !== undefined && value !== null && value !== ''),
  );
}

async function getUploadUrl() {
  // Cache upload URLs for 5 minutes to avoid excess mutation calls
  const now = Date.now();
  if (uploadUrlCache && now < uploadUrlExpiry) {
    return uploadUrlCache;
  }

  console.log('  🔗 Requesting new upload URL...');

  const url = await client.mutation(api.replications.generateUploadUrl, {
    apiKey: CONVEX_ADMIN_KEY,
  });

  uploadUrlCache = url;
  uploadUrlExpiry = now + (5 * 60 * 1000); // 5 minutes
  return url;
}

async function uploadFile(filePath, filename, contentType) {
  const fileBuffer = fs.readFileSync(filePath);
  
  console.log(`    📤 Uploading ${filename} (${(fileBuffer.length / 1024).toFixed(1)}KB)...`);

  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      if (attempt > 1) {
        uploadUrlCache = null;
        uploadUrlExpiry = 0;
        console.log(`    🔁 Retrying upload with a fresh URL (attempt ${attempt}/3)...`);
      }

      const uploadUrl = await getUploadUrl();
      const response = await fetch(uploadUrl, {
        method: 'POST',
        body: fileBuffer,
        headers: { 'Content-Type': contentType },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      const storageId = data.storageId;

      if (!storageId) {
        throw new Error('No storageId in response');
      }

      return storageId;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function persistReplication(rep, storageId, thumbnailStorageId, existingReplication) {
  console.log(`    ✏️  ${existingReplication ? 'Updating' : 'Creating'} record...`);
  const replicationWithRights = withDefaultReplicationRights(rep);
  const rightsUpdates = pickRightsUpdates(replicationWithRights);

  if (existingReplication) {
    await client.mutation(api.replications.updateStorageIds, {
      apiKey: CONVEX_ADMIN_KEY,
      id: existingReplication._id,
      storage_id: storageId ?? existingReplication.storage_id,
      thumbnail_storage_id: thumbnailStorageId ?? existingReplication.thumbnail_storage_id,
    });
    await client.mutation(api.replications.updateRightsMetadata, {
      apiKey: CONVEX_ADMIN_KEY,
      slug: existingReplication.slug,
      updates: rightsUpdates,
    });
    return;
  }

  const args = {
    apiKey: CONVEX_ADMIN_KEY,
    slug: replicationWithRights.slug,
    title: replicationWithRights.title,
    artist: replicationWithRights.artist || 'Unknown',
    type: replicationWithRights.type,
    storage_id: storageId,
    effect_slug: replicationWithRights.effect_slug || 'unknown',
    format: replicationWithRights.format,
    ...rightsUpdates,
  };

  // Only include artist_url if it's a non-null string
  if (replicationWithRights.artist_url && typeof replicationWithRights.artist_url === 'string') {
    args.artist_url = replicationWithRights.artist_url;
  }

  if (replicationWithRights.fileSize) args.file_size = replicationWithRights.fileSize;
  if (replicationWithRights.type === 'video' && replicationWithRights.duration) args.duration = replicationWithRights.duration;
  if (thumbnailStorageId) args.thumbnail_storage_id = thumbnailStorageId;

  await client.mutation(api.replications.insertReplication, args);
}

async function processReplication(rep, index, total, existingReplication, options) {
  const progress = `[${String(index).padStart(3)}/${total}]`;
  let thumbnailPath = null;
  
  try {
    let filePath;
    if (rep.type === 'video') {
      filePath = path.join(VIDEOS_DIR, rep.folder_name || '', rep.filename);
    } else {
      filePath = path.join(IMAGES_DIR, rep.filename);
    }
    
    if (!fs.existsSync(filePath)) {
      console.log(`${progress} ⏭️  SKIP: ${rep.filename}`);
      return { status: 'skipped' };
    }
    
    console.log(`${progress} 🎬 Processing: ${rep.slug}`);

    const metadata = rep.type === 'video' ? getVideoMetadata(filePath) : {};
    const shouldUploadMedia = !options.onlyMissingThumbnails;

    let storageId = existingReplication?.storage_id;
    if (shouldUploadMedia) {
      const contentType = CONTENT_TYPES[rep.format?.toLowerCase()] || 'application/octet-stream';
      storageId = await uploadFile(filePath, rep.filename, contentType);
    }

    let thumbnailStorageId = existingReplication?.thumbnail_storage_id;
    if (rep.type === 'video') {
      thumbnailPath = await createVideoThumbnail(filePath, rep.slug, metadata.duration ?? rep.duration);
      thumbnailStorageId = await uploadFile(thumbnailPath, `${rep.slug}.webp`, 'image/webp');
    }

    await persistReplication(rep, storageId, thumbnailStorageId, existingReplication);
    
    console.log(`${progress} ✅ Complete\n`);
    return { status: 'uploaded' };
    
  } catch (err) {
    console.log(`${progress} ❌ ERROR: ${err.message}\n`);
    return { status: 'error', error: err.message };
  } finally {
    removeTempFile(thumbnailPath);
  }
}

async function main() {
  console.log('\n' + '='.repeat(70));
  console.log('🚀 Upload Replications to Convex');
  console.log('='.repeat(70) + '\n');
  
  // Parse args
  const skipImages = process.argv.includes('--skip-images');
  const skipVideos = process.argv.includes('--skip-videos');
  const onlyMissing = process.argv.includes('--only-missing');
  const onlyMissingThumbnails = process.argv.includes('--only-missing-thumbnails');
  
  if (skipImages) console.log('⏭️  Will skip images\n');
  if (skipVideos) console.log('⏭️  Will skip videos\n');
  if (onlyMissing) console.log('🩹 Will only import replications missing from Convex\n');
  if (onlyMissingThumbnails) console.log('🖼️  Will only backfill missing video thumbnails\n');
  
  // Load metadata
  const metadata = JSON.parse(fs.readFileSync(METADATA_FILE, 'utf-8'));
  let replications = metadata.replications;
  const existing = await client.query(api.replications.getAll, {});
  const existingBySlug = new Map(existing.map((replication) => [replication.slug, replication]));

  if (skipImages) replications = replications.filter(r => r.type === 'video');
  if (skipVideos) replications = replications.filter(r => r.type === 'image');
  replications = replications.filter((replication) => Boolean(replication.effect_slug));

  if (onlyMissing) {
    const existingSlugs = new Set(existing.map((replication) => replication.slug));
    replications = replications.filter((replication) => !existingSlugs.has(replication.slug));
  }

  if (onlyMissingThumbnails) {
    replications = replications.filter((replication) => {
      if (replication.type !== 'video') {
        return false;
      }

      const current = existingBySlug.get(replication.slug);
      if (!current) {
        return false;
      }

      return !current.thumbnail_storage_id && !current.thumbnail_url;
    });
  }

  replications = dedupeBySlug(replications);
  
  console.log(`📦 Total files: ${replications.length}\n`);
  
  // Process
  const results = { uploaded: 0, skipped: 0, error: 0, errors: [] };
  
  for (let i = 0; i < replications.length; i++) {
    const rep = replications[i];
    const result = await processReplication(
      rep,
      i + 1,
      replications.length,
      existingBySlug.get(rep.slug),
      { onlyMissingThumbnails },
    );
    
    if (result.status === 'uploaded') results.uploaded++;
    else if (result.status === 'skipped') results.skipped++;
    else {
      results.error++;
      if (result.error) results.errors.push(`${rep.slug}: ${result.error}`);
    }
  }
  
  // Summary
  console.log('='.repeat(70));
  console.log('📊 Summary');
  console.log('='.repeat(70));
  console.log(`✅ Uploaded: ${results.uploaded}`);
  console.log(`⏭️  Skipped:  ${results.skipped}`);
  console.log(`❌ Errors:   ${results.error}`);
  console.log('='.repeat(70) + '\n');
  
  if (results.errors.length > 0) {
    console.log('Failed items:');
    results.errors.forEach(e => console.log(`  • ${e}`));
  }
  
  process.exit(results.error > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('💥 Fatal error:', err);
  process.exit(1);
});
