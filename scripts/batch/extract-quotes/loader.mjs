import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";

import { CONFIG } from "./cli.mjs";
import { CATEGORIES } from "./categories.mjs";
import {
  getLocalArticleSourceFileSize,
  loadLocalArticleSourceDocument,
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

export function getConfiguredOutputFiles(category) {
  const config = CATEGORIES[category];
  const outputDir = join(CONFIG.projectRoot, config.outputDir);
  if (!existsSync(outputDir)) {
    return new Set();
  }
  return new Set(readdirSync(outputDir));
}
