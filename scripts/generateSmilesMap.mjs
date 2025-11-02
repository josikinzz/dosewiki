#!/usr/bin/env node

import { readFile, writeFile, access } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const ARTICLES_PATH = path.join(ROOT_DIR, 'src/data/articles.json');
const OUTPUT_PATH = path.join(ROOT_DIR, 'src/data/iupacSmilesMap.json');
const COMMENT_KEY = '//';
const COMMENT_VALUE = 'Mapping of IUPAC names to SMILES strings resolved via OPSIN (https://www.ebi.ac.uk/opsin/). Null values indicate no SMILES was returned; mixture entries expose a components object keyed by compound name.';
const WAIT_BETWEEN_REQUESTS_MS = Number(process.env.SMILES_REQUEST_DELAY_MS ?? 250);
const OPSIN_BASE_URL = 'https://www.ebi.ac.uk/opsin/ws';

const force = process.argv.includes('--force');
const dryRun = process.argv.includes('--dry-run');

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function loadArticles() {
  const raw = await readFile(ARTICLES_PATH, 'utf8');
  const data = JSON.parse(raw);
  if (!Array.isArray(data)) {
    throw new Error('Expected articles.json to export an array');
  }
  return data;
}

function extractUniqueIupacNames(articles) {
  const names = new Set();
  for (const article of articles) {
    const iupac = article?.drug_info?.IUPAC_name;
    if (typeof iupac !== 'string') continue;
    const trimmed = iupac.trim();
    if (!trimmed) continue;
    names.add(trimmed);
  }
  return Array.from(names).sort((a, b) => a.localeCompare(b));
}

async function loadExistingMap() {
  if (!(await fileExists(OUTPUT_PATH))) {
    return {};
  }
  const raw = await readFile(OUTPUT_PATH, 'utf8');
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const { [COMMENT_KEY]: _comment, ...existingEntries } = parsed;
      return existingEntries;
    }
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
    const sortedEntries = Object.entries(smilesMap).sort((a, b) => a[0].localeCompare(b[0]));
    const orderedMap = Object.fromEntries(sortedEntries);
    const outputObject = {
      [COMMENT_KEY]: COMMENT_VALUE,
      ...orderedMap,
    };
    const output = JSON.stringify(outputObject, null, 2);
    await writeFile(OUTPUT_PATH, `${output}\n`, 'utf8');
    console.log(`Wrote SMILES map to ${path.relative(ROOT_DIR, OUTPUT_PATH)}`);
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
