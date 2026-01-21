#!/usr/bin/env node
/**
 * Upload replications to Convex storage.
 * Processes videos first, then images.
 * Uses Convex generateUploadUrl + HTTP upload pattern.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { promisify } from 'util';
import os from 'os';

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Paths
const REPLICATIONS_SOURCE_DIR = '/Users/josie/Documents/Utilities/unified osmanthus app/replications';
const VIDEOS_DIR = path.join(REPLICATIONS_SOURCE_DIR, 'videos');
const IMAGES_DIR = path.join(REPLICATIONS_SOURCE_DIR, 'images');
const METADATA_FILE = path.join(
  __dirname,
  '..',
  'notes-and-plans',
  'exports',
  'replications',
  'replications-metadata.json'
);
const PROJECT_DIR = path.join(__dirname, '../..');

// State
let uploadUrlCache = null;
let uploadUrlExpiry = 0;

async function getUploadUrl() {
  // Cache upload URLs for 5 minutes to avoid excess mutation calls
  const now = Date.now();
  if (uploadUrlCache && now < uploadUrlExpiry) {
    return uploadUrlCache;
  }

  console.log('  🔗 Requesting new upload URL...');

  try {
    const { stdout } = await execAsync(
      `cd "${PROJECT_DIR}" && npx convex run "replications:generateUploadUrl" '{}' 2>&1`,
      { maxBuffer: 10 * 1024 * 1024 }
    );

    // Extract the URL from output (npx convex run returns JSON-encoded string)
    const lines = stdout.split('\n');
    let url = null;
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('"https://') || trimmed.startsWith('https://')) {
        // Remove JSON quotes if present
        url = trimmed.replace(/^"|"$/g, '');
        break;
      }
    }

    if (!url) {
      throw new Error('No upload URL found in response');
    }

    uploadUrlCache = url;
    uploadUrlExpiry = now + (5 * 60 * 1000); // 5 minutes
    return url;
  } catch (err) {
    throw new Error(`Failed to get upload URL: ${err.message}`);
  }
}

async function uploadFile(filePath, filename, contentType) {
  const fileBuffer = fs.readFileSync(filePath);
  const uploadUrl = await getUploadUrl();
  
  console.log(`    📤 Uploading ${filename} (${(fileBuffer.length / 1024).toFixed(1)}KB)...`);
  
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
}

async function updateReplication(rep, storageId) {
  console.log(`    ✏️  Updating record...`);

  const args = {
    slug: rep.slug,
    title: rep.title,
    artist: rep.artist || 'Unknown',
    type: rep.type,
    storage_id: storageId,
    effect_slug: rep.effect_slug || 'unknown',
    format: rep.format,
  };

  // Only include artist_url if it's a non-null string
  if (rep.artist_url && typeof rep.artist_url === 'string') {
    args.artist_url = rep.artist_url;
  }

  if (rep.fileSize) args.file_size = rep.fileSize;
  if (rep.type === 'video' && rep.duration) args.duration = rep.duration;

  const tempFile = path.join(os.tmpdir(), `convex-args-${Date.now()}.json`);
  try {
    // Write args to temp file to avoid shell injection
    fs.writeFileSync(tempFile, JSON.stringify(args), 'utf-8');

    const cmd = `cd "${PROJECT_DIR}" && npx convex run "replications:insertReplication" "$(cat ${tempFile})" 2>&1`;
    const { stdout, stderr } = await execAsync(cmd, { maxBuffer: 10 * 1024 * 1024 });

    if (stdout.includes('Error') || stdout.includes('error')) {
      throw new Error(`Convex error: ${stdout}`);
    }
  } catch (err) {
    throw new Error(`Failed to update record: ${err.message}`);
  } finally {
    // Clean up temp file
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
  }
}

async function processReplication(rep, index, total) {
  const progress = `[${String(index).padStart(3)}/${total}]`;
  
  try {
    let filePath;
    if (rep.type === 'video') {
      filePath = path.join(VIDEOS_DIR, rep.filename);
    } else {
      filePath = path.join(IMAGES_DIR, rep.filename);
    }
    
    if (!fs.existsSync(filePath)) {
      console.log(`${progress} ⏭️  SKIP: ${rep.filename}`);
      return { status: 'skipped' };
    }
    
    console.log(`${progress} 🎬 Processing: ${rep.slug}`);
    
    const contentType = rep.type === 'video' ? 'video/mp4' : 'image/jpeg';
    const storageId = await uploadFile(filePath, rep.filename, contentType);
    await updateReplication(rep, storageId);
    
    console.log(`${progress} ✅ Complete\n`);
    return { status: 'uploaded' };
    
  } catch (err) {
    console.log(`${progress} ❌ ERROR: ${err.message}\n`);
    return { status: 'error', error: err.message };
  }
}

async function main() {
  console.log('\n' + '='.repeat(70));
  console.log('🚀 Upload Replications to Convex');
  console.log('='.repeat(70) + '\n');
  
  // Parse args
  const skipImages = process.argv.includes('--skip-images');
  const skipVideos = process.argv.includes('--skip-videos');
  
  if (skipImages) console.log('⏭️  Will skip images\n');
  if (skipVideos) console.log('⏭️  Will skip videos\n');
  
  // Load metadata
  const metadata = JSON.parse(fs.readFileSync(METADATA_FILE, 'utf-8'));
  let replications = metadata.replications;
  
  if (skipImages) replications = replications.filter(r => r.type === 'video');
  if (skipVideos) replications = replications.filter(r => r.type === 'image');
  
  console.log(`📦 Total files: ${replications.length}\n`);
  
  // Process
  const results = { uploaded: 0, skipped: 0, error: 0, errors: [] };
  
  for (let i = 0; i < replications.length; i++) {
    const rep = replications[i];
    const result = await processReplication(rep, i + 1, replications.length);
    
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
