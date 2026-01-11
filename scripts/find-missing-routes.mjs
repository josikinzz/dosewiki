#!/usr/bin/env node
/**
 * Find missing routes - articles that have SOME dosage/duration data
 * but are missing routes that exist in parsed-sources
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

function normalizeRoute(route) {
  if (!route) return "Oral";
  const ROUTE_NORMALIZE = {
    oral: "Oral", sublingual: "Sublingual", "sublingual/buccal": "Sublingual",
    "buccal & sublingual": "Sublingual", buccal: "Sublingual",
    insufflated: "Insufflated", intranasal: "Insufflated", nasal: "Insufflated",
    smoked: "Smoked", inhaled: "Inhaled", inhalation: "Inhaled",
    vapourized: "Vaporized", vaporized: "Vaporized", vaped: "Vaporized",
    intravenous: "Intravenous", iv: "Intravenous",
    intramuscular: "Intramuscular", im: "Intramuscular",
    rectal: "Rectal", transdermal: "Transdermal"
  };
  const key = route.toLowerCase().trim().replace(/\s*\([^)]*\)\s*/g, "");
  return ROUTE_NORMALIZE[key] || (route.charAt(0).toUpperCase() + route.slice(1).toLowerCase());
}

// Track missing routes
const missingDosageRoutes = [];
const missingDurationRoutes = [];
const completelyMissingDosage = [];
const completelyMissingDuration = [];

// Popular/important substances to highlight
const POPULAR = new Set([
  "lsd", "mdma", "psilocybin-mushrooms", "cocaine", "cannabis", "ketamine",
  "amphetamine", "methamphetamine", "dmt", "2c-b", "ghb", "gbl", "alcohol",
  "nicotine", "caffeine", "heroin", "morphine", "codeine", "oxycodone",
  "diazepam", "alprazolam", "clonazepam", "lorazepam", "nitrous",
  "dextromethorphan", "kratom", "salvia", "mescaline", "pcp", "mxe",
  "4-aco-dmt", "1p-lsd", "al-lad", "eth-lad", "ayahuasca", "ibogaine"
]);

for (const article of articles) {
  const slug = slugify(article.title);
  const parsedData = parsed.substances[slug];
  const isPopular = POPULAR.has(slug);

  if (!parsedData) continue;

  // Get current routes in article
  const currentDosageRoutes = new Set(
    (article.dosage?.routes || []).map(r => normalizeRoute(r.route))
  );
  const currentDurationRoutes = new Set(
    (article.duration?.routes || []).map(r => normalizeRoute(r.route))
  );

  // Get available routes in parsed data
  const parsedDosageRoutes = new Set(
    (parsedData.dosage || []).map(r => normalizeRoute(r.route))
  );
  const parsedDurationRoutes = new Set(
    (parsedData.duration || []).map(r => normalizeRoute(r.route))
  );

  // Find missing routes
  const missingDosage = [...parsedDosageRoutes].filter(r => !currentDosageRoutes.has(r));
  const missingDuration = [...parsedDurationRoutes].filter(r => !currentDurationRoutes.has(r));

  // Track completely missing (article has NO data but parsed does)
  if (currentDosageRoutes.size === 0 && parsedDosageRoutes.size > 0) {
    completelyMissingDosage.push({
      title: article.title,
      slug,
      isPopular,
      availableRoutes: [...parsedDosageRoutes]
    });
  } else if (missingDosage.length > 0) {
    missingDosageRoutes.push({
      title: article.title,
      slug,
      isPopular,
      currentRoutes: [...currentDosageRoutes],
      missingRoutes: missingDosage,
      availableRoutes: [...parsedDosageRoutes]
    });
  }

  if (currentDurationRoutes.size === 0 && parsedDurationRoutes.size > 0) {
    completelyMissingDuration.push({
      title: article.title,
      slug,
      isPopular,
      availableRoutes: [...parsedDurationRoutes]
    });
  } else if (missingDuration.length > 0) {
    missingDurationRoutes.push({
      title: article.title,
      slug,
      isPopular,
      currentRoutes: [...currentDurationRoutes],
      missingRoutes: missingDuration,
      availableRoutes: [...parsedDurationRoutes]
    });
  }
}

// Sort by popular first, then by number of missing routes
const sortByImportance = (a, b) => {
  if (a.isPopular && !b.isPopular) return -1;
  if (!a.isPopular && b.isPopular) return 1;
  return (b.missingRoutes?.length || b.availableRoutes?.length) - (a.missingRoutes?.length || a.availableRoutes?.length);
};

missingDosageRoutes.sort(sortByImportance);
missingDurationRoutes.sort(sortByImportance);
completelyMissingDosage.sort(sortByImportance);
completelyMissingDuration.sort(sortByImportance);

// Count totals
const totalNewDosageRoutes = missingDosageRoutes.reduce((sum, a) => sum + a.missingRoutes.length, 0) +
  completelyMissingDosage.reduce((sum, a) => sum + a.availableRoutes.length, 0);
const totalNewDurationRoutes = missingDurationRoutes.reduce((sum, a) => sum + a.missingRoutes.length, 0) +
  completelyMissingDuration.reduce((sum, a) => sum + a.availableRoutes.length, 0);

console.log("╔════════════════════════════════════════════════════════════════════╗");
console.log("║              MISSING ROUTES ANALYSIS                               ║");
console.log("╚════════════════════════════════════════════════════════════════════╝\n");

console.log("┌────────────────────────────────────────────────────────────────────┐");
console.log("│                         SUMMARY                                   │");
console.log("├────────────────────────────────────────────────────────────────────┤");
console.log(`│  Articles missing additional dosage routes:  ${String(missingDosageRoutes.length).padStart(3)}                  │`);
console.log(`│  Articles missing additional duration routes: ${String(missingDurationRoutes.length).padStart(3)}                 │`);
console.log(`│  Articles with NO dosage (but data exists):  ${String(completelyMissingDosage.length).padStart(3)}                  │`);
console.log(`│  Articles with NO duration (but data exists): ${String(completelyMissingDuration.length).padStart(3)}                 │`);
console.log("├────────────────────────────────────────────────────────────────────┤");
console.log(`│  TOTAL NEW DOSAGE ROUTES AVAILABLE:          ${String(totalNewDosageRoutes).padStart(3)}                  │`);
console.log(`│  TOTAL NEW DURATION ROUTES AVAILABLE:        ${String(totalNewDurationRoutes).padStart(3)}                  │`);
console.log("└────────────────────────────────────────────────────────────────────┘\n");

// Show completely missing first
if (completelyMissingDosage.length > 0) {
  console.log("═══════════════════════════════════════════════════════════════════");
  console.log("ARTICLES WITH NO DOSAGE DATA (but parsed data exists)");
  console.log("═══════════════════════════════════════════════════════════════════");
  const popular = completelyMissingDosage.filter(a => a.isPopular);
  const other = completelyMissingDosage.filter(a => !a.isPopular);

  if (popular.length > 0) {
    console.log("\n⭐ POPULAR SUBSTANCES:");
    popular.forEach(a => {
      console.log(`  ${a.title}`);
      console.log(`     Available routes: ${a.availableRoutes.join(", ")}`);
    });
  }

  if (other.length > 0) {
    console.log("\n📋 Other substances:");
    other.slice(0, 15).forEach(a => {
      console.log(`  ${a.title}: ${a.availableRoutes.join(", ")}`);
    });
    if (other.length > 15) console.log(`  ... and ${other.length - 15} more`);
  }
}

if (completelyMissingDuration.length > 0) {
  console.log("\n═══════════════════════════════════════════════════════════════════");
  console.log("ARTICLES WITH NO DURATION DATA (but parsed data exists)");
  console.log("═══════════════════════════════════════════════════════════════════");
  const popular = completelyMissingDuration.filter(a => a.isPopular);
  const other = completelyMissingDuration.filter(a => !a.isPopular);

  if (popular.length > 0) {
    console.log("\n⭐ POPULAR SUBSTANCES:");
    popular.forEach(a => {
      console.log(`  ${a.title}`);
      console.log(`     Available routes: ${a.availableRoutes.join(", ")}`);
    });
  }

  if (other.length > 0) {
    console.log("\n📋 Other substances:");
    other.slice(0, 15).forEach(a => {
      console.log(`  ${a.title}: ${a.availableRoutes.join(", ")}`);
    });
    if (other.length > 15) console.log(`  ... and ${other.length - 15} more`);
  }
}

// Show partial missing (have some routes but missing others)
if (missingDosageRoutes.length > 0) {
  console.log("\n═══════════════════════════════════════════════════════════════════");
  console.log("ARTICLES MISSING ADDITIONAL DOSAGE ROUTES");
  console.log("═══════════════════════════════════════════════════════════════════");
  const popular = missingDosageRoutes.filter(a => a.isPopular);
  const other = missingDosageRoutes.filter(a => !a.isPopular);

  if (popular.length > 0) {
    console.log("\n⭐ POPULAR SUBSTANCES:");
    popular.forEach(a => {
      console.log(`  ${a.title}`);
      console.log(`     Has: ${a.currentRoutes.join(", ")}`);
      console.log(`     Missing: ${a.missingRoutes.join(", ")}`);
    });
  }

  if (other.length > 0) {
    console.log("\n📋 Other substances (top 20):");
    other.slice(0, 20).forEach(a => {
      console.log(`  ${a.title}`);
      console.log(`     Has: ${a.currentRoutes.join(", ")} | Missing: ${a.missingRoutes.join(", ")}`);
    });
    if (other.length > 20) console.log(`  ... and ${other.length - 20} more`);
  }
}

if (missingDurationRoutes.length > 0) {
  console.log("\n═══════════════════════════════════════════════════════════════════");
  console.log("ARTICLES MISSING ADDITIONAL DURATION ROUTES");
  console.log("═══════════════════════════════════════════════════════════════════");
  const popular = missingDurationRoutes.filter(a => a.isPopular);
  const other = missingDurationRoutes.filter(a => !a.isPopular);

  if (popular.length > 0) {
    console.log("\n⭐ POPULAR SUBSTANCES:");
    popular.forEach(a => {
      console.log(`  ${a.title}`);
      console.log(`     Has: ${a.currentRoutes.join(", ")}`);
      console.log(`     Missing: ${a.missingRoutes.join(", ")}`);
    });
  }

  if (other.length > 0) {
    console.log("\n📋 Other substances (top 20):");
    other.slice(0, 20).forEach(a => {
      console.log(`  ${a.title}`);
      console.log(`     Has: ${a.currentRoutes.join(", ")} | Missing: ${a.missingRoutes.join(", ")}`);
    });
    if (other.length > 20) console.log(`  ... and ${other.length - 20} more`);
  }
}
