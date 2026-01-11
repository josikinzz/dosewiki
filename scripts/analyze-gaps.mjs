#!/usr/bin/env node
/**
 * Analyze gaps between articles.json and parsed-sources.json
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const articles = JSON.parse(fs.readFileSync(path.join(ROOT, "src/data/articles.json"), "utf-8"));
const parsed = JSON.parse(fs.readFileSync(path.join(ROOT, "src/data/parsed-sources.json"), "utf-8"));

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

const emptyDosage = [];
const emptyDuration = [];
const couldFillDosage = [];
const couldFillDuration = [];

for (const article of articles) {
  const slug = slugify(article.title);
  const parsedData = parsed.substances[slug];

  const hasDosage = article.dosage?.routes?.length > 0;
  const hasDuration = article.duration?.routes?.length > 0;
  const parsedHasDosage = parsedData?.dosage?.length > 0;
  const parsedHasDuration = parsedData?.duration?.length > 0;

  if (!hasDosage) {
    emptyDosage.push(article.title);
    if (parsedHasDosage) {
      couldFillDosage.push(article.title);
    }
  }

  if (!hasDuration) {
    emptyDuration.push(article.title);
    if (parsedHasDuration) {
      couldFillDuration.push(article.title);
    }
  }
}

console.log("=== CURRENT STATE ===");
console.log("Total articles:", articles.length);
console.log("With dosage:", articles.length - emptyDosage.length);
console.log("With duration:", articles.length - emptyDuration.length);
console.log("");
console.log("=== EMPTY ARTICLES ===");
console.log("Missing dosage:", emptyDosage.length);
console.log("Missing duration:", emptyDuration.length);
console.log("");
console.log("=== COULD BE FILLED (have parsed data) ===");
console.log("Dosage fillable:", couldFillDosage.length);
console.log("Duration fillable:", couldFillDuration.length);

if (couldFillDosage.length > 0) {
  console.log("");
  console.log("Articles that would get NEW dosage:");
  couldFillDosage.forEach(t => console.log("  -", t));
}

if (couldFillDuration.length > 0) {
  console.log("");
  console.log("Articles that would get NEW duration:");
  couldFillDuration.forEach(t => console.log("  -", t));
}

// Also check parsed-sources stats
console.log("");
console.log("=== PARSED SOURCES STATS ===");
const substances = Object.keys(parsed.substances);
const withDosage = substances.filter(s => parsed.substances[s].dosage?.length > 0);
const withDuration = substances.filter(s => parsed.substances[s].duration?.length > 0);
console.log("Total parsed substances:", substances.length);
console.log("With dosage data:", withDosage.length);
console.log("With duration data:", withDuration.length);
