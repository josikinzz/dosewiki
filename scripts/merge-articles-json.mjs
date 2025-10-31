import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const articlesPath = path.join(repoRoot, 'src/data/articles.json');
const fragmentsDir = path.join(repoRoot, 'notes and plans/articles-json');

async function loadArticles() {
  const raw = await fs.readFile(articlesPath, 'utf8');
  const parsed = JSON.parse(raw);

  if (!Array.isArray(parsed)) {
    throw new Error(`Expected array from ${articlesPath}`);
  }

  return parsed;
}

async function loadFragments() {
  const entries = await fs.readdir(fragmentsDir, { withFileTypes: true });
  const fragments = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;

    const fragmentPath = path.join(fragmentsDir, entry.name);
    const raw = await fs.readFile(fragmentPath, 'utf8');
    const fragment = JSON.parse(raw);

    fragments.push({ fragment, name: entry.name });
  }

  return fragments;
}

async function mergeArticles() {
  const articles = await loadArticles();
  const byId = new Map(articles.map((article) => [String(article.id), article]));

  const fragments = await loadFragments();
  let updatedCount = 0;
  let skippedMissingId = 0;
  let skippedUnknownId = 0;

  for (const { fragment, name } of fragments) {
    const id = fragment?.id;

    if (id === undefined || id === null) {
      console.warn(`⚠️  Skipping ${name}: missing id`);
      skippedMissingId += 1;
      continue;
    }

    const key = String(id);

    if (!byId.has(key)) {
      console.warn(`⚠️  Skipping ${name}: no existing article with id ${key}`);
      skippedUnknownId += 1;
      continue;
    }

    byId.set(key, fragment);
    updatedCount += 1;
  }

  const merged = Array.from(byId.values()).sort((a, b) => Number(a.id) - Number(b.id));
  await fs.writeFile(articlesPath, `${JSON.stringify(merged, null, 2)}\n`);

  console.log(`✅ Updated ${updatedCount} article${updatedCount === 1 ? '' : 's'} in ${articlesPath}`);

  if (skippedMissingId) {
    console.warn(`⚠️  ${skippedMissingId} fragment${skippedMissingId === 1 ? '' : 's'} skipped for missing id`);
  }

  if (skippedUnknownId) {
    console.warn(`⚠️  ${skippedUnknownId} fragment${skippedUnknownId === 1 ? '' : 's'} skipped for unknown id`);
  }
}

mergeArticles().catch((error) => {
  console.error('❌ Failed to merge articles:', error);
  process.exitCode = 1;
});
