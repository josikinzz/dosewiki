#!/usr/bin/env node
/**
 * Fix harm_potential source meta-commentary directly in Convex
 */
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../convex/_generated/api.js';

const CONVEX_URL = process.env.VITE_CONVEX_URL || 'https://enchanted-echidna-791.convex.cloud';
const ADMIN_KEY = process.env.CONVEX_ADMIN_KEY;
const client = new ConvexHttpClient(CONVEX_URL);

if (!ADMIN_KEY) {
  console.error('❌ CONVEX_ADMIN_KEY not set. Run:');
  console.error('  export CONVEX_ADMIN_KEY=$(grep "^CONVEX_ADMIN_KEY=" .env.local | cut -d= -f2-)');
  process.exit(1);
}

// Fixes to apply: { slug, path, oldText, newText }
const fixes = [
  // 1B-LSD
  { slug: '1b-lsd', path: 'toxicity.carcinogenicity.description', old: 'No carcinogenicity data available for 1B-LSD.', new: '' },
  { slug: '1b-lsd', path: 'toxicity.antibiotic_function.description', old: 'No data available on antimicrobial properties.', new: '' },

  // 1V-LSD
  { slug: '1v-lsd', path: 'toxicity.carcinogenicity.description', old: 'No carcinogenicity data available; the substance has almost no history of human use and has not been formally studied.', new: '' },
  { slug: '1v-lsd', path: 'toxicity.antibiotic_function.description', old: 'No data available on antimicrobial properties.', new: '' },

  // 25B-NBOH
  { slug: '25b-nboh', path: 'toxicity.carcinogenicity.description', old: 'No data available on carcinogenic potential.', new: '' },

  // 2C-D
  { slug: '2c-d', path: 'seizure.description', old: 'No information available regarding seizure risk from 2C-D alone.', new: '' },

  // 3-MeO-PCP
  { slug: '3-meo-pcp', path: 'addiction.physical_dependence.description',
    old: 'Physical dependence can develop with chronic use. Cravings and withdrawal effects may occur upon sudden cessation, though the severity of physical withdrawal symptoms is not well characterized in available literature.',
    new: 'Physical dependence can develop with chronic use. Cravings and withdrawal effects may occur upon sudden cessation.' },

  // 4-FA
  { slug: '4-fa', path: 'addiction.physical_dependence.description',
    old: 'Withdrawal effects have been reported upon cessation of chronic use, though the specific nature of physical dependence symptoms is not well characterized in the available literature.',
    new: 'Withdrawal effects have been reported upon cessation of chronic use.' },
  { slug: '4-fa', path: 'toxicity.antibiotic_function.description', old: 'No data available regarding antimicrobial properties.', new: '' },

  // Adrafinil
  { slug: 'adrafinil', path: 'seizure.description',
    old: 'Adrafinil is contraindicated in individuals with epilepsy, though specific seizure reports are not documented in available literature.',
    new: 'Adrafinil is contraindicated in individuals with epilepsy.' },

  // AMT
  { slug: 'amt', path: 'addiction.psychological.description',
    old: 'AMT is generally considered to have low psychological addiction potential. Most sources describe it as not habit-forming, with the desire to use typically decreasing with repeated experiences. However, one source suggests moderate habit-forming potential. Compulsive use is rarely reported, and users tend to be self-regulating.',
    new: 'AMT is generally considered to have low psychological addiction potential and is not habit-forming, with the desire to use typically decreasing with repeated experiences. Compulsive use is rarely reported, and users tend to be self-regulating.' },

  // DOB
  { slug: 'dob', path: 'toxicity.antibiotic_function.description', old: 'No data available on antimicrobial properties.', new: '' },

  // K-2c-B
  { slug: 'k-2c-b', path: 'toxicity.organ_toxicity[0].notes', old: 'Specific nature of intolerance not described in available literature.', new: '' },
];

function setNestedValue(obj, path, value) {
  const parts = path.split('.');
  let current = obj;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    // Handle array notation like organ_toxicity[0]
    const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/);
    if (arrayMatch) {
      const [, key, index] = arrayMatch;
      current = current[key][parseInt(index)];
    } else {
      current = current[part];
    }
  }

  const lastPart = parts[parts.length - 1];
  const arrayMatch = lastPart.match(/^(\w+)\[(\d+)\]$/);
  if (arrayMatch) {
    const [, key, index] = arrayMatch;
    current[key][parseInt(index)] = value;
  } else {
    current[lastPart] = value;
  }
}

function getNestedValue(obj, path) {
  const parts = path.split('.');
  let current = obj;

  for (const part of parts) {
    if (current === undefined || current === null) return undefined;
    const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/);
    if (arrayMatch) {
      const [, key, index] = arrayMatch;
      current = current[key]?.[parseInt(index)];
    } else {
      current = current[part];
    }
  }
  return current;
}

async function main() {
  console.log(`Fetching articles from ${CONVEX_URL}...\n`);

  const articles = await client.query(api.substanceIndex.getAll, {});
  console.log(`Loaded ${articles.length} articles\n`);

  // Group fixes by slug and accumulate changes
  const articleUpdates = new Map(); // slug -> { article, fixCount }

  for (const fix of fixes) {
    const article = articles.find(a => a.slug === fix.slug);
    if (!article) {
      console.log(`⚠️  Article not found: ${fix.slug}`);
      continue;
    }

    const hpPath = fix.path;
    const actualValue = getNestedValue(article.harm_potential, hpPath);

    if (actualValue === fix.old) {
      console.log(`✓ ${fix.slug}: ${hpPath}`);
      console.log(`  Old: "${fix.old.substring(0, 60)}..."`);
      console.log(`  New: "${fix.new.substring(0, 60) || '(empty)'}"`);

      // Get or create the accumulated update for this article
      if (!articleUpdates.has(fix.slug)) {
        articleUpdates.set(fix.slug, {
          article: JSON.parse(JSON.stringify(article)),
          fixCount: 0
        });
      }
      const entry = articleUpdates.get(fix.slug);
      setNestedValue(entry.article.harm_potential, hpPath, fix.new);
      entry.fixCount++;
    } else if (actualValue === fix.new) {
      console.log(`⏭️  ${fix.slug}: ${hpPath} - already fixed`);
    } else {
      console.log(`⚠️  ${fix.slug}: ${hpPath} - value mismatch`);
      console.log(`  Expected: "${fix.old.substring(0, 60)}..."`);
      console.log(`  Found: "${(actualValue || '').substring(0, 60)}..."`);
    }
  }

  const updates = Array.from(articleUpdates.values()).map(e => e.article);

  if (updates.length === 0) {
    console.log('\nNo updates needed!');
    return;
  }

  console.log(`\nApplying ${updates.length} updates to Convex...`);

  for (const article of updates) {
    const { _id, _creationTime, ...sanitized } = article;
    try {
      await client.mutation(api.substanceIndex.saveSubstance, {
        apiKey: ADMIN_KEY,
        article: sanitized
      });
      console.log(`  ✓ Updated ${article.slug}`);
    } catch (e) {
      console.log(`  ✗ Failed ${article.slug}: ${e.message}`);
    }
  }

  console.log('\nDone! Remember to sync to production:');
  console.log('  TARGET_CONVEX_URL=https://glad-minnow-656.convex.cloud node scripts/convex/sync-convex-to-production.mjs');
}

main().catch(console.error);
