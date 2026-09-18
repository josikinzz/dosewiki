#!/usr/bin/env node

import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { createOpsinSmilesMapAdapter } from '../chemistry/identifier-provenance.mjs';
import { tryWriteArtifactLineageSidecar } from '../lib/data-artifact-lineage.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../..');
const ARTICLES_PATH = path.join(ROOT_DIR, 'public/SubstanceIndex.json');
const smilesMapAdapter = createOpsinSmilesMapAdapter({ rootDir: ROOT_DIR });
const WAIT_BETWEEN_REQUESTS_MS = Number(process.env.SMILES_REQUEST_DELAY_MS ?? 250);
const OPSIN_BASE_URL = 'https://www.ebi.ac.uk/opsin/ws';

const force = process.argv.includes('--force');
const dryRun = process.argv.includes('--dry-run');

async function loadArticles() {
  const raw = await readFile(ARTICLES_PATH, 'utf8');
  const data = JSON.parse(raw);
  if (!Array.isArray(data)) {
    throw new Error('Expected SubstanceIndex.json to export an array');
  }
  return data;
}

function extractUniqueIupacNames(articles) {
  const names = new Set();
  for (const article of articles) {
    // SubstanceArticle schema: identification.iupac_name
    const iupac = article?.identification?.iupac_name;
    if (typeof iupac !== 'string') continue;
    const trimmed = iupac.trim();
    if (!trimmed) continue;
    names.add(trimmed);
  }
  return Array.from(names).sort((a, b) => a.localeCompare(b));
}

async function loadExistingMap() {
  try {
    return await smilesMapAdapter.readEntries();
  } catch (error) {
    console.warn('Failed to parse existing map, starting fresh:', error.message);
  }
  return {};
}

async function fetchSmiles(iupac) {
  const encoded = encodeURIComponent(iupac);
  const url = `${OPSIN_BASE_URL}/${encoded}.smi`;
  const response = await fetch(url, {
    headers: {
      Accept: 'text/plain',
    },
  });

  if (response.status === 404) {
    console.warn(`SMILES not found for IUPAC: ${iupac}`);
    return null;
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Failed to fetch SMILES for ${iupac}: ${response.status} ${response.statusText}\n${body}`);
  }

  const text = await response.text();
  const smiles = text.trim();
  return smiles || null;
}

async function delay(ms) {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function buildSmilesMap() {
  console.log('Loading articles…');
  const articles = await loadArticles();
  const uniqueIupacNames = extractUniqueIupacNames(articles);
  console.log(`Found ${uniqueIupacNames.length} unique IUPAC names.`);

  const smilesMap = await loadExistingMap();
  const totalToFetch = uniqueIupacNames.length;
  let fetchedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  for (const iupac of uniqueIupacNames) {
    if (!force && Object.prototype.hasOwnProperty.call(smilesMap, iupac)) {
      skippedCount += 1;
      continue;
    }

    try {
      if (dryRun) {
        console.log(`[dry-run] Would fetch SMILES for: ${iupac}`);
      } else {
        const smiles = await fetchSmiles(iupac);
        smilesMap[iupac] = smiles;
        if (smiles) {
          fetchedCount += 1;
          console.log(`✔︎ ${iupac}`);
        } else {
          errorCount += 1;
        }
        await delay(WAIT_BETWEEN_REQUESTS_MS);
      }
    } catch (error) {
      errorCount += 1;
      console.error(`Error fetching ${iupac}:`, error.message);
    }
  }

  if (!dryRun) {
    await smilesMapAdapter.writeEntries(smilesMap);
    console.log(`Wrote SMILES map to ${smilesMapAdapter.relativePath}`);
    const lineage = tryWriteArtifactLineageSidecar({
      artifactPath: smilesMapAdapter.artifactPath,
      rootDir: ROOT_DIR,
      sourceDeployment: 'public/SubstanceIndex.json and OPSIN',
      schemaVersion: 'scripts/chemistry/identifier-provenance.mjs',
      extra: {
        totalUniqueIupacNames: totalToFetch,
        fetchedCount,
        skippedCount,
        errorCount,
      },
    });
    if (lineage) {
      console.log(`Lineage metadata written to ${lineage.outputPath}`);
    }
  }

  console.log('Done.');
  console.log(`Fetched: ${fetchedCount}`);
  console.log(`Skipped: ${skippedCount}`);
  console.log(`Errors: ${errorCount}`);
  console.log(`Total unique IUPAC names: ${totalToFetch}`);
}

buildSmilesMap().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
