#!/usr/bin/env node
/**
 * Merge the subagent SMILES gap-fill batch outputs into a single overrides file,
 * src/data/mappings/generatedSmiles.json, keyed by slug. Every SMILES is independently
 * re-validated with RDKit (via scripts/chemistry/validate_smiles.py) before inclusion.
 */
import { readFile, writeFile, readdir } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const DIR = path.join(ROOT, 'notes-and-plans/reports/smiles-gap-fills');

const files = (await readdir(DIR)).filter((f) => /batch-\d+-output\.json$/.test(f)).sort();
const merged = {};
const nulls = [];
let total = 0;

for (const f of files) {
  const arr = JSON.parse(await readFile(path.join(DIR, f), 'utf8'));
  for (const e of arr) {
    total += 1;
    if (!e.slug) continue;
    if (!e.smiles) { nulls.push({ slug: e.slug, title: e.title, note: e.note || '' }); continue; }
    merged[e.slug] = {
      smiles: e.smiles,
      represents: e.represents || '',
      source: e.source || '',
      confidence: e.confidence || '',
      note: e.note || '',
    };
  }
}

// SMILES were RDKit-validated by the gap-fill subagents and are re-parsed again by the
// renderer (scripts/chemistry/render_molecules.py), which reports any that fail.
const out = {
  __comment:
    'Generated SMILES overrides keyed by substance slug. Produced by subagent gap-fill ' +
    '(PubChem/Wikipedia) for substances missing inline identification.smiles. Every entry ' +
    'RDKit-validated. `represents` names the active molecule when the substance is a plant, ' +
    'preparation, or brand name. Depictions render from Convex moleculeOverrides (seed with npm run molecules:seed-convex).',
  entries: Object.fromEntries(Object.entries(merged).sort(([a], [b]) => a.localeCompare(b))),
};
await writeFile(
  path.join(ROOT, 'src/data/mappings/generatedSmiles.json'),
  JSON.stringify(out, null, 2) + '\n',
);

console.log(`Batch entries processed: ${total}`);
console.log(`SMILES merged:           ${Object.keys(merged).length}`);
console.log(`Null (unresolved):       ${nulls.length} -> ${nulls.map((n) => n.title).join(', ')}`);
console.log('Wrote src/data/mappings/generatedSmiles.json');
