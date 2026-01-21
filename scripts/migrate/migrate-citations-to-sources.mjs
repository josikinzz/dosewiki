#!/usr/bin/env node
/**
 * Migration script to move standard source citations from the `citations` field
 * (Further Reading) to the `source_citations` field (Sources).
 *
 * Standard sources are those that have parsers in scripts/parsers/:
 * - PsychonautWiki, Erowid, TripSit, DrugBank, Isomer Design, DEIS,
 *   Drug Users Bible, The Drug Classroom, Wikipedia, SaferParty, DanceSafe, Bluelight
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.join(__dirname, '../src/data/SubstanceIndex.json');

// Domains/patterns that identify standard sources (should be in source_citations)
const STANDARD_SOURCE_PATTERNS = [
  // PsychonautWiki
  'psychonautwiki.org',
  'psychonautwiki.net',
  // Erowid
  'erowid.org',
  // TripSit
  'tripsit.me',
  'tripbot.tripsit.me',
  'factsheet.tripsit.me',
  'benzos.tripsit.me',
  // DrugBank
  'drugbank.com',
  'go.drugbank.com',
  // Isomer Design / TiHKAL / PiHKAL
  'isomerdesign.com',
  'tihkal.info',
  // DEIS (Disregard Everything I Say)
  'disregardeverythingisay.com',
  // Drug Users Bible
  'drugusersbible.org',
  'drugusersbible.com',
  // The Drug Classroom
  'thedrugclassroom.com',
  // Wikipedia
  'wikipedia.org',
  'wikimedia.org',
  // SaferParty
  'saferparty.ch',
  // DanceSafe
  'dancesafe.org',
  // Bluelight
  'bluelight.org',
];

/**
 * Check if a URL belongs to a standard source
 */
function isStandardSource(url) {
  if (!url) return false;
  const lowerUrl = url.toLowerCase();
  return STANDARD_SOURCE_PATTERNS.some(pattern => lowerUrl.includes(pattern));
}

/**
 * Get a sorting key for a citation (alphabetical by name, case-insensitive)
 */
function getSortKey(citation) {
  return (citation.name || '').toLowerCase();
}

/**
 * Check if two citations are duplicates (same URL)
 */
function isDuplicate(citation, existingCitations) {
  if (!citation.url) return false;
  const normalizedUrl = citation.url.toLowerCase().replace(/\/+$/, '');
  return existingCitations.some(existing => {
    if (!existing.url) return false;
    const existingNormalized = existing.url.toLowerCase().replace(/\/+$/, '');
    return existingNormalized === normalizedUrl;
  });
}

/**
 * Process a single substance, moving standard sources to source_citations
 */
function processSubstance(substance) {
  const citations = substance.citations || [];
  const sourceCitations = substance.source_citations || [];

  const newSourceCitations = [...sourceCitations];
  const newCitations = [];
  let movedCount = 0;

  for (const citation of citations) {
    if (isStandardSource(citation.url)) {
      // Check if already in source_citations (avoid duplicates)
      if (!isDuplicate(citation, newSourceCitations)) {
        newSourceCitations.push(citation);
        movedCount++;
      }
    } else {
      newCitations.push(citation);
    }
  }

  // Sort both arrays alphabetically by name
  newSourceCitations.sort((a, b) => getSortKey(a).localeCompare(getSortKey(b)));
  newCitations.sort((a, b) => getSortKey(a).localeCompare(getSortKey(b)));

  return {
    ...substance,
    source_citations: newSourceCitations,
    citations: newCitations,
    _movedCount: movedCount,
  };
}

function main() {
  console.log('Reading SubstanceIndex.json...');
  const data = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));

  console.log(`Processing ${data.length} substances...\n`);

  let totalMoved = 0;
  let substancesAffected = 0;

  const processed = data.map(substance => {
    const result = processSubstance(substance);
    if (result._movedCount > 0) {
      console.log(`  ${substance.title}: moved ${result._movedCount} citation(s) to sources`);
      totalMoved += result._movedCount;
      substancesAffected++;
    }
    // Remove the temporary counter
    delete result._movedCount;
    return result;
  });

  console.log(`\n✓ Moved ${totalMoved} citations across ${substancesAffected} substances`);

  // Write back
  console.log('\nWriting updated SubstanceIndex.json...');
  fs.writeFileSync(indexPath, JSON.stringify(processed, null, 2) + '\n');

  console.log('Done!');
}

main();
