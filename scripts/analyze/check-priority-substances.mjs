#!/usr/bin/env node
/**
 * Deep dive into the 8 priority substances from the Discord conversation
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const articles = JSON.parse(fs.readFileSync(path.join(ROOT, "src/data/SubstanceIndex.json"), "utf-8"));
const parsed = JSON.parse(fs.readFileSync(path.join(ROOT, "src/data/parsed-sources.json"), "utf-8"));

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// Priority substances from Discord
const PRIORITY = [
  "Nicotine",
  "Cocaine",
  "Ayahuasca",
  "Diazepam",
  "DMT",
  "Dimenhydrinate",
  "Methadone",
  "Morphine",
  // Also check these mentioned in the conversation
  "LSD",
  "MDMA",
  "Amphetamine",
  "Lisdexamfetamine",
  "4-HO-MET"
];

function countFilledTiers(doseRanges) {
  if (!doseRanges) return { count: 0, tiers: [] };
  const tierNames = ["threshold", "light", "moderate", "strong", "heavy"];
  const filled = tierNames.filter(t => {
    const tier = doseRanges[t];
    return tier && (tier.min != null || tier.max != null);
  });
  return { count: filled.length, tiers: filled };
}

function countFilledStages(stages) {
  if (!stages) return { count: 0, stages: [] };
  const stageNames = ["onset", "come_up", "peak", "offset", "after_effects", "total_duration"];
  const filled = stageNames.filter(s => {
    const stage = stages[s];
    return stage && (stage.min != null || stage.max != null);
  });
  return { count: filled.length, stages: filled };
}

console.log("╔════════════════════════════════════════════════════════════════════╗");
console.log("║          PRIORITY SUBSTANCES - DETAILED ANALYSIS                   ║");
console.log("╚════════════════════════════════════════════════════════════════════╝\n");

for (const name of PRIORITY) {
  const slug = slugify(name);
  const article = articles.find(a => slugify(a.title) === slug);
  const parsedData = parsed.substances[slug];

  console.log("═".repeat(70));
  console.log(`  ${name.toUpperCase()}`);
  console.log("═".repeat(70));

  if (!article) {
    console.log("  ❌ NO ARTICLE EXISTS\n");
    continue;
  }

  // DOSAGE ANALYSIS
  console.log("\n  📊 DOSAGE:");

  if (!article.dosage?.routes?.length) {
    console.log("     Current: ❌ NO DOSAGE DATA");
  } else {
    for (const route of article.dosage.routes) {
      const { count, tiers } = countFilledTiers(route.dose_ranges);
      const missing = ["threshold", "light", "moderate", "strong", "heavy"].filter(t => !tiers.includes(t));
      console.log(`     ${route.route}: ${count}/5 tiers`);
      console.log(`        ✓ Has: ${tiers.join(", ") || "none"}`);
      if (missing.length > 0 && missing.length < 5) {
        console.log(`        ✗ Missing: ${missing.join(", ")}`);
      }
    }
  }

  // Check what parsed-sources has
  if (parsedData?.dosage?.length) {
    console.log(`     📁 Parsed sources have: ${parsedData.dosage.length} entries`);
    const routeSet = new Set(parsedData.dosage.map(d => d.route));
    const sources = new Set(parsedData.dosage.map(d => d.source));
    console.log(`        Routes: ${[...routeSet].join(", ")}`);
    console.log(`        Sources: ${[...sources].join(", ")}`);
  } else {
    console.log("     📁 Parsed sources: ❌ NO DOSAGE DATA");
  }

  // DURATION ANALYSIS
  console.log("\n  ⏱️  DURATION:");

  if (!article.duration?.routes?.length) {
    console.log("     Current: ❌ NO DURATION DATA");
  } else {
    for (const route of article.duration.routes) {
      const { count, stages } = countFilledStages(route.stages);
      const missing = ["onset", "come_up", "peak", "offset", "after_effects", "total_duration"].filter(s => !stages.includes(s));
      console.log(`     ${route.route}: ${count}/6 stages`);
      console.log(`        ✓ Has: ${stages.join(", ") || "none"}`);
      if (missing.length > 0 && missing.length < 6) {
        console.log(`        ✗ Missing: ${missing.join(", ")}`);
      }
    }
  }

  // Check what parsed-sources has for duration
  if (parsedData?.duration?.length) {
    console.log(`     📁 Parsed sources have: ${parsedData.duration.length} entries`);
    const routeSet = new Set(parsedData.duration.map(d => d.route));
    const sources = new Set(parsedData.duration.map(d => d.source));
    console.log(`        Routes: ${[...routeSet].join(", ")}`);
    console.log(`        Sources: ${[...sources].join(", ")}`);
  } else {
    console.log("     📁 Parsed sources: ❌ NO DURATION DATA");
  }

  console.log("");
}

// Summary
console.log("\n" + "═".repeat(70));
console.log("  SUMMARY: WHAT CAN BE IMPROVED");
console.log("═".repeat(70));

let canImprove = 0;
let needsManual = 0;

for (const name of PRIORITY) {
  const slug = slugify(name);
  const article = articles.find(a => slugify(a.title) === slug);
  const parsedData = parsed.substances[slug];

  if (!article) continue;

  const hasDosage = article.dosage?.routes?.length > 0;
  const hasDuration = article.duration?.routes?.length > 0;
  const parsedHasDosage = parsedData?.dosage?.length > 0;
  const parsedHasDuration = parsedData?.duration?.length > 0;

  if ((!hasDosage && parsedHasDosage) || (!hasDuration && parsedHasDuration)) {
    console.log(`  ✅ ${name}: Can be improved from parsed sources`);
    canImprove++;
  } else if (!parsedHasDosage && !hasDosage) {
    console.log(`  ⚠️  ${name}: Needs MANUAL data entry (no parsed sources)`);
    needsManual++;
  } else {
    console.log(`  ➖ ${name}: Already has data`);
  }
}

console.log(`\n  Total: ${canImprove} can be improved, ${needsManual} need manual entry`);
