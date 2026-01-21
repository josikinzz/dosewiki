#!/usr/bin/env node
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const parsed = JSON.parse(readFileSync(join(__dirname, '../src/data/parsed-sources.json'), 'utf-8'));
const articles = JSON.parse(readFileSync(join(__dirname, '../src/data/SubstanceIndex.json'), 'utf-8'));

// Build a map of existing articles with interactions
const articlesWithInteractions = new Set();
for (const art of articles) {
  if (art.interactions && (
    (art.interactions.dangerous && art.interactions.dangerous.length > 0) ||
    (art.interactions.unsafe && art.interactions.unsafe.length > 0) ||
    (art.interactions.caution && art.interactions.caution.length > 0)
  )) {
    articlesWithInteractions.add(art.title.toLowerCase());
  }
}

// Check parsed sources for DrugBank interactions
const candidates = [];
for (const [slug, data] of Object.entries(parsed.substances)) {
  // Has DrugBank interactions?
  const drugbankInteractions = data.interactions.filter(i => i.source === 'drugbank');
  if (drugbankInteractions.length === 0) continue;

  // Article doesn't have interactions yet?
  if (!articlesWithInteractions.has(data.name.toLowerCase())) {
    candidates.push({
      slug,
      name: data.name,
      drugbankCount: drugbankInteractions.length,
      sample: drugbankInteractions.slice(0, 3)
    });
  }
}

console.log('Articles with existing interactions:', articlesWithInteractions.size);
console.log('Candidates (DrugBank interactions, no existing):', candidates.length);
console.log('\nFull list of candidates:');
candidates.sort((a, b) => a.name.localeCompare(b.name)).forEach(c => {
  console.log('  ' + c.name + ' (' + c.drugbankCount + ' interactions)');
});
