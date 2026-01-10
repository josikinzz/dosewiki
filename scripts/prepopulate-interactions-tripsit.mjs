#!/usr/bin/env node
/**
 * Prepopulate interactions from TripSit combo data with fallback to other sources
 *
 * Priority:
 * 1. TripSit combos (curated, class-based) - primary source
 * 2. parsed-sources.json (PsychonautWiki, etc.) - fallback for unmapped substances
 *
 * Deduplicates by normalizing case and applies consistent formatting.
 *
 * Usage:
 *   node scripts/prepopulate-interactions-tripsit.mjs --dry-run     # Preview changes
 *   node scripts/prepopulate-interactions-tripsit.mjs               # Apply changes
 *   node scripts/prepopulate-interactions-tripsit.mjs --verbose     # Show details
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// Load data
const articlesPath = path.join(ROOT, "src/data/articles.json");
const combosPath = path.join(ROOT, "src/data/tripsit-combos.json");
const parsedPath = path.join(ROOT, "src/data/parsed-sources.json");

const articles = JSON.parse(fs.readFileSync(articlesPath, "utf-8"));
const combos = JSON.parse(fs.readFileSync(combosPath, "utf-8"));
const parsed = JSON.parse(fs.readFileSync(parsedPath, "utf-8"));

// Parse CLI args
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const verbose = args.includes("--verbose");

// Slugify function matching parsed-sources keys
function slugify(str) {
  return str.toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// === Category Mapping (from tripsit-combos.ts) ===

const DIRECT_MATCHES = new Set([
  "alcohol",
  "amt",
  "caffeine",
  "cannabis",
  "cocaine",
  "dextromethorphan",
  "diphenhydramine",
  "dmt",
  "ketamine",
  "lithium",
  "lsd",
  "mdma",
  "mephedrone",
  "mescaline",
  "nitrous",
  "pcp",
  "pregabalin",
  "tramadol",
]);

const CATEGORY_PATTERNS = [
  // 2C-T-x series (before general 2C-x)
  { category: "2c-t-x", pattern: /^2c-t-/i },

  // 2C-x series (general phenethylamines)
  { category: "2c-x", pattern: /^2c-[a-z]/i },

  // 5-MeO-xxT tryptamines
  { category: "5-meo-xxt", pattern: /^5-meo-/i },

  // DOx amphetamines
  { category: "dox", pattern: /^do[bcimpn]/i },

  // NBOMe compounds
  { category: "nbomes", pattern: /nbome|nboh|nbf$/i },

  // LSD analogs
  {
    category: "lsd",
    pattern: /^(1[bdfpv]-lsd|1cp-lsd|1cp-al-lad|1cp-mipla|al-lad|eth-lad|pro-lad|pargy-lad|ald-52|lsz|lsm-775|lsa)$/i,
  },

  // Amphetamines
  {
    category: "amphetamines",
    pattern: /^(amphetamine|dextroamphetamine|methamphetamine|lisdexamfetamine|adderall|vyvanse)$/i,
  },

  // Opioids
  {
    category: "opioids",
    pattern: /^(morphine|heroin|fentanyl|codeine|oxycodone|hydrocodone|hydromorphone|oxymorphone|buprenorphine|opium|kratom|methadone|dihydrocodeine|nicomorphine|ethylmorphine|desomorphine|o-desmethyltramadol|.*fentanyl.*)$/i,
  },

  // Benzodiazepines
  { category: "benzodiazepines", pattern: /(azepam|azolam|etizolam)$/i },

  // Mushrooms / psilocybin-related
  { category: "mushrooms", pattern: /^(psilocybin|psilocin|4-aco-|4-ho-|psilocybin-mushrooms)/i },

  // SSRIs
  {
    category: "ssris",
    pattern: /^(fluoxetine|sertraline|paroxetine|citalopram|escitalopram|fluvoxamine|prozac|zoloft|lexapro|paxil)$/i,
  },

  // MAOIs
  {
    category: "maois",
    pattern: /^(harmaline|harmine|moclobemide|selegiline|phenelzine|tranylcypromine|ayahuasca|syrian-rue|isocarboxazid|rasagiline)$/i,
  },

  // GHB/GBL
  { category: "ghb/gbl", pattern: /^(ghb|gbl|1,4-butanediol|gamma)$/i },

  // MXE
  { category: "mxe", pattern: /^(methoxetamine|mxe)$/i },
];

function getCategoryForSubstance(slug) {
  const normalizedSlug = slug.toLowerCase();

  // Check direct matches first
  if (DIRECT_MATCHES.has(normalizedSlug)) {
    return normalizedSlug;
  }

  // Check pattern-based matches
  for (const { category, pattern } of CATEGORY_PATTERNS) {
    if (pattern.test(normalizedSlug)) {
      return category;
    }
  }

  return undefined;
}

// === Name Formatting ===

// Canonical name mappings for consistent formatting
const NAME_MAP = {
  "2c-t-x": "2C-T-x compounds",
  "2c-x": "2C-x compounds",
  "5-meo-xxt": "5-MeO-xxT tryptamines",
  "dox": "DOx compounds",
  "nbomes": "NBOMe compounds",
  "amphetamines": "Amphetamines",
  "opioids": "Opioids",
  "benzodiazepines": "Benzodiazepines",
  "mushrooms": "Psilocybin mushrooms",
  "ssris": "SSRIs",
  "maois": "MAOIs",
  "ghb/gbl": "GHB/GBL",
  "mxe": "MXE",
  "amt": "AMT",
  "pcp": "PCP",
  "lsd": "LSD",
  "mdma": "MDMA",
  "dmt": "DMT",
  "dextromethorphan": "DXM",
  "dxm": "DXM",
  "ketamine": "Ketamine",
  "alcohol": "Alcohol",
  "cannabis": "Cannabis",
  "cocaine": "Cocaine",
  "caffeine": "Caffeine",
  "lithium": "Lithium",
  "tramadol": "Tramadol",
  "nitrous": "Nitrous oxide",
  "mephedrone": "Mephedrone",
  "mescaline": "Mescaline",
  "diphenhydramine": "Diphenhydramine",
  "pregabalin": "Pregabalin",
  // Common variations from other sources
  "stimulants": "Stimulants",
  "depressants": "Depressants",
  "dissociatives": "Dissociatives",
  "psychedelics": "Psychedelics",
  "25x-nbome": "NBOMe compounds",
  "25x-nbome & 25x-nboh": "NBOMe compounds",
  "25i-nbome": "NBOMe compounds",
  "nbome": "NBOMe compounds",
  "nboh": "NBOMe compounds",
};

function formatInteractionName(name) {
  const lower = name.toLowerCase().trim();
  return NAME_MAP[lower] || name.charAt(0).toUpperCase() + name.slice(1);
}

/**
 * Normalize and deduplicate an array of interaction names
 * Returns unique names with consistent formatting
 */
function deduplicateInteractions(names) {
  const seen = new Map(); // lowercase -> formatted name

  for (const name of names) {
    const formatted = formatInteractionName(name);
    const key = formatted.toLowerCase();

    if (!seen.has(key)) {
      seen.set(key, formatted);
    }
  }

  return Array.from(seen.values()).sort();
}

// === Status Mapping (only danger levels) ===

const STATUS_MAP = {
  "Dangerous": "dangerous",
  "Unsafe": "unsafe",
  "Caution": "caution",
};

// === Stats Tracking ===

const stats = {
  articlesProcessed: 0,
  articlesWithCombos: 0,
  articlesWithFallback: 0,
  articlesCleared: 0,
  interactionsByCategory: {},
  dangerousCount: 0,
  unsafeCount: 0,
  cautionCount: 0,
  lowRiskSkipped: 0,
  fallbackSources: {},
  noDataSubstances: [],
};

// === Process Articles ===

const modifiedArticles = articles.map(article => {
  const slug = slugify(article.title);
  const category = getCategoryForSubstance(slug);

  stats.articlesProcessed++;

  // Clone article for modification
  const updated = JSON.parse(JSON.stringify(article));

  // === PRIMARY: TripSit Combos ===
  if (category && combos[category]) {
    stats.articlesWithCombos++;
    stats.interactionsByCategory[category] = (stats.interactionsByCategory[category] || 0) + 1;

    // Build new interactions from combos only
    const dangerous = [];
    const unsafe = [];
    const caution = [];

    for (const [target, info] of Object.entries(combos[category])) {
      const severity = STATUS_MAP[info.status];

      if (!severity) {
        // Low-risk status - skip
        stats.lowRiskSkipped++;
        continue;
      }

      const name = formatInteractionName(target);
      // Include note in parentheses if available
      const entry = info.note ? `${name} (${info.note})` : name;

      if (severity === "dangerous") {
        dangerous.push(entry);
        stats.dangerousCount++;
      } else if (severity === "unsafe") {
        unsafe.push(entry);
        stats.unsafeCount++;
      } else if (severity === "caution") {
        caution.push(entry);
        stats.cautionCount++;
      }
    }

    // Sort by substance name (extract name before any parenthetical note)
    const sortByName = (a, b) => {
      const nameA = a.replace(/\s*\(.*$/, "").toLowerCase();
      const nameB = b.replace(/\s*\(.*$/, "").toLowerCase();
      return nameA.localeCompare(nameB);
    };
    dangerous.sort(sortByName);
    unsafe.sort(sortByName);
    caution.sort(sortByName);

    updated.interactions = { dangerous, unsafe, caution };

    if (verbose) {
      const total = dangerous.length + unsafe.length + caution.length;
      console.log(`  ${article.title} [combos:${category}]: ${total} interactions`);
    }

    return updated;
  }

  // === FALLBACK: parsed-sources.json ===
  const parsedData = parsed.substances[slug];
  if (parsedData && parsedData.interactions && parsedData.interactions.length > 0) {
    // Filter to only dangerous/unsafe/caution (skip low-risk)
    const validInteractions = parsedData.interactions.filter(i =>
      i.severity === "dangerous" || i.severity === "unsafe" || i.severity === "caution"
    );

    if (validInteractions.length > 0) {
      stats.articlesWithFallback++;

      // Track sources used
      const sources = [...new Set(validInteractions.map(i => i.source))];
      for (const src of sources) {
        stats.fallbackSources[src] = (stats.fallbackSources[src] || 0) + 1;
      }

      // Extract names by severity
      const dangerousRaw = validInteractions.filter(i => i.severity === "dangerous").map(i => i.substance);
      const unsafeRaw = validInteractions.filter(i => i.severity === "unsafe").map(i => i.substance);
      const cautionRaw = validInteractions.filter(i => i.severity === "caution").map(i => i.substance);

      // Deduplicate and format
      const dangerous = deduplicateInteractions(dangerousRaw);
      const unsafe = deduplicateInteractions(unsafeRaw);
      const caution = deduplicateInteractions(cautionRaw);

      stats.dangerousCount += dangerous.length;
      stats.unsafeCount += unsafe.length;
      stats.cautionCount += caution.length;

      updated.interactions = { dangerous, unsafe, caution };

      if (verbose) {
        const total = dangerous.length + unsafe.length + caution.length;
        console.log(`  ${article.title} [fallback:${sources.join(",")}]: ${total} interactions`);
      }

      return updated;
    }
  }

  // === NO DATA: Clear interactions ===
  const hadInteractions =
    updated.interactions.dangerous.length > 0 ||
    updated.interactions.unsafe.length > 0 ||
    updated.interactions.caution.length > 0;

  if (hadInteractions) {
    stats.articlesCleared++;
    if (verbose) {
      console.log(`  Cleared: ${article.title} (no data)`);
    }
  }

  updated.interactions = { dangerous: [], unsafe: [], caution: [] };
  stats.noDataSubstances.push(article.title);
  return updated;
});

// === Output Summary ===

console.log("\n" + "=".repeat(60));
console.log("INTERACTION PREPOPULATION (TripSit Combos + Fallback)");
console.log("=".repeat(60));
console.log(`\nMode: ${dryRun ? "DRY RUN (no changes written)" : "APPLY CHANGES"}`);

console.log(`\n--- Articles ---`);
console.log(`  Total processed:        ${stats.articlesProcessed}`);
console.log(`  From TripSit Combos:    ${stats.articlesWithCombos}`);
console.log(`  From fallback sources:  ${stats.articlesWithFallback}`);
console.log(`  No data available:      ${stats.noDataSubstances.length}`);
console.log(`  Had interactions cleared: ${stats.articlesCleared}`);

console.log(`\n--- Interactions Added ---`);
console.log(`  Dangerous:  ${stats.dangerousCount}`);
console.log(`  Unsafe:     ${stats.unsafeCount}`);
console.log(`  Caution:    ${stats.cautionCount}`);
console.log(`  Total:      ${stats.dangerousCount + stats.unsafeCount + stats.cautionCount}`);
console.log(`  Low-risk skipped: ${stats.lowRiskSkipped}`);

console.log(`\n--- TripSit Combo Categories ---`);
const sortedCategories = Object.entries(stats.interactionsByCategory)
  .sort((a, b) => b[1] - a[1]);
for (const [cat, count] of sortedCategories) {
  console.log(`  ${cat}: ${count} substances`);
}

if (Object.keys(stats.fallbackSources).length > 0) {
  console.log(`\n--- Fallback Sources Used ---`);
  const sortedSources = Object.entries(stats.fallbackSources)
    .sort((a, b) => b[1] - a[1]);
  for (const [src, count] of sortedSources) {
    console.log(`  ${src}: ${count} substances`);
  }
}

if (verbose && stats.noDataSubstances.length > 0) {
  console.log(`\n--- No Data Available (${stats.noDataSubstances.length}) ---`);
  stats.noDataSubstances.slice(0, 20).forEach(s => console.log(`  - ${s}`));
  if (stats.noDataSubstances.length > 20) {
    console.log(`  ... and ${stats.noDataSubstances.length - 20} more`);
  }
}

// Write if not dry run
if (!dryRun) {
  fs.writeFileSync(articlesPath, JSON.stringify(modifiedArticles, null, 2) + "\n");
  console.log(`\n✅ Changes written to ${articlesPath}`);
} else {
  console.log("\n⚠️  Dry run - no changes written. Remove --dry-run to apply.");
}

console.log("");
