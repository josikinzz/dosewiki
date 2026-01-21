#!/usr/bin/env node
/**
 * Fix replication URLs by mapping from ESEI Convex storage URLs.
 *
 * The replications were imported with placeholder storage IDs but the actual
 * files are stored in the ESEI Convex deployment (warmhearted-mosquito-204).
 *
 * This script:
 * 1. Reads the ESEI replications index with convexUrl fields
 * 2. Fetches all replications from DoseWiki Convex
 * 3. Matches them by filename/slug and updates with direct URLs
 *
 * Usage:
 *   node scripts/fix-replication-urls.mjs --dry-run
 *   node scripts/fix-replication-urls.mjs --execute
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../convex/_generated/api.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const dryRun = process.argv.includes('--dry-run');
const execute = process.argv.includes('--execute');

if (!dryRun && !execute) {
  console.error('Usage: node fix-replication-urls.mjs --dry-run|--execute');
  process.exit(1);
}

// Paths
const INDEX_FILE = '/Users/josie/Documents/Utilities/unified osmanthus app/replications/esei-replications-index.json';
const CONVEX_URL = process.env.VITE_CONVEX_URL || 'https://enchanted-echidna-791.convex.cloud';

// Effect slug normalization (ESEI names → DoseWiki slugs)
const EFFECT_SLUG_MAP = {
  'Visual trails': 'visual-trails',
  'Autonomous entities': 'autonomous-entity',
  'Geometry': 'geometry',
  'Drifting': 'drifting',
  'Environmental patterning': 'environmental-patterning',
  'Symmetrical texture repetition': 'symmetrical-texture-repetition',
  'Internal hallucinations': 'internal-hallucination',
  'External hallucinations': 'external-hallucination',
  'Recursion': 'recursion',
  'Perspective distortion': 'perspective-distortion',
  'Visual acuity enhancement': 'visual-acuity-enhancement',
  'Derealization': 'derealization',
  'Depersonalization': 'depersonalization',
  'Breathing': 'breathing',
  'Melting': 'melting',
  'Flowing': 'flowing',
  'Morphing': 'morphing',
  'Colour enhancement': 'color-enhancement',
  'Tracers': 'tracers',
  'After images': 'after-images',
  'Scenery slicing': 'scenery-slicing',
  'Texture liquidification': 'texture-liquidification',
  // Add more mappings as needed
};

/**
 * Normalize a string to a slug format for comparison.
 */
function normalizeToSlug(str) {
  return (str || '')
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

/**
 * Normalize slug from filename (matches the import script's logic).
 */
function generateSlugFromFilename(filename, artist) {
  const nameWithoutExt = filename.replace(/\.(mp4|webm|mov|m4v|jpg|jpeg|png|webp|gif)$/i, '');
  let title = nameWithoutExt;

  // Handle "title by artist" format
  if (nameWithoutExt.includes(' by ')) {
    [title] = nameWithoutExt.split(' by ').map(s => s.trim());
  }

  const slug = `${title}-${artist || 'unknown'}`
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');

  return slug;
}

/**
 * Generate all possible slug variations for matching.
 */
function generateSlugVariations(rep) {
  const variations = new Set();

  if (rep.title && rep.artist) {
    // Standard format: title-artist
    variations.add(normalizeToSlug(`${rep.title}-${rep.artist}`));
    // Title only
    variations.add(normalizeToSlug(rep.title));
    // Handle "Unknown" artist
    if (rep.artist.toLowerCase() !== 'unknown') {
      variations.add(normalizeToSlug(`${rep.title}-unknown`));
    }
  }

  if (rep.filename) {
    variations.add(normalizeToSlug(rep.filename.replace(/\.\w+$/, '')));
    // Handle "title by artist.ext" format
    const match = rep.filename.match(/(.+)\s+by\s+(.+)\.\w+$/i);
    if (match) {
      variations.add(normalizeToSlug(`${match[1]}-${match[2]}`));
    }
  }

  if (rep.urlSlug) {
    variations.add(normalizeToSlug(rep.urlSlug));
  }

  if (rep.videoId) {
    variations.add(normalizeToSlug(rep.videoId));
  }

  return variations;
}

/**
 * Main migration function.
 */
async function migrate() {
  console.log(`\n${'='.repeat(60)}`);
  console.log('Fix Replication URLs');
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'EXECUTE'}`);
  console.log(`${'='.repeat(60)}\n`);

  // Load ESEI index
  if (!fs.existsSync(INDEX_FILE)) {
    console.error(`Error: Index file not found: ${INDEX_FILE}`);
    process.exit(1);
  }

  const index = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf-8'));
  const eseiEffects = index.eseiEffects || {};

  // Build comprehensive URL map from ESEI index
  // Map all possible slug variations to convexUrl
  const urlMap = new Map(); // normalized_slug -> convexUrl

  for (const [effectName, data] of Object.entries(eseiEffects)) {
    const replications = data.replications || [];

    for (const rep of replications) {
      if (!rep.convexUrl) continue;

      // Generate all possible slug variations for this replication
      const variations = generateSlugVariations(rep);
      for (const variation of variations) {
        if (variation) {
          urlMap.set(variation, rep.convexUrl);
        }
      }
    }
  }

  console.log(`Loaded ${urlMap.size} URL mappings from ESEI index\n`);

  // Connect to Convex
  const client = new ConvexHttpClient(CONVEX_URL);
  console.log(`Fetching replications from Convex (${CONVEX_URL})...`);

  const replications = await client.query(api.replications.getAll);
  console.log(`Found ${replications.length} replications in database\n`);

  // Find matches and prepare updates
  const updates = [];
  let matchedCount = 0;
  let alreadyHasUrl = 0;
  let noMatch = 0;
  const noMatchList = [];

  for (const rep of replications) {
    // Skip if already has a valid URL
    if (rep.url && !rep.url.startsWith('placeholder')) {
      alreadyHasUrl++;
      continue;
    }

    // Try multiple matching strategies
    let url = null;

    // 1. Try the slug directly
    url = urlMap.get(rep.slug);

    // 2. Try slug without -unknown suffix
    if (!url) {
      url = urlMap.get(rep.slug.replace(/-unknown$/, ''));
    }

    // 3. Try title-artist combination
    if (!url && rep.title && rep.artist) {
      url = urlMap.get(normalizeToSlug(`${rep.title}-${rep.artist}`));
    }

    // 4. Try title only
    if (!url && rep.title) {
      url = urlMap.get(normalizeToSlug(rep.title));
    }

    // 5. Try from placeholder storage_id
    if (!url && rep.storage_id?.startsWith('placeholder-')) {
      const possibleSlug = rep.storage_id.replace('placeholder-', '');
      url = urlMap.get(possibleSlug);
    }

    // 6. Try normalized title variations
    if (!url && rep.title) {
      // Remove underscores and try again
      url = urlMap.get(normalizeToSlug(rep.title.replace(/_/g, ' ')));
    }

    if (url) {
      matchedCount++;
      updates.push({
        _id: rep._id,
        slug: rep.slug,
        url,
      });
    } else {
      noMatch++;
      noMatchList.push({ slug: rep.slug, title: rep.title, artist: rep.artist });
    }
  }

  // Show unmatched entries
  if (noMatchList.length > 0) {
    console.log(`Unmatched replications (first 10):`);
    noMatchList.slice(0, 10).forEach(r => {
      console.log(`  ${r.slug} (title: "${r.title}", artist: "${r.artist}")`);
    });
    if (noMatchList.length > 10) {
      console.log(`  ... and ${noMatchList.length - 10} more without matches\n`);
    }
  }

  console.log(`\nMatching Summary:`);
  console.log(`  Already has URL: ${alreadyHasUrl}`);
  console.log(`  Matched: ${matchedCount}`);
  console.log(`  No match found: ${noMatch}`);
  console.log(`  Total to update: ${updates.length}\n`);

  if (dryRun) {
    console.log('Sample updates (first 10):');
    updates.slice(0, 10).forEach(u => {
      console.log(`  ${u.slug} → ${u.url.substring(0, 60)}...`);
    });
    console.log(`\n[DRY RUN] No changes made. Run with --execute to apply.\n`);
    return;
  }

  // Apply updates
  console.log('Applying updates...');
  let updated = 0;
  let errors = 0;

  for (const update of updates) {
    try {
      await client.mutation(api.replications.updateUrl, {
        id: update._id,
        url: update.url,
      });
      updated++;
      if (updated % 50 === 0) {
        console.log(`  Updated ${updated}/${updates.length}...`);
      }
    } catch (error) {
      errors++;
      console.error(`  Error updating ${update.slug}: ${error.message}`);
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log('Migration Complete');
  console.log(`${'='.repeat(60)}`);
  console.log(`  Updated: ${updated}`);
  console.log(`  Errors: ${errors}`);
  console.log(`${'='.repeat(60)}\n`);
}

// Run migration
migrate().catch(error => {
  console.error('Migration error:', error);
  process.exit(1);
});
