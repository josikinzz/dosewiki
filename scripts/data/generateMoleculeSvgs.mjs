#!/usr/bin/env node
/**
 * End-to-end molecule art pipeline:
 *   1. resolve a SMILES for every substance (inline + generatedSmiles + maps)  -> coverage
 *   2. render one consistent, brand-coloured SVG per substance from SMILES (RDKit)
 *   3. rewrite src/data/mappings/moleculeSvgMappings.json for the new <slug>.svg files
 *   4. rebuild the public download pack (manifest JSON; the ZIP is built by the npm script)
 *
 * Requires a Python env with RDKit. Point at it with MOLECULE_PYTHON
 * (default: .venv-molecules/bin/python). Set up with `npm run molecules:setup-venv`.
 *
 * Usage: node scripts/data/generateMoleculeSvgs.mjs
 */
import { readFile, writeFile } from 'fs/promises';
import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const PY = process.env.MOLECULE_PYTHON || path.join(ROOT, '.venv-molecules/bin/python');
const RENDER_INPUT = path.join(ROOT, 'notes-and-plans/reports/molecule-render-input.json');
const RENDER_REPORT = path.join(ROOT, 'notes-and-plans/reports/molecule-render-report.json');

const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit' });
  if (r.status !== 0) {
    console.error(`\nStep failed: ${cmd} ${args.join(' ')}`);
    process.exit(r.status ?? 1);
  }
};

// 1. coverage
run('node', ['scripts/data/resolveSmilesCoverage.mjs']);

// 2. build render input from coverage (key = slug)
const coverage = JSON.parse(await readFile(path.join(ROOT, 'notes-and-plans/reports/smiles-coverage.json'), 'utf8'));
const items = coverage.filter((r) => r.smiles).map((r) => ({ key: r.slug, title: r.title, smiles: r.smiles }));
await writeFile(RENDER_INPUT, JSON.stringify(items));
console.log(`\nPrepared render input: ${items.length} molecules`);

// 3. render SVGs into public/molecules
run(PY, [
  'scripts/chemistry/render_molecules.py',
  '--input', RENDER_INPUT,
  '--outdir', 'public/molecules',
  '--report', RENDER_REPORT,
]);

// 4. rewrite mapping + download manifest
run('node', ['scripts/data/buildMoleculeMappings.mjs', path.relative(ROOT, RENDER_REPORT)]);
run('node', ['scripts/data/buildMoleculeDownloadPack.mjs']);

console.log('\nDone. Build the ZIP with: npm run molecules:pack');
