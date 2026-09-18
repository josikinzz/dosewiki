#!/usr/bin/env node
/**
 * Check and fix normal priority substances in a local substance export.
 *
 * Usage: node scripts/set-priority.mjs --input <local-substance-export.json>
 */

import fs from 'fs';
import path from 'path';
const inputIndex = process.argv.indexOf('--input');
if (inputIndex < 0 || !process.argv[inputIndex + 1]) {
  throw new Error('Pass --input <path> naming the local substance export to update.');
}
const articlesPath = path.resolve(process.argv[inputIndex + 1]);

// TRUE uncommon substances - only these should be normal
const trueUncommon = new Set([
  "allylescaline", "escaline", "proscaline", "5-meo-amt",
  "2c-t", "2c-t-2", "2c-t-4", "2c-t-7", "2c-t-21",
  "aleph", "aleph-2", "bromo-dragonfly", "doet", "tma-2", "tma-6"
]);

// Read articles
const articles = JSON.parse(fs.readFileSync(articlesPath, 'utf-8'));

// Find all currently normal
const currentlyNormal = articles.filter(a => a.priority === "normal");
console.log(`\nCurrently marked as NORMAL (${currentlyNormal.length}):`);
currentlyNormal.forEach(a => {
  const shouldBe = trueUncommon.has(a.title.toLowerCase()) ? "✓ correct" : "✗ should be LOW";
  console.log(`  - ${a.title} ${shouldBe}`);
});

// Fix any that shouldn't be normal
let fixed = [];
for (const article of articles) {
  if (article.priority === "normal" && !trueUncommon.has(article.title.toLowerCase())) {
    article.priority = "low";
    fixed.push(article.title);
  }
}

// Write back
fs.writeFileSync(articlesPath, JSON.stringify(articles, null, 2));

// Count by priority
const highCount = articles.filter(a => a.priority === "high").length;
const normalCount = articles.filter(a => a.priority === "normal").length;
const lowCount = articles.filter(a => a.priority === "low").length;

console.log(`\n✅ Fixed ${fixed.length} to low priority`);
console.log(`\n📊 Final priority breakdown:`);
console.log(`   High:   ${highCount}`);
console.log(`   Normal: ${normalCount}`);
console.log(`   Low:    ${lowCount}`);
console.log(`   Total:  ${articles.length}`);
