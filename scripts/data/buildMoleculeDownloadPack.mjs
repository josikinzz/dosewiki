#!/usr/bin/env node
/**
 * Build the public molecule download pack referenced from the About page:
 *   public/dosewiki-molecules.json  — manifest: slug, title, filename, smiles, represents, source
 * (The SVG ZIP is assembled separately with `zip` in the npm script.)
 */
import { readFile, writeFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const read = async (p) => JSON.parse(await readFile(path.join(ROOT, p), 'utf8'));

const mapping = await read('src/data/mappings/moleculeSvgMappings.json');
const coverage = await read('notes-and-plans/reports/smiles-coverage.json');
let generated = { entries: {} };
try { generated = await read('src/data/mappings/generatedSmiles.json'); } catch { /* optional */ }

const covBySlug = new Map();
for (const r of coverage) covBySlug.set(r.slug, r);
const slugFromFilename = (f) => f.replace(/\.svg$/, '');

const molecules = mapping.mappings
  .map((m) => {
    const slug = slugFromFilename(m.filename);
    const cov = covBySlug.get(slug);
    const gen = generated.entries?.[slug];
    const smiles = cov?.smiles;
    return {
      slug,
      title: m.articleTitle,
      filename: m.filename,
      smiles: typeof smiles === 'string' ? smiles : (smiles?.components ?? null),
      represents: m.represents ?? gen?.represents ?? '',
      source: cov?.source ?? '',
    };
  })
  .sort((a, b) => a.slug.localeCompare(b.slug));

const out = {
  __comment:
    'dose.wiki molecule pack manifest. Every consistent, brand-coloured molecule SVG in ' +
    'public/molecules was generated from the listed SMILES with RDKit (CoordGen layout + ' +
    'scaffold-template orientation + element colour-coding). `represents` names the active ' +
    'molecule when the substance is a plant, preparation, or brand name. ' +
    'Pack ZIP: /dosewiki-molecules.zip',
  count: molecules.length,
  license: 'CC0 1.0 (public domain) — dose.wiki-generated artwork; credit appreciated, not required',
  molecules,
};

await writeFile(path.join(ROOT, 'public/dosewiki-molecules.json'), JSON.stringify(out, null, 2) + '\n');
console.log(`Wrote public/dosewiki-molecules.json with ${molecules.length} molecules`);
