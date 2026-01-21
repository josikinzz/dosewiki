#!/usr/bin/env node
/**
 * Compare current SubstanceIndex.json dosage/duration with what the improved parser would produce
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

// Count filled tiers in a dose_ranges object
function countFilledTiers(doseRanges) {
  if (!doseRanges) return 0;
  const tiers = ["threshold", "light", "moderate", "strong", "heavy"];
  return tiers.filter(t => {
    const tier = doseRanges[t];
    return tier && (tier.min != null || tier.max != null);
  }).length;
}

// Count filled stages in a duration stages object
function countFilledStages(stages) {
  if (!stages) return 0;
  const stageNames = ["onset", "come_up", "peak", "offset", "after_effects", "total_duration"];
  return stageNames.filter(s => {
    const stage = stages[s];
    return stage && (stage.min != null || stage.max != null);
  }).length;
}

// Simulate the new merge logic
const SOURCE_PRIORITY = [
  "erowid", "tripsit-factsheets", "thedrugclassroom", "psychonautwiki",
  "tripsit-wiki", "disregardeverythingisay", "drugusersbible"
];

function getSourcePriority(source) {
  const idx = SOURCE_PRIORITY.indexOf(source);
  return idx === -1 ? SOURCE_PRIORITY.length : idx;
}

function normalizeRoute(route) {
  if (!route) return "Oral";
  const ROUTE_NORMALIZE = {
    oral: "Oral", sublingual: "Sublingual", insufflated: "Insufflated",
    intranasal: "Insufflated", smoked: "Smoked", inhaled: "Inhaled",
    inhalation: "Inhaled", vaporized: "Vaporized", intravenous: "Intravenous",
    iv: "Intravenous", intramuscular: "Intramuscular", im: "Intramuscular",
    rectal: "Rectal", transdermal: "Transdermal"
  };
  const key = route.toLowerCase().trim();
  return ROUTE_NORMALIZE[key] || (route.charAt(0).toUpperCase() + route.slice(1));
}

function tierHasData(tier) {
  if (!tier) return false;
  return tier.min != null || tier.max != null;
}

function mergeDoseTiers(entriesForRoute) {
  if (!entriesForRoute || entriesForRoute.length === 0) return null;
  const sorted = [...entriesForRoute].sort((a, b) => getSourcePriority(a.source) - getSourcePriority(b.source));
  const base = sorted[0];
  const mergedRanges = JSON.parse(JSON.stringify(base.ranges || {}));
  const TIER_LEVELS = ["threshold", "light", "common", "strong", "heavy"];

  for (let i = 1; i < sorted.length; i++) {
    const entry = sorted[i];
    if (!entry.ranges) continue;
    for (const tier of TIER_LEVELS) {
      if (!tierHasData(mergedRanges[tier]) && tierHasData(entry.ranges[tier])) {
        mergedRanges[tier] = entry.ranges[tier];
      }
    }
  }
  return mergedRanges;
}

// Analyze each article
let totalCurrentTiers = 0;
let totalNewTiers = 0;
let totalCurrentStages = 0;
let totalNewStages = 0;
let articlesImproved = 0;
const improvements = [];

for (const article of articles) {
  const slug = slugify(article.title);
  const parsedData = parsed.substances[slug];

  if (!parsedData) continue;

  // Current state
  let currentTiers = 0;
  let currentStages = 0;

  if (article.dosage?.routes) {
    for (const route of article.dosage.routes) {
      currentTiers += countFilledTiers(route.dose_ranges);
    }
  }

  if (article.duration?.routes) {
    for (const route of article.duration.routes) {
      currentStages += countFilledStages(route.stages);
    }
  }

  // Calculate what merged data would look like
  let newTiers = 0;
  let newStages = 0;

  if (parsedData.dosage?.length > 0) {
    // Group by route
    const byRoute = new Map();
    for (const entry of parsedData.dosage) {
      const route = normalizeRoute(entry.route);
      if (!byRoute.has(route)) byRoute.set(route, []);
      byRoute.get(route).push(entry);
    }

    for (const [route, entries] of byRoute) {
      const merged = mergeDoseTiers(entries);
      if (merged) {
        const TIER_LEVELS = ["threshold", "light", "common", "strong", "heavy"];
        newTiers += TIER_LEVELS.filter(t => tierHasData(merged[t])).length;
      }
    }
  }

  if (parsedData.duration?.length > 0) {
    // Just count stages from best source per route
    const byRoute = new Map();
    for (const entry of parsedData.duration) {
      const route = normalizeRoute(entry.route);
      if (!byRoute.has(route)) {
        byRoute.set(route, entry);
      } else {
        const existing = byRoute.get(route);
        const existingPriority = getSourcePriority(existing.source);
        const newPriority = getSourcePriority(entry.source);
        if (newPriority < existingPriority) {
          byRoute.set(route, entry);
        }
      }
    }

    for (const entry of byRoute.values()) {
      if (entry.stages) {
        const stageNames = ["onset", "comeUp", "peak", "offset", "afterEffects", "total"];
        newStages += stageNames.filter(s => tierHasData(entry.stages[s])).length;
      }
    }
  }

  totalCurrentTiers += currentTiers;
  totalNewTiers += newTiers;
  totalCurrentStages += currentStages;
  totalNewStages += newStages;

  const tierDiff = newTiers - currentTiers;
  const stageDiff = newStages - currentStages;

  if (tierDiff > 0 || stageDiff > 0) {
    articlesImproved++;
    if (tierDiff >= 2 || stageDiff >= 2) {
      improvements.push({
        title: article.title,
        tierDiff,
        stageDiff,
        currentTiers,
        newTiers,
        currentStages,
        newStages
      });
    }
  }
}

// Sort by biggest improvement
improvements.sort((a, b) => (b.tierDiff + b.stageDiff) - (a.tierDiff + a.stageDiff));

console.log("╔═══════════════════════════════════════════════════════════════════╗");
console.log("║           DOSAGE/DURATION IMPROVEMENT COMPARISON                  ║");
console.log("╚═══════════════════════════════════════════════════════════════════╝\n");

const tierDiff = totalNewTiers - totalCurrentTiers;
const stageDiff = totalNewStages - totalCurrentStages;
const tierSign = tierDiff >= 0 ? "+" : "";
const stageSign = stageDiff >= 0 ? "+" : "";

console.log("┌─────────────────────────────────────────────────────────────────┐");
console.log("│                    DOSAGE TIER COMPARISON                       │");
console.log("├─────────────────────────────────────────────────────────────────┤");
console.log(`│  Current total tiers filled:    ${String(totalCurrentTiers).padStart(4)}                          │`);
console.log(`│  New total tiers (with merge):  ${String(totalNewTiers).padStart(4)}                          │`);
console.log(`│  Improvement:                   ${tierSign}${tierDiff} tiers                        │`);
console.log("└─────────────────────────────────────────────────────────────────┘\n");

console.log("┌─────────────────────────────────────────────────────────────────┐");
console.log("│                   DURATION STAGE COMPARISON                     │");
console.log("├─────────────────────────────────────────────────────────────────┤");
console.log(`│  Current total stages filled:   ${String(totalCurrentStages).padStart(4)}                          │`);
console.log(`│  New total stages (with merge): ${String(totalNewStages).padStart(4)}                          │`);
console.log(`│  Improvement:                   ${stageSign}${stageDiff} stages                       │`);
console.log("└─────────────────────────────────────────────────────────────────┘\n");

console.log(`Articles that would be improved: ${articlesImproved}\n`);

if (improvements.length > 0) {
  console.log("Top improvements (2+ tiers/stages gained):");
  console.log("─".repeat(60));
  improvements.slice(0, 20).forEach(imp => {
    console.log(`  ${imp.title}`);
    if (imp.tierDiff > 0) console.log(`    Dosage tiers: ${imp.currentTiers} → ${imp.newTiers} (+${imp.tierDiff})`);
    if (imp.stageDiff > 0) console.log(`    Duration stages: ${imp.currentStages} → ${imp.newStages} (+${imp.stageDiff})`);
  });
  if (improvements.length > 20) {
    console.log(`  ... and ${improvements.length - 20} more`);
  }
}
