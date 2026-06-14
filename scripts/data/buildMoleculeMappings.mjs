#!/usr/bin/env node
/**
 * Rewrite src/data/mappings/moleculeSvgMappings.json so every substance whose molecule
 * SVG was successfully generated points at its `<slug>.svg`. Reads the renderer report
 * (rendered slugs) and the SMILES coverage (for source + represents metadata).
 *
 * Run AFTER scripts/chemistry/render_molecules.py has written into public/molecules.
 */
import { readFile, writeFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const read = async (p) => JSON.parse(await readFile(path.join(ROOT, p), 'utf8'));

const REPORT = process.argv[2] || 'notes-and-plans/reports/molecule-render-report.json';

const substances = await read('src/data/SubstanceIndex.json');
const coverage = await read('notes-and-plans/reports/smiles-coverage.json');
const report = await read(REPORT);
let generated = { entries: {} };
try { generated = await read('src/data/mappings/generatedSmiles.json'); } catch { /* optional */ }

const renderedSlugs = new Set(report.rendered_slugs ?? []);
const coverageBySlug = new Map(coverage.map((r) => [r.slug, r]));

const mappings = [];
let matched = 0;
for (const s of substances) {
  if (!renderedSlugs.has(s.slug)) continue;
  const cov = coverageBySlug.get(s.slug);
  const gen = generated.entries?.[s.slug];
  const entry = {
    filename: `${s.slug}.svg`,
    articleId: s.id,
    articleTitle: s.title,
    matchedField: 'smiles',
    matchedValue: s.title,
    resolution: 'generated-from-smiles',
  };
  if (cov?.source) entry.smilesSource = cov.source;
  if (gen?.represents) entry.represents = gen.represents; // active molecule for plants/brands
  mappings.push(entry);
  matched += 1;
}

const out = {
  _meta: {
    description:
      'Maps molecule SVG filenames to article entries from src/data/SubstanceIndex.json. ' +
      'One SVG per article, named <slug>.svg, generated from SMILES via ' +
      'scripts/chemistry/render_molecules.py. `represents` names the active molecule when ' +
      'the substance is a plant, preparation, or brand name.',
    generator: 'scripts/data/buildMoleculeMappings.mjs',
    totalSvgFiles: matched,
    matchedCount: matched,
    unmatchedCount: substances.length - matched,
  },
  mappings,
};

await writeFile(
  path.join(ROOT, 'src/data/mappings/moleculeSvgMappings.json'),
  JSON.stringify(out, null, 2) + '\n',
);
console.log(`Wrote ${matched} mappings (of ${substances.length} substances) to moleculeSvgMappings.json`);
const missing = substances.filter((s) => !renderedSlugs.has(s.slug)).map((s) => s.title);
console.log(`No molecule (no SMILES): ${missing.length} -> ${missing.join(', ')}`);
