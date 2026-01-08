#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const TARGET_CLASS = "Mescaline homologues, Phenethylamines";
const TARGETS = [
  "Mescaline",
  "AEM (α-Ethylmescaline, 2-Amino-1-(3,4,5-trimethoxyphenyl)butane)",
  "Methallylescaline (MAL)",
];

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../");
const dataPath = path.resolve(root, "src/data/articles.json");

const normalize = (value) =>
  value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .trim();

const readArticles = () => JSON.parse(fs.readFileSync(dataPath, "utf8"));
const writeArticles = (articles) => fs.writeFileSync(dataPath, `${JSON.stringify(articles, null, 2)}\n`, "utf8");

const lookup = new Set(TARGETS.map(normalize));

const articles = readArticles();
const updated = [];

articles.forEach((article) => {
  const info = article?.drug_info;
  if (!info) return;
  const name = info.drug_name ?? article.title;
  if (!name) return;
  if (!lookup.has(normalize(name))) return;
  if (info.chemical_class === TARGET_CLASS) return;
  info.chemical_class = TARGET_CLASS;
  updated.push(name);
});

if (updated.length > 0) {
  writeArticles(articles);
}

console.log(JSON.stringify({ updatedCount: updated.length, updatedNames: updated }, null, 2));
