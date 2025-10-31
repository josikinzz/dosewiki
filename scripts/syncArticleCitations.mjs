#!/usr/bin/env node
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const unifiedArticlesPath = path.join(repoRoot, 'src/data/articles.json');
const perArticleDir = path.join(repoRoot, 'notes and plans/articles-json');

function normalizeUrl(value) {
  if (typeof value !== 'string') {
    return '';
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }
  try {
    const parsed = new URL(trimmed);
    const pathname = parsed.pathname.replace(/\/+$/, '');
    return `${parsed.protocol.toLowerCase()}//${parsed.host.toLowerCase()}${pathname}${parsed.search}${parsed.hash}`;
  } catch (error) {
    return trimmed.replace(/\/+$/, '');
  }
}

async function loadUnifiedArticles() {
  const raw = await readFile(unifiedArticlesPath, 'utf8');
  const articles = JSON.parse(raw);
  const byId = new Map();
  for (const article of articles) {
    if (article && typeof article.id === 'number') {
      byId.set(article.id, article);
    }
  }
  return byId;
}

async function syncCitations(articleMap) {
  const entries = await readdir(perArticleDir, { withFileTypes: true });
  const changed = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) {
      continue;
    }

    const filePath = path.join(perArticleDir, entry.name);
    const fileRaw = await readFile(filePath, 'utf8');
    const article = JSON.parse(fileRaw);

    if (!article || typeof article.id !== 'number') {
      continue;
    }

    const unifiedArticle = articleMap.get(article.id);
    if (!unifiedArticle) {
      continue;
    }

    const unifiedCitations = unifiedArticle?.drug_info?.citations ?? [];
    if (!Array.isArray(unifiedCitations) || unifiedCitations.length === 0) {
      continue;
    }

    if (!article.drug_info) {
      article.drug_info = {};
    }

    if (!Array.isArray(article.drug_info.citations)) {
      article.drug_info.citations = [];
    }

    const existing = new Set(
      article.drug_info.citations
        .map((citation) => normalizeUrl(citation?.reference))
        .filter(Boolean)
    );

    const missing = [];
    for (const citation of unifiedCitations) {
      const normalized = normalizeUrl(citation?.reference);
      if (normalized && !existing.has(normalized)) {
        missing.push(citation);
        existing.add(normalized);
      }
    }

    if (missing.length > 0) {
      article.drug_info.citations.push(...missing);
      await writeFile(filePath, `${JSON.stringify(article, null, 2)}\n`);
      changed.push({ file: entry.name, added: missing.length });
    }
  }

  return changed;
}

(async () => {
  try {
    const articleMap = await loadUnifiedArticles();
    const changes = await syncCitations(articleMap);

    if (changes.length === 0) {
      console.log('No citation updates were required.');
      return;
    }

    const totalAdded = changes.reduce((sum, item) => sum + item.added, 0);
    console.log(`Added ${totalAdded} citations across ${changes.length} files.`);
    for (const change of changes) {
      console.log(`  • ${change.file}: +${change.added}`);
    }
  } catch (error) {
    console.error('Failed to sync citations:', error);
    process.exitCode = 1;
  }
})();
