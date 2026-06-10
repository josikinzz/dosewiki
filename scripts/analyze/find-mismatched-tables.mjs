#!/usr/bin/env node
/**
 * Find substances with mismatched dosage/duration tables
 * - Has dosage but no duration
 * - Has duration but no dosage
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const articles = JSON.parse(fs.readFileSync(path.join(ROOT, "src/data/SubstanceIndex.json"), "utf-8"));
const parsed = JSON.parse(fs.readFileSync(path.join(ROOT, "src/data/parsed-sources.json"), "utf-8"));

import { slugify } from "../lib/slug.mjs";

// Popular substances to prioritize
const POPULAR = new Set([
  "lsd", "mdma", "psilocybin-mushrooms", "cocaine", "cannabis", "ketamine",
  "amphetamine", "methamphetamine", "dmt", "2c-b", "ghb", "gbl", "alcohol",
  "nicotine", "caffeine", "heroin", "morphine", "codeine", "oxycodone",
  "diazepam", "alprazolam", "clonazepam", "lorazepam", "nitrous",
  "dextromethorphan", "kratom", "salvia", "mescaline", "pcp", "mxe",
  "4-aco-dmt", "1p-lsd", "al-lad", "eth-lad", "ayahuasca", "ibogaine",
  "psilocin", "4-ho-met", "2c-e", "2c-i", "dom", "dob", "25i-nbome",
  "methadone", "fentanyl", "hydrocodone", "tramadol", "gabapentin",
  "pregabalin", "phenibut", "ghb", "1-4-butanediol", "diphenhydramine",
  "dxm", "lsa", "morning-glory", "hawaiian-baby-woodrose"
]);

const hasDosageNoDuration = [];
const hasDurationNoDosage = [];

for (const article of articles) {
  const slug = slugify(article.title);
  const hasDosage = article.dosage?.routes?.length > 0;
  const hasDuration = article.duration?.routes?.length > 0;
  const isPopular = POPULAR.has(slug);

  // Check parsed sources
  const parsedData = parsed.substances[slug];
  const parsedHasDosage = parsedData?.dosage?.length > 0;
  const parsedHasDuration = parsedData?.duration?.length > 0;

  // Check if source file exists
  const sourceFile = path.join(ROOT, "src/data/article-sources", `${slug}.ts`);
  const hasSourceFile = fs.existsSync(sourceFile);

  if (hasDosage && !hasDuration) {
    hasDosageNoDuration.push({
      title: article.title,
      slug,
      isPopular,
      dosageRoutes: article.dosage.routes.map(r => r.route),
      parsedHasDuration,
      hasSourceFile
    });
  }

  if (hasDuration && !hasDosage) {
    hasDurationNoDosage.push({
      title: article.title,
      slug,
      isPopular,
      durationRoutes: article.duration.routes.map(r => r.route),
      parsedHasDosage,
      hasSourceFile
    });
  }
}

// Sort by popular first
const sortByPopular = (a, b) => {
  if (a.isPopular && !b.isPopular) return -1;
  if (!a.isPopular && b.isPopular) return 1;
  return a.title.localeCompare(b.title);
};

hasDosageNoDuration.sort(sortByPopular);
hasDurationNoDosage.sort(sortByPopular);

console.log("╔════════════════════════════════════════════════════════════════════╗");
console.log("║           MISMATCHED DOSAGE/DURATION TABLES                        ║");
console.log("╚════════════════════════════════════════════════════════════════════╝\n");

console.log("┌────────────────────────────────────────────────────────────────────┐");
console.log("│                         SUMMARY                                    │");
console.log("├────────────────────────────────────────────────────────────────────┤");
console.log(`│  Has DOSAGE but NO DURATION:                    ${String(hasDosageNoDuration.length).padStart(3)}               │`);
console.log(`│  Has DURATION but NO DOSAGE:                    ${String(hasDurationNoDosage.length).padStart(3)}               │`);
console.log(`│  ────────────────────────────────────────────────────────────────  │`);
console.log(`│  Popular substances affected:                   ${String(hasDosageNoDuration.filter(x => x.isPopular).length + hasDurationNoDosage.filter(x => x.isPopular).length).padStart(3)}               │`);
console.log("└────────────────────────────────────────────────────────────────────┘\n");

// Output for agent investigation
console.log("═══════════════════════════════════════════════════════════════════");
console.log("HAS DOSAGE BUT NO DURATION:");
console.log("═══════════════════════════════════════════════════════════════════\n");

for (const item of hasDosageNoDuration) {
  const popular = item.isPopular ? "⭐ " : "   ";
  const parsedInfo = item.parsedHasDuration ? "✓ parsed has duration" : "✗ parsed also missing";
  const sourceInfo = item.hasSourceFile ? "has source file" : "NO SOURCE FILE";
  console.log(`${popular}${item.title}`);
  console.log(`     Slug: ${item.slug}`);
  console.log(`     Dosage routes: ${item.dosageRoutes.join(", ")}`);
  console.log(`     ${parsedInfo} | ${sourceInfo}`);
  console.log("");
}

console.log("\n═══════════════════════════════════════════════════════════════════");
console.log("HAS DURATION BUT NO DOSAGE:");
console.log("═══════════════════════════════════════════════════════════════════\n");

for (const item of hasDurationNoDosage) {
  const popular = item.isPopular ? "⭐ " : "   ";
  const parsedInfo = item.parsedHasDosage ? "✓ parsed has dosage" : "✗ parsed also missing";
  const sourceInfo = item.hasSourceFile ? "has source file" : "NO SOURCE FILE";
  console.log(`${popular}${item.title}`);
  console.log(`     Slug: ${item.slug}`);
  console.log(`     Duration routes: ${item.durationRoutes.join(", ")}`);
  console.log(`     ${parsedInfo} | ${sourceInfo}`);
  console.log("");
}

// Output JSON for agents
const outputData = {
  hasDosageNoDuration: hasDosageNoDuration.map(x => ({
    title: x.title,
    slug: x.slug,
    isPopular: x.isPopular,
    parsedHasDuration: x.parsedHasDuration,
    hasSourceFile: x.hasSourceFile
  })),
  hasDurationNoDosage: hasDurationNoDosage.map(x => ({
    title: x.title,
    slug: x.slug,
    isPopular: x.isPopular,
    parsedHasDosage: x.parsedHasDosage,
    hasSourceFile: x.hasSourceFile
  }))
};

fs.writeFileSync(
  path.join(ROOT, "scripts/mismatched-tables.json"),
  JSON.stringify(outputData, null, 2)
);
console.log("\n📁 Data written to scripts/mismatched-tables.json for agent investigation");
