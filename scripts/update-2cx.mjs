#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const TARGET_CLASS_KEY = "2c-x";
const CLASS_REPLACEMENT = "2C-X, phenethylamine";
const CATEGORY_LABEL = "2C-X";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../");
const dataPath = path.resolve(root, "src/data/articles.json");

const normalizeKey = (value) =>
  value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .trim();

const cleanString = (value) => {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : "";
};

const splitClass = (value) => {
  const cleaned = cleanString(value);
  if (!cleaned) {
    return [];
  }
  return cleaned.split(/[;,/]/).map((segment) => segment.trim()).filter(Boolean);
};

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

let matched = 0;
let updated = 0;
const updatedNames = [];

for (const article of articles) {
  const info = article?.drug_info;
  if (!info) {
    continue;
  }

  const classes = splitClass(info.chemical_class);
  const hasTargetClass = classes.some((entry) => normalizeKey(entry) === TARGET_CLASS_KEY);

  if (!hasTargetClass) {
    continue;
  }

  matched += 1;
  let changed = false;

  if (info.chemical_class !== CLASS_REPLACEMENT) {
    info.chemical_class = CLASS_REPLACEMENT;
    changed = true;
  }

  const categories = Array.isArray(info.categories) ? info.categories.slice() : [];
  const categorySet = new Set(categories.map((category) => normalizeKey(category)));
  if (!categorySet.has(normalizeKey(CATEGORY_LABEL))) {
    categories.push(CATEGORY_LABEL);
    info.categories = categories;
    changed = true;
  }

  if (changed) {
    updated += 1;
    const name = info.drug_name ?? article.title ?? `(id:${article?.id ?? "unknown"})`;
    updatedNames.push(name);
  }
}

if (updated > 0) {
  writeArticles(articles);
}

console.log(
  JSON.stringify(
    {
      matched,
      updated,
      updatedNames,
    },
    null,
    2,
  ),
);
