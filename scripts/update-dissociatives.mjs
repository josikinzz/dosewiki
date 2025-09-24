#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../");
const dataPath = path.resolve(root, "src/data/articles.json");

const RAW_TARGET_PSYCHO_CLASS = "Dissociative, Hallucinogen";
const RAW_MECHANISM = "NMDA receptor antagonist";
const SKIP_NAMES = new Set(["Ibogaine", "Salvinorin A"].map((name) => name.toLowerCase()));

const normalizeKey = (value) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .trim();

const readArticles = () => {
  if (!fs.existsSync(dataPath)) {
    throw new Error(`Unable to locate articles data at ${dataPath}`);
  }

  const raw = fs.readFileSync(dataPath, "utf8");
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Failed to parse articles JSON: ${error instanceof Error ? error.message : error}`);
  }
};

const writeArticles = (articles) => {
  const serialized = JSON.stringify(articles, null, 2);
  fs.writeFileSync(dataPath, `${serialized}\n`, "utf8");
};

const articles = readArticles();

let dissociativeCount = 0;
let updatedCount = 0;
const updatedNames = [];

for (const article of articles) {
  const info = article?.drug_info;
  if (!info) {
    continue;
  }

  const categories = Array.isArray(info.categories) ? info.categories : [];
  const normalizedCategories = new Set(
    categories
      .map((category) => (typeof category === "string" ? normalizeKey(category) : ""))
      .filter(Boolean),
  );

  if (!normalizedCategories.has("dissociative")) {
    continue;
  }

  dissociativeCount += 1;

  const name = (info.drug_name ?? article.title ?? "").trim();
  const shouldSkip = SKIP_NAMES.has(name.toLowerCase());

  let changed = false;

  if (!shouldSkip) {
    if (info.psychoactive_class !== RAW_TARGET_PSYCHO_CLASS) {
      info.psychoactive_class = RAW_TARGET_PSYCHO_CLASS;
      changed = true;
    }

    if (info.mechanism_of_action !== RAW_MECHANISM) {
      info.mechanism_of_action = RAW_MECHANISM;
      changed = true;
    }
  }

  if (changed) {
    updatedCount += 1;
    updatedNames.push(name || `(id: ${article?.id ?? "unknown"})`);
  }
}

if (updatedCount > 0) {
  writeArticles(articles);
}

console.log(
  JSON.stringify(
    {
      totalArticles: articles.length,
      dissociativeEntries: dissociativeCount,
      updatedEntries: updatedCount,
      updatedNames,
    },
    null,
    2,
  ),
);
