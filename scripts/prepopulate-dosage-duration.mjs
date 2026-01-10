#!/usr/bin/env node
/**
 * Prepopulate dosage and duration from parsed-sources.json
 *
 * Transforms and normalizes data to match the articles.json schema:
 * - Renames dose level "common" → "moderate"
 * - Renames duration stages to snake_case (comeUp → come_up, etc.)
 * - Normalizes units (ug → µg, lowercase)
 * - Normalizes route names
 * - Selects best source per route (priority-based)
 * - Fills missing fields with null values
 *
 * Usage:
 *   node scripts/prepopulate-dosage-duration.mjs --dry-run     # Preview changes
 *   node scripts/prepopulate-dosage-duration.mjs               # Apply changes
 *   node scripts/prepopulate-dosage-duration.mjs --verbose     # Show details
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// Load data
const articlesPath = path.join(ROOT, "src/data/articles.json");
const parsedPath = path.join(ROOT, "src/data/parsed-sources.json");

const articles = JSON.parse(fs.readFileSync(articlesPath, "utf-8"));
const parsed = JSON.parse(fs.readFileSync(parsedPath, "utf-8"));

// Parse CLI args
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const verbose = args.includes("--verbose");

// === Configuration ===

// Source priority (lower index = higher priority)
const SOURCE_PRIORITY = [
  "erowid",
  "tripsit-factsheets",
  "thedrugclassroom",
  "psychonautwiki",
  "tripsit-wiki",
  "disregardeverythingisay",
  "drugusersbible"
];

// Dose level mapping (parsed → schema)
const DOSE_LEVEL_MAP = {
  threshold: "threshold",
  light: "light",
  common: "moderate",  // Key transformation
  strong: "strong",
  heavy: "heavy"
};

// Duration stage mapping (parsed camelCase → schema snake_case)
const DURATION_STAGE_MAP = {
  onset: "onset",
  comeUp: "come_up",
  peak: "peak",
  offset: "offset",
  afterEffects: "after_effects",
  total: "total_duration"
};

// Route name normalization (lowercase key → normalized value)
const ROUTE_NORMALIZE = {
  oral: "Oral",
  sublingual: "Sublingual",
  "sublingual/buccal": "Sublingual",
  "buccal & sublingual": "Sublingual",
  buccal: "Sublingual",
  insufflated: "Insufflated",
  intranasal: "Insufflated",
  smoked: "Smoked",
  inhaled: "Inhaled",
  inhalation: "Inhaled",
  vapourized: "Vaporized",
  vaporized: "Vaporized",
  intravenous: "Intravenous",
  iv: "Intravenous",
  intramuscular: "Intramuscular",
  im: "Intramuscular",
  rectal: "Rectal",
  transdermal: "Transdermal",
  "oral/sublingual/buccal": "Oral"
};

// === Utility Functions ===

function slugify(str) {
  return str.toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function normalizeRoute(route) {
  if (!route) return "Oral";
  const key = route.toLowerCase().trim();
  return ROUTE_NORMALIZE[key] || (route.charAt(0).toUpperCase() + route.slice(1));
}

function normalizeUnit(unit) {
  if (!unit) return "mg";
  return unit.toLowerCase()
    .replace(/^ug$/i, "µg")
    .replace(/^mcg$/i, "µg");
}

function cleanBioavailability(bio) {
  if (!bio) return "";
  // Remove citation numbers: "17%2" → "17%", "50-60%3" → "50-60%"
  return bio.replace(/(\d+(?:-\d+)?%)\d*$/, "$1").trim();
}

function getSourcePriority(source) {
  const idx = SOURCE_PRIORITY.indexOf(source);
  return idx === -1 ? SOURCE_PRIORITY.length : idx;
}

// === Dosage Transformation ===

function transformDoseRange(range) {
  if (!range) return { min: null, max: null, unit: "mg" };
  return {
    min: range.min ?? null,
    max: range.max ?? null,
    unit: normalizeUnit(range.unit)
  };
}

function transformDoseRanges(ranges) {
  const result = {
    threshold: { min: null, max: null, unit: "mg" },
    light: { min: null, max: null, unit: "mg" },
    moderate: { min: null, max: null, unit: "mg" },
    strong: { min: null, max: null, unit: "mg" },
    heavy: { min: null, max: null, unit: "mg" }
  };

  if (!ranges) return result;

  // Determine default unit from existing data
  let defaultUnit = "mg";
  for (const level of Object.values(ranges)) {
    if (level && level.unit) {
      defaultUnit = normalizeUnit(level.unit);
      break;
    }
  }

  // Apply default unit to all levels
  for (const key of Object.keys(result)) {
    result[key].unit = defaultUnit;
  }

  // Transform each level
  for (const [sourceLevel, targetLevel] of Object.entries(DOSE_LEVEL_MAP)) {
    if (ranges[sourceLevel]) {
      result[targetLevel] = transformDoseRange(ranges[sourceLevel]);
    }
  }

  // Auto-populate threshold from light.min if threshold is empty
  // Display will show as "~25 µg" (threshold typically only has min)
  if (result.threshold.min == null && result.threshold.max == null) {
    if (result.light.min != null) {
      result.threshold.min = result.light.min;
      result.threshold.unit = result.light.unit;
    }
  }

  // Auto-populate heavy from strong.max if heavy is empty
  // Display will show as "250+ µg" (heavy typically only has min)
  if (result.heavy.min == null && result.heavy.max == null) {
    if (result.strong.max != null) {
      result.heavy.min = result.strong.max;
      result.heavy.unit = result.strong.unit;
    }
  }

  return result;
}

function selectBestDosagePerRoute(dosageEntries) {
  if (!dosageEntries || dosageEntries.length === 0) return [];

  // Group entries by source to track order within each source
  const bySource = new Map();
  for (const entry of dosageEntries) {
    const source = entry.source;
    if (!bySource.has(source)) {
      bySource.set(source, []);
    }
    bySource.get(source).push(entry);
  }

  // Find the highest-priority source that has routes
  const sortedSources = Array.from(bySource.keys()).sort(
    (a, b) => getSourcePriority(a) - getSourcePriority(b)
  );
  const primarySource = sortedSources[0];
  const primaryRoutes = bySource.get(primarySource) || [];

  // Build ordered route list from primary source
  const routeOrderFromPrimary = primaryRoutes.map(e => normalizeRoute(e.route));

  // Collect best data for each route (may come from different sources)
  const byRoute = new Map();
  for (const entry of dosageEntries) {
    const route = normalizeRoute(entry.route);
    const sourcePriority = getSourcePriority(entry.source);
    const existing = byRoute.get(route);

    if (!existing || sourcePriority < getSourcePriority(existing.source)) {
      byRoute.set(route, entry);
    }
  }

  // Build final list: routes from primary source first (in order), then any additional routes
  const result = [];
  const added = new Set();

  // Add routes in primary source order
  for (const route of routeOrderFromPrimary) {
    if (byRoute.has(route) && !added.has(route)) {
      result.push(byRoute.get(route));
      added.add(route);
    }
  }

  // Add any remaining routes not in primary source
  for (const [route, entry] of byRoute) {
    if (!added.has(route)) {
      result.push(entry);
      added.add(route);
    }
  }

  return result;
}

function transformDosage(parsedDosage) {
  if (!parsedDosage || parsedDosage.length === 0) {
    return { routes: [], plateau_dosing: null };
  }

  const bestEntries = selectBestDosagePerRoute(parsedDosage);

  return {
    routes: bestEntries.map(entry => ({
      route: normalizeRoute(entry.route),
      bioavailability: cleanBioavailability(entry.bioavailability),
      dose_ranges: transformDoseRanges(entry.ranges),
      notes: entry.notes || ""
    })),
    plateau_dosing: null
  };
}

// === Duration Transformation ===

function transformDurationStage(stage) {
  if (!stage) return { min: null, max: null, unit: "minutes" };
  return {
    min: stage.min ?? null,
    max: stage.max ?? null,
    unit: normalizeUnit(stage.unit)
  };
}

function transformStages(stages) {
  const result = {
    onset: { min: null, max: null, unit: "minutes" },
    come_up: { min: null, max: null, unit: "minutes" },
    peak: { min: null, max: null, unit: "hours" },
    offset: { min: null, max: null, unit: "hours" },
    after_effects: { min: null, max: null, unit: "hours" },
    total_duration: { min: null, max: null, unit: "hours" }
  };

  if (!stages) return result;

  // Transform each stage
  for (const [sourceStage, targetStage] of Object.entries(DURATION_STAGE_MAP)) {
    if (stages[sourceStage]) {
      result[targetStage] = transformDurationStage(stages[sourceStage]);
    }
  }

  return result;
}

function countFilledDurationFields(stages) {
  if (!stages) return 0;
  let count = 0;
  for (const stage of Object.values(stages)) {
    if (stage && (stage.min != null || stage.max != null)) {
      count++;
    }
  }
  return count;
}

function selectBestDurationPerRoute(durationEntries) {
  if (!durationEntries || durationEntries.length === 0) return [];

  // Group entries by source to track order within each source
  const bySource = new Map();
  for (const entry of durationEntries) {
    const source = entry.source;
    if (!bySource.has(source)) {
      bySource.set(source, []);
    }
    bySource.get(source).push(entry);
  }

  // Find the highest-priority source that has routes
  const sortedSources = Array.from(bySource.keys()).sort(
    (a, b) => getSourcePriority(a) - getSourcePriority(b)
  );
  const primarySource = sortedSources[0];
  const primaryRoutes = bySource.get(primarySource) || [];

  // Build ordered route list from primary source
  const routeOrderFromPrimary = primaryRoutes.map(e => normalizeRoute(e.route));

  // Collect best data for each route (prefer most complete, then highest priority)
  const byRoute = new Map();
  for (const entry of durationEntries) {
    const route = normalizeRoute(entry.route);
    const sourcePriority = getSourcePriority(entry.source);
    const existing = byRoute.get(route);

    if (!existing) {
      byRoute.set(route, entry);
    } else {
      const newCount = countFilledDurationFields(entry.stages);
      const existingCount = countFilledDurationFields(existing.stages);

      if (newCount > existingCount) {
        byRoute.set(route, entry);
      } else if (newCount === existingCount &&
                 sourcePriority < getSourcePriority(existing.source)) {
        byRoute.set(route, entry);
      }
    }
  }

  // Build final list: routes from primary source first (in order), then any additional routes
  const result = [];
  const added = new Set();

  for (const route of routeOrderFromPrimary) {
    if (byRoute.has(route) && !added.has(route)) {
      result.push(byRoute.get(route));
      added.add(route);
    }
  }

  for (const [route, entry] of byRoute) {
    if (!added.has(route)) {
      result.push(entry);
      added.add(route);
    }
  }

  return result;
}

function transformDuration(parsedDuration) {
  if (!parsedDuration || parsedDuration.length === 0) {
    return { routes: [] };
  }

  const bestEntries = selectBestDurationPerRoute(parsedDuration);

  return {
    routes: bestEntries.map(entry => ({
      route: normalizeRoute(entry.route),
      stages: transformStages(entry.stages)
    }))
  };
}

// === Stats Tracking ===

const stats = {
  articlesProcessed: 0,
  withDosage: 0,
  withDuration: 0,
  dosageRoutes: 0,
  durationRoutes: 0,
  noData: [],
  dosageSources: {},
  durationSources: {}
};

// === Process Articles ===

const modifiedArticles = articles.map(article => {
  const slug = slugify(article.title);
  const parsedData = parsed.substances[slug];

  stats.articlesProcessed++;

  // Clone article for modification
  const updated = JSON.parse(JSON.stringify(article));

  if (!parsedData) {
    // No parsed data for this substance
    updated.dosage = { routes: [], plateau_dosing: null };
    updated.duration = { routes: [] };
    stats.noData.push(article.title);
    return updated;
  }

  // Transform dosage
  const newDosage = transformDosage(parsedData.dosage);
  if (newDosage.routes.length > 0) {
    stats.withDosage++;
    stats.dosageRoutes += newDosage.routes.length;

    // Track sources
    if (parsedData.dosage) {
      const bestEntries = selectBestDosagePerRoute(parsedData.dosage);
      for (const entry of bestEntries) {
        stats.dosageSources[entry.source] = (stats.dosageSources[entry.source] || 0) + 1;
      }
    }
  }
  updated.dosage = newDosage;

  // Transform duration
  const newDuration = transformDuration(parsedData.duration);
  if (newDuration.routes.length > 0) {
    stats.withDuration++;
    stats.durationRoutes += newDuration.routes.length;

    // Track sources
    if (parsedData.duration) {
      const bestEntries = selectBestDurationPerRoute(parsedData.duration);
      for (const entry of bestEntries) {
        stats.durationSources[entry.source] = (stats.durationSources[entry.source] || 0) + 1;
      }
    }
  }
  updated.duration = newDuration;

  if (verbose) {
    const dosageCount = newDosage.routes.length;
    const durationCount = newDuration.routes.length;
    if (dosageCount > 0 || durationCount > 0) {
      console.log(`  ${article.title}: ${dosageCount} dosage routes, ${durationCount} duration routes`);
    }
  }

  return updated;
});

// === Output Summary ===

console.log("\n" + "=".repeat(60));
console.log("DOSAGE & DURATION PREPOPULATION");
console.log("=".repeat(60));
console.log(`\nMode: ${dryRun ? "DRY RUN (no changes written)" : "APPLY CHANGES"}`);

console.log(`\n--- Coverage ---`);
console.log(`  Total articles:       ${stats.articlesProcessed}`);
console.log(`  With dosage data:     ${stats.withDosage} (${(stats.withDosage / stats.articlesProcessed * 100).toFixed(1)}%)`);
console.log(`  With duration data:   ${stats.withDuration} (${(stats.withDuration / stats.articlesProcessed * 100).toFixed(1)}%)`);
console.log(`  No parsed data:       ${stats.noData.length}`);

console.log(`\n--- Routes Created ---`);
console.log(`  Dosage routes:        ${stats.dosageRoutes}`);
console.log(`  Duration routes:      ${stats.durationRoutes}`);
if (stats.withDosage > 0) {
  console.log(`  Avg dosage routes:    ${(stats.dosageRoutes / stats.withDosage).toFixed(2)} per substance`);
}
if (stats.withDuration > 0) {
  console.log(`  Avg duration routes:  ${(stats.durationRoutes / stats.withDuration).toFixed(2)} per substance`);
}

console.log(`\n--- Dosage Sources Used ---`);
const sortedDosageSources = Object.entries(stats.dosageSources)
  .sort((a, b) => b[1] - a[1]);
for (const [src, count] of sortedDosageSources) {
  console.log(`  ${src}: ${count} routes`);
}

console.log(`\n--- Duration Sources Used ---`);
const sortedDurationSources = Object.entries(stats.durationSources)
  .sort((a, b) => b[1] - a[1]);
for (const [src, count] of sortedDurationSources) {
  console.log(`  ${src}: ${count} routes`);
}

if (verbose && stats.noData.length > 0) {
  console.log(`\n--- No Parsed Data (${stats.noData.length}) ---`);
  stats.noData.slice(0, 20).forEach(s => console.log(`  - ${s}`));
  if (stats.noData.length > 20) {
    console.log(`  ... and ${stats.noData.length - 20} more`);
  }
}

// Write if not dry run
if (!dryRun) {
  fs.writeFileSync(articlesPath, JSON.stringify(modifiedArticles, null, 2) + "\n");
  console.log(`\n Changes written to ${articlesPath}`);
} else {
  console.log("\n Dry run - no changes written. Remove --dry-run to apply.");
}

console.log("");
