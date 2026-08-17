#!/usr/bin/env node
/**
 * Summary of what's fixable with the new tier merging logic
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const articles = JSON.parse(fs.readFileSync(path.join(ROOT, "src/data/SubstanceIndex.json"), "utf-8"));
const parsed = JSON.parse(fs.readFileSync(path.join(ROOT, "src/data/parsed-sources.json"), "utf-8"));

import { slugify } from "../lib/slug.mjs";

// Find articles with incomplete tiers that have more data in parsed-sources
const TIERS = ["threshold", "light", "moderate", "strong", "heavy"];

function tierHasData(tier) {
  return tier && (tier.min != null || tier.max != null);
}

const missingTiersFixable = [];

for (const article of articles) {
  const slug = slugify(article.title);
  const parsedData = parsed.substances[slug];
  if (!parsedData) continue;

  // Check each dosage route
  for (const route of article.dosage?.routes || []) {
    const currentTiers = TIERS.filter(t => tierHasData(route.dose_ranges?.[t === "moderate" ? "moderate" : t]));
    const missingTiers = TIERS.filter(t => !currentTiers.includes(t));

    if (missingTiers.length > 0 && missingTiers.length < 5) {
      // Check if parsed-sources has these missing tiers
      const parsedRoutes = parsedData.dosage?.filter(d =>
        d.route?.toLowerCase().includes(route.route.toLowerCase()) ||
        route.route.toLowerCase().includes(d.route?.toLowerCase() || "")
      ) || [];

      for (const pr of parsedRoutes) {
        const canFill = missingTiers.filter(t => {
          const key = t === "moderate" ? "common" : t;
          return tierHasData(pr.ranges?.[key]);
        });

        if (canFill.length > 0) {
          missingTiersFixable.push({
            title: article.title,
            route: route.route,
            currentTiers: currentTiers.length,
            missingTiers,
            canFill,
            source: pr.source
          });
          break;
        }
      }
    }
  }
}

// Sort by importance
missingTiersFixable.sort((a, b) => b.canFill.length - a.canFill.length);

console.log("╔════════════════════════════════════════════════════════════════════╗");
console.log("║           FIXABLE MISSING TIERS - DETAILED REPORT                  ║");
console.log("╚════════════════════════════════════════════════════════════════════╝\n");

console.log(`Found ${missingTiersFixable.length} route(s) with missing tiers that CAN be filled\n`);

const totalFixable = missingTiersFixable.reduce((sum, m) => sum + m.canFill.length, 0);
console.log(`TOTAL MISSING TIERS THAT CAN BE FILLED: ${totalFixable}\n`);

console.log("═".repeat(70));
console.log("ARTICLES WITH FILLABLE MISSING TIERS:");
console.log("═".repeat(70));

for (const m of missingTiersFixable) {
  console.log(`\n${m.title} (${m.route})`);
  console.log(`  Current: ${m.currentTiers}/5 tiers`);
  console.log(`  Missing: ${m.missingTiers.join(", ")}`);
  console.log(`  ✅ Can fill from ${m.source}: ${m.canFill.join(", ")}`);
}

// Grand summary
console.log("\n\n" + "═".repeat(70));
console.log("GRAND SUMMARY");
console.log("═".repeat(70));
console.log(`
┌─────────────────────────────────────────────────────────────────┐
│  NEW DOSAGE/DURATION TABLES (completely new):        0          │
│  ─────────────────────────────────────────────────────────────  │
│  MISSING TIERS THAT CAN BE FILLED:                  ${String(totalFixable).padStart(2)}          │
│  ROUTES AFFECTED:                                   ${String(missingTiersFixable.length).padStart(2)}          │
│  ─────────────────────────────────────────────────────────────  │
│  SUBSTANCES NEEDING MANUAL ENTRY:                    2          │
│    - Nicotine (no parsed source data)                           │
│    - Ayahuasca (no quantifiable dosage)                         │
└─────────────────────────────────────────────────────────────────┘
`);

// Show what --dangerousmode would actually change
console.log("NOTE: To apply tier filling, you would need to re-run prepopulation");
console.log("with --dangerousmode since articles already have SOME data.");
console.log("");
console.log("ALTERNATIVE: Use --substance flag to selectively update specific articles");
console.log("Example: node scripts/prepopulate-dosage-duration.mjs --substance=mdma --dangerousmode --dry-run");
