#!/usr/bin/env node
/**
 * Migration script to move standard source citations from `citations` field
 * (Further Reading) to `source_citations` field (Sources) - directly in Convex.
 *
 * This fetches from Convex, applies changes, and syncs back without losing other changes.
 */

import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api.js";

const CONVEX_URL = process.env.VITE_CONVEX_URL || "https://enchanted-echidna-791.convex.cloud";

// Domains/patterns that identify standard sources (should be in source_citations)
const STANDARD_SOURCE_PATTERNS = [
  'psychonautwiki.org', 'psychonautwiki.net',
  'erowid.org',
  'tripsit.me', 'tripbot.tripsit.me', 'factsheet.tripsit.me', 'benzos.tripsit.me',
  'drugbank.com', 'go.drugbank.com',
  'isomerdesign.com', 'tihkal.info',
  'disregardeverythingisay.com',
  'drugusersbible.org', 'drugusersbible.com',
  'thedrugclassroom.com',
  'wikipedia.org', 'wikimedia.org',
  'saferparty.ch',
  'dancesafe.org',
  'bluelight.org',
];

function isStandardSource(url) {
  if (!url) return false;
  const lowerUrl = url.toLowerCase();
  return STANDARD_SOURCE_PATTERNS.some(pattern => lowerUrl.includes(pattern));
}

function getSortKey(citation) {
  return (citation.name || '').toLowerCase();
}

function isDuplicate(citation, existingCitations) {
  if (!citation.url) return false;
  const normalizedUrl = citation.url.toLowerCase().replace(/\/+$/, '');
  return existingCitations.some(existing => {
    if (!existing.url) return false;
    const existingNormalized = existing.url.toLowerCase().replace(/\/+$/, '');
    return existingNormalized === normalizedUrl;
  });
}

function processSubstance(substance) {
  const citations = substance.citations || [];
  const sourceCitations = substance.source_citations || [];

  const newSourceCitations = [...sourceCitations];
  const newCitations = [];
  let movedCount = 0;

  for (const citation of citations) {
    if (isStandardSource(citation.url)) {
      if (!isDuplicate(citation, newSourceCitations)) {
        newSourceCitations.push(citation);
        movedCount++;
      }
    } else {
      newCitations.push(citation);
    }
  }

  // Sort both arrays alphabetically
  newSourceCitations.sort((a, b) => getSortKey(a).localeCompare(getSortKey(b)));
  newCitations.sort((a, b) => getSortKey(a).localeCompare(getSortKey(b)));

  return {
    ...substance,
    source_citations: newSourceCitations,
    citations: newCitations,
    _movedCount: movedCount,
  };
}

async function main() {
  console.log('🔄 Migrating citations in Convex database');
  console.log(`   Convex URL: ${CONVEX_URL}\n`);

  const client = new ConvexHttpClient(CONVEX_URL);

  // Fetch all substances from Convex
  console.log('📥 Fetching substances from Convex...');
  const substances = await client.query(api.substanceIndex.getAll);
  console.log(`   Found ${substances.length} substances\n`);

  // Process each substance
  let totalMoved = 0;
  let substancesAffected = 0;
  const updatedSubstances = [];

  for (const substance of substances) {
    const result = processSubstance(substance);
    if (result._movedCount > 0) {
      console.log(`  ${substance.title}: moving ${result._movedCount} citation(s) to sources`);
      totalMoved += result._movedCount;
      substancesAffected++;
    }
    delete result._movedCount;
    updatedSubstances.push(result);
  }

  console.log(`\n✓ Will move ${totalMoved} citations across ${substancesAffected} substances`);

  if (totalMoved === 0) {
    console.log('\n✅ No changes needed - all citations are already in the correct place!');
    return;
  }

  // Sync back to Convex in batches
  console.log('\n📤 Syncing changes back to Convex...');
  const BATCH_SIZE = 50;

  for (let i = 0; i < updatedSubstances.length; i += BATCH_SIZE) {
    const batch = updatedSubstances.slice(i, i + BATCH_SIZE);
    const result = await client.mutation(api.substanceIndex.saveSubstances, {
      articles: batch
    });
    console.log(`   Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(updatedSubstances.length / BATCH_SIZE)}: ${result.updated} updated, ${result.created} created`);
  }

  console.log('\n✅ Done! Refresh your browser to see the changes.');
}

main().catch(console.error);
