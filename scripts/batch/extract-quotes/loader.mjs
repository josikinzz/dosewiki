import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";

import { BackendClient } from "../../lib/data-client.ts";

import { api } from "../../../lib/postgres/runtime/api.ts"
import { CONFIG } from "./cli.mjs";
import { CATEGORIES } from "./categories.mjs";
import {
  getArticleSourceDocumentSizeBytes,
  getLocalArticleSourceFileSize,
  loadLocalArticleSourceDocument,
  normalizeArticleSourceDocument,
} from "../../article-source-documents/contract.mjs";

export function titleToSlug(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function loadPrompt(category) {
  const config = CATEGORIES[category];
  const promptPath = join(CONFIG.promptsDir, config.promptFile);
  if (!existsSync(promptPath)) {
    throw new Error(`Prompt file not found: ${promptPath}`);
  }
  return readFileSync(promptPath, "utf-8");
}

export function getPrioritySlugs() {
  if (!existsSync(CONFIG.articlesFile)) {
    throw new Error(`SubstanceIndex.json not found at ${CONFIG.articlesFile}`);
  }

  const articles = JSON.parse(readFileSync(CONFIG.articlesFile, "utf-8"));
  return articles
    .filter((article) => article.priority === "high" || article.priority === "normal")
    .map((article) => titleToSlug(article.title))
    .sort();
}

export function getSourceFileSize(slug) {
  const filePath = join(CONFIG.sourcesDir, `${slug}.ts`);
  return getLocalArticleSourceFileSize(filePath);
}

export function findLargeFiles(slugs) {
  return slugs
    .map((slug) => ({ slug, size: getSourceFileSize(slug) }))
    .filter((entry) => entry.size > CONFIG.largeFileThreshold)
    .map((entry) => ({ slug: entry.slug, size: Math.round(entry.size / 1024) }));
}

export function loadSourceFile(slug) {
  const filePath = join(CONFIG.sourcesDir, `${slug}.ts`);
  return loadLocalArticleSourceDocument(filePath, slug);
}

export function createPostgresClient(url, { Client = BackendClient } = {}) {
  return new Client(url);
}

export async function loadPostgresArticleSourceDocument(client, slug) {
  const sourceDoc = await client.query(api.articleSources.getBySlug, {
    slug,
    apiKey: process.env.DATA_ADMIN_TOKEN_ARTICLE_SOURCE_MIGRATION ?? process.env.DATA_ADMIN_KEY,
  });
  return sourceDoc
    ? normalizeArticleSourceDocument(sourceDoc, { slug, adapter: "postgres" })
    : null;
}

export async function loadPostgresArticleSourceSlugs(client) {
  const slugs = [];
  let cursor = undefined;
  let isDone = false;

  while (!isDone) {
    const result = await client.query(api.articleSources.getSubstanceList, {
      apiKey: process.env.DATA_ADMIN_TOKEN_ARTICLE_SOURCE_MIGRATION ?? process.env.DATA_ADMIN_KEY,
      cursor,
      limit: 100,
    });
    slugs.push(...result.items.map((item) => item.slug));
    cursor = result.cursor ?? undefined;
    isDone = result.isDone;
  }

  return slugs.sort();
}

export async function getPostgresArticleSourceSize(client, slug) {
  const doc = await loadPostgresArticleSourceDocument(client, slug);
  return doc ? getArticleSourceDocumentSizeBytes(doc) : 0;
}

export async function loadExistingQuoteSlugs(client, category) {
  const config = CATEGORIES[category];
  const metadata = await client.query(api.quotes.getAllMetadata, {});
  return new Set(
    metadata
      .filter((quote) => quote.section === config.section)
      .map((quote) => quote.slug),
  );
}

export function getConfiguredOutputFiles(category) {
  const config = CATEGORIES[category];
  const outputDir = join(CONFIG.projectRoot, config.outputDir);
  if (!existsSync(outputDir)) {
    return new Set();
  }
  return new Set(readdirSync(outputDir));
}
