#!/usr/bin/env node
/**
 * Resolve a SMILES string for every substance in public/SubstanceIndex.json using all
 * available local sources, in priority order:
 *   1. identification.smiles (inline, authored)
 *   2. titleIupacSmiles.json  (matched by title / common_name / alternative names)
 *   3. iupacSmilesMap.json     (matched by identification.iupac_name)
 *
 * Emits:
 *   data/chemistry/smiles-coverage.json   (full resolution per substance)
 *   data/chemistry/smiles-gaps.json        (substances still missing SMILES)
 */
import { readFile, writeFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

const read = async (p) => JSON.parse(await readFile(path.join(ROOT, p), 'utf8'));

const norm = (s) => (typeof s === 'string' ? s.toLowerCase().trim() : '');

const substances = await read('public/SubstanceIndex.json');
const titleMapRaw = await read('data/chemistry/titleIupacSmiles.json');
const iupacMap = await read('data/chemistry/iupacSmilesMap.json');
let generated = { entries: {} };
try {
  generated = await read('data/chemistry/generatedSmiles.json');
} catch {
  // generatedSmiles.json is optional (produced by the gap-fill batches)
}

// Build title -> smiles index from titleIupacSmiles.json
const byTitle = new Map();
for (const d of titleMapRaw.drugs ?? []) {
  if (d?.title && d?.smiles) byTitle.set(norm(d.title), d.smiles);
}
// Build iupac -> smiles index
const byIupac = new Map();
for (const [k, v] of Object.entries(iupacMap)) {
  if (v) byIupac.set(norm(k), v);
}

const resolution = [];
const gaps = [];

for (const s of substances) {
  const id = s.id;
  const slug = s.slug;
  const title = s.title;
  const ident = s.identification ?? {};
  const candidates = [
    title,
    ident.common_name,
    ident.substitutive_name,
    ...(Array.isArray(ident.alternative_names) ? ident.alternative_names : []),
  ].filter(Boolean);

  let smiles = null;
  let source = null;

  if (typeof ident.smiles === 'string' && ident.smiles.trim()) {
    smiles = ident.smiles.trim();
    source = 'identification.smiles';
  } else if (ident.smiles && typeof ident.smiles === 'object' && ident.smiles.components) {
    // multi-component preparation (e.g. Ayahuasca, Lean) — keep the components object;
    // the renderer draws the principal (first) component.
    smiles = ident.smiles;
    source = 'identification.smiles.components';
  }
  if (!smiles && generated.entries?.[slug]?.smiles) {
    smiles = generated.entries[slug].smiles;
    source = 'generatedSmiles';
  }
  if (!smiles) {
    for (const c of candidates) {
      const hit = byTitle.get(norm(c));
      if (hit) { smiles = hit; source = 'titleIupacSmiles'; break; }
    }
  }
  if (!smiles && ident.iupac_name) {
    const hit = byIupac.get(norm(ident.iupac_name));
    if (hit) { smiles = hit; source = 'iupacSmilesMap'; }
  }

  const entry = { id, slug, title, smiles, source };
  resolution.push(entry);
  if (!smiles) {
    gaps.push({
      id, slug, title,
      common_name: ident.common_name || '',
      iupac_name: ident.iupac_name || '',
      classification: s.classification?.chemical_class || s.classification?.psychoactive_class || [],
    });
  }
}

const withSmiles = resolution.filter((r) => r.smiles).length;
const bySource = resolution.reduce((acc, r) => {
  if (r.source) acc[r.source] = (acc[r.source] || 0) + 1;
  return acc;
}, {});

await writeFile(
  path.join(ROOT, 'data/chemistry/smiles-coverage.json'),
  JSON.stringify(resolution, null, 2),
);
await writeFile(
  path.join(ROOT, 'data/chemistry/smiles-gaps.json'),
  JSON.stringify(gaps, null, 2),
);

console.log(`Total substances:   ${substances.length}`);
console.log(`With SMILES:        ${withSmiles}`);
console.log(`Missing SMILES:     ${gaps.length}`);
console.log('By source:', JSON.stringify(bySource));
console.log('Wrote data/chemistry/smiles-coverage.json and smiles-gaps.json');
