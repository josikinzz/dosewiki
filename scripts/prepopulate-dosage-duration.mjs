#!/usr/bin/env node
/**
 * Prepopulate dosage and duration from parsed-sources.json
 *
 * Transforms and normalizes data to match the articles.json schema:
 * - Renames dose level "common" → "moderate"
 * - Renames duration stages to snake_case (comeUp → come_up, etc.)
 * - Normalizes units (ug → µg, lowercase)
 * - Normalizes route names
 * - Fills missing fields with null values
 *
 * SOURCE SELECTION:
 * - Dosage: Selects the SAFEST source (lowest upper bound) for harm reduction
 * - Duration: Priority order: PsychonautWiki > Erowid > TripSit > DEIS > TDC > DUB
 *
 * This script REPLACES existing dosage/duration data with the selected sources.
 * All other article fields are preserved unchanged.
 *
 * Usage:
 *   node scripts/prepopulate-dosage-duration.mjs --dry-run       # Preview changes (RECOMMENDED)
 *   node scripts/prepopulate-dosage-duration.mjs                 # Apply changes
 *   node scripts/prepopulate-dosage-duration.mjs --verbose       # Show per-article details
 *   node scripts/prepopulate-dosage-duration.mjs --substance=lsd,mdma  # Only process specific substances
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

// Parse --substance=slug,slug flag
const substanceArg = args.find(arg => arg.startsWith("--substance="));
const targetSubstances = substanceArg
  ? substanceArg.split("=")[1].split(",").map(s => s.trim().toLowerCase())
  : null;

// === Configuration ===

// Source priority for NON-WEIGHT units fallback (lower index = higher priority)
const SOURCE_PRIORITY = [
  "erowid",
  "tripsit-factsheets",
  "thedrugclassroom",
  "psychonautwiki",
  "tripsit-wiki",
  "disregardeverythingisay",
  "drugusersbible"
];

// Duration source priority (lower index = higher priority)
// PsychonautWiki has the most complete duration data
const DURATION_SOURCE_PRIORITY = [
  "psychonautwiki",
  "erowid",
  "tripsit-factsheets",
  "tripsit-wiki",
  "disregardeverythingisay",
  "thedrugclassroom",
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
  "oral/sublingual/buccal": "Oral",
  // Semantic route names for natural sources (map to Oral)
  hbwr: "Oral",
  "hawaiian baby woodrose": "Oral",
  morning_glory: "Oral",
  "morning glory": "Oral",
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

function getDurationSourcePriority(source) {
  const idx = DURATION_SOURCE_PRIORITY.indexOf(source);
  return idx === -1 ? DURATION_SOURCE_PRIORITY.length : idx;
}

// === Dose Safety Comparison Functions ===

/**
 * Check if unit is a weight-based unit (can be compared numerically)
 */
function isWeightUnit(unit) {
  if (!unit) return true;
  const u = unit.toLowerCase();
  return ['mg', 'g', 'grams', 'gram', 'µg', 'ug', 'mcg', 'micrograms', 'microgram', 'milligrams', 'milligram'].includes(u);
}

/**
 * Get the upper bound value for comparison (lower = safer)
 * Priority: heavy.min → strong.max → strong.min → common.max
 */
function getComparableUpperBound(ranges) {
  if (!ranges) return { value: Infinity, isWeight: true };

  const heavy = ranges.heavy;
  const strong = ranges.strong;
  const common = ranges.common;

  let value = null;
  let unit = 'mg';

  if (heavy?.min != null) {
    value = heavy.min;
    unit = heavy.unit;
  } else if (strong?.max != null) {
    value = strong.max;
    unit = strong.unit;
  } else if (strong?.min != null) {
    value = strong.min;
    unit = strong.unit;
  } else if (common?.max != null) {
    value = common.max;
    unit = common.unit;
  }

  if (value == null) return { value: Infinity, isWeight: true };

  // Check if weight unit
  if (!isWeightUnit(unit)) {
    return { value, isWeight: false, unit };
  }

  // Normalize to mg for comparison
  const u = (unit || 'mg').toLowerCase();
  if (u === 'µg' || u === 'ug' || u === 'mcg' || u === 'microgram' || u === 'micrograms') {
    value = value / 1000;
  } else if (u === 'g' || u === 'grams' || u === 'gram') {
    value = value * 1000;
  }

  return { value, isWeight: true };
}

/**
 * Count number of filled tiers (for tiebreaker - more complete = better)
 */
function countFilledDoseTiers(ranges) {
  if (!ranges) return 0;
  return ['threshold', 'light', 'common', 'strong', 'heavy']
    .filter(tier => ranges[tier]?.min != null || ranges[tier]?.max != null)
    .length;
}

/**
 * Select the safest dose source - the one with the LOWEST upper bound
 * (most conservative = safest for harm reduction)
 */
function selectSafestDoseSource(entriesForRoute) {
  if (!entriesForRoute?.length) return null;

  // Separate weight vs non-weight unit entries
  const weighted = entriesForRoute.filter(e => {
    const { isWeight } = getComparableUpperBound(e.ranges);
    return isWeight;
  });

  // If no weight-unit entries, fall back to source priority
  if (weighted.length === 0) {
    return [...entriesForRoute].sort(
      (a, b) => getSourcePriority(a.source) - getSourcePriority(b.source)
    )[0];
  }

  // Sort by upper bound (lowest = safest), then by completeness (tiebreaker)
  const sorted = [...weighted].sort((a, b) => {
    const aUpper = getComparableUpperBound(a.ranges).value;
    const bUpper = getComparableUpperBound(b.ranges).value;

    if (aUpper !== bUpper) return aUpper - bUpper; // Lower upper bound = safer

    // Tiebreaker: most complete data
    const aCount = countFilledDoseTiers(a.ranges);
    const bCount = countFilledDoseTiers(b.ranges);
    return bCount - aCount; // Higher count = more complete = preferred
  });

  return sorted[0];
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

/**
 * Check if a dose tier has actual data (not just nulls)
 */
function tierHasData(tier) {
  if (!tier) return false;
  return tier.min != null || tier.max != null;
}

/**
 * Merge dose tiers from multiple sources for a single route.
 * Strategy: Start with SAFEST source (lowest upper bound), fill gaps from other sources.
 * This ensures we prioritize harm reduction while getting complete data.
 */
function mergeDoseTiers(entriesForRoute) {
  if (!entriesForRoute || entriesForRoute.length === 0) return null;

  // Select the safest source as base (lowest upper bound)
  const base = selectSafestDoseSource(entriesForRoute);
  if (!base) return null;

  const mergedRanges = JSON.parse(JSON.stringify(base.ranges || {}));

  // Track which tiers we've filled
  const TIER_LEVELS = ["threshold", "light", "common", "strong", "heavy"];

  // Sort remaining entries by completeness (most complete first) for gap-filling
  const others = entriesForRoute
    .filter(e => e !== base)
    .sort((a, b) => countFilledDoseTiers(b.ranges) - countFilledDoseTiers(a.ranges));

  // Fill gaps from other sources
  for (const entry of others) {
    if (!entry.ranges) continue;

    for (const tier of TIER_LEVELS) {
      if (!tierHasData(mergedRanges[tier]) && tierHasData(entry.ranges[tier])) {
        mergedRanges[tier] = entry.ranges[tier];
      }
    }
  }

  // Return merged entry (use base for metadata like bioavailability, notes)
  return {
    ...base,
    ranges: mergedRanges,
    // Track that this was merged from multiple sources
    mergedFrom: [base.source, ...others.map(e => e.source)]
  };
}

/**
 * Select the safest dosage data for each route.
 * For each route, picks the source with the lowest upper bound (most conservative).
 * Then fills gaps from other sources to get complete tier data.
 */
function selectBestDosagePerRoute(dosageEntries) {
  if (!dosageEntries || dosageEntries.length === 0) return [];

  // Group entries by normalized route
  const byRoute = new Map();
  for (const entry of dosageEntries) {
    const route = normalizeRoute(entry.route);
    if (!byRoute.has(route)) {
      byRoute.set(route, []);
    }
    byRoute.get(route).push(entry);
  }

  // Determine route order from highest-priority source (for stable ordering)
  const bySource = new Map();
  for (const entry of dosageEntries) {
    const source = entry.source;
    if (!bySource.has(source)) {
      bySource.set(source, []);
    }
    bySource.get(source).push(entry);
  }

  const sortedSources = Array.from(bySource.keys()).sort(
    (a, b) => getSourcePriority(a) - getSourcePriority(b)
  );
  const primarySource = sortedSources[0];
  const primaryRoutes = bySource.get(primarySource) || [];
  const routeOrderFromPrimary = primaryRoutes.map(e => normalizeRoute(e.route));

  // Build result - for each route, select SAFEST source and merge tiers
  const result = [];
  const added = new Set();

  // Add routes in primary source order first (for stable UI ordering)
  for (const route of routeOrderFromPrimary) {
    if (byRoute.has(route) && !added.has(route)) {
      const merged = mergeDoseTiers(byRoute.get(route));
      if (merged) {
        result.push(merged);
        added.add(route);
      }
    }
  }

  // Add any remaining routes not in primary source
  for (const [route, entries] of byRoute) {
    if (!added.has(route)) {
      const merged = mergeDoseTiers(entries);
      if (merged) {
        result.push(merged);
        added.add(route);
      }
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

/**
 * Select the best duration data for each route.
 * Uses DURATION_SOURCE_PRIORITY: PsychonautWiki > Erowid > TripSit > DEIS > TDC > DUB
 * Prefers more complete data, then higher priority source.
 */
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

  // Find the highest-priority source that has routes (using DURATION priority)
  const sortedSources = Array.from(bySource.keys()).sort(
    (a, b) => getDurationSourcePriority(a) - getDurationSourcePriority(b)
  );
  const primarySource = sortedSources[0];
  const primaryRoutes = bySource.get(primarySource) || [];

  // Build ordered route list from primary source
  const routeOrderFromPrimary = primaryRoutes.map(e => normalizeRoute(e.route));

  // Collect best data for each route (prefer most complete, then highest priority)
  const byRoute = new Map();
  for (const entry of durationEntries) {
    const route = normalizeRoute(entry.route);
    const sourcePriority = getDurationSourcePriority(entry.source);
    const existing = byRoute.get(route);

    if (!existing) {
      byRoute.set(route, entry);
    } else {
      const newCount = countFilledDurationFields(entry.stages);
      const existingCount = countFilledDurationFields(existing.stages);

      if (newCount > existingCount) {
        byRoute.set(route, entry);
      } else if (newCount === existingCount &&
                 sourcePriority < getDurationSourcePriority(existing.source)) {
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

// === Metrics: Before/After Comparison ===

function countPopulatedArticles(articleList) {
  let withDosage = 0;
  let withDuration = 0;
  let dosageRoutes = 0;
  let durationRoutes = 0;

  for (const article of articleList) {
    if (article.dosage?.routes?.length > 0) {
      withDosage++;
      dosageRoutes += article.dosage.routes.length;
    }
    if (article.duration?.routes?.length > 0) {
      withDuration++;
      durationRoutes += article.duration.routes.length;
    }
  }

  return { withDosage, withDuration, dosageRoutes, durationRoutes };
}

// Capture before stats
const beforeStats = countPopulatedArticles(articles);

// === Stats Tracking ===

const stats = {
  articlesProcessed: 0,
  withDosage: 0,
  withDuration: 0,
  dosageRoutes: 0,
  durationRoutes: 0,
  noData: [],
  dosageSources: {},
  durationSources: {},
  // Tracking
  skippedNotTargeted: [],   // Articles skipped because not in --substance list
  populatedDosage: [],      // Articles that received dosage data
  populatedDuration: [],    // Articles that received duration data
  overwrittenDosage: [],    // Articles where existing dosage was replaced
  overwrittenDuration: [],  // Articles where existing duration was replaced
};

// === Helper Functions ===

function hasExistingDosage(article) {
  return article.dosage?.routes?.length > 0;
}

function hasExistingDuration(article) {
  return article.duration?.routes?.length > 0;
}

// === Process Articles ===

const modifiedArticles = articles.map(article => {
  const slug = slugify(article.title);
  const parsedData = parsed.substances[slug];

  stats.articlesProcessed++;

  // Clone article for modification - preserves ALL fields
  const updated = JSON.parse(JSON.stringify(article));

  // Check if this substance is targeted (if --substance flag is used)
  if (targetSubstances && !targetSubstances.includes(slug)) {
    stats.skippedNotTargeted.push(article.title);
    return updated; // Return unchanged
  }

  if (!parsedData) {
    stats.noData.push(article.title);
    return updated; // Return unchanged - no parsed data
  }

  // Transform dosage - ALWAYS overwrite with safest source selection
  const newDosage = transformDosage(parsedData.dosage);
  const existingDosage = hasExistingDosage(article);

  if (newDosage.routes.length > 0) {
    // Replace dosage with new selection (safest source)
    updated.dosage = newDosage;
    stats.withDosage++;
    stats.dosageRoutes += newDosage.routes.length;

    if (existingDosage) {
      stats.overwrittenDosage.push(article.title);
      if (verbose) {
        console.log(`  🔄 ${article.title}: REPLACED dosage (${article.dosage.routes.length} → ${newDosage.routes.length} routes)`);
      }
    } else {
      stats.populatedDosage.push(article.title);
      if (verbose) {
        console.log(`  ✅ ${article.title}: populated ${newDosage.routes.length} dosage routes`);
      }
    }

    // Track sources
    if (parsedData.dosage) {
      const bestEntries = selectBestDosagePerRoute(parsedData.dosage);
      for (const entry of bestEntries) {
        stats.dosageSources[entry.source] = (stats.dosageSources[entry.source] || 0) + 1;
      }
    }
  }

  // Transform duration - ALWAYS overwrite with priority-based selection
  const newDuration = transformDuration(parsedData.duration);
  const existingDuration = hasExistingDuration(article);

  if (newDuration.routes.length > 0) {
    // Replace duration with new selection (priority-based)
    updated.duration = newDuration;
    stats.withDuration++;
    stats.durationRoutes += newDuration.routes.length;

    if (existingDuration) {
      stats.overwrittenDuration.push(article.title);
      if (verbose) {
        console.log(`  🔄 ${article.title}: REPLACED duration (${article.duration.routes.length} → ${newDuration.routes.length} routes)`);
      }
    } else {
      stats.populatedDuration.push(article.title);
      if (verbose) {
        console.log(`  ✅ ${article.title}: populated ${newDuration.routes.length} duration routes`);
      }
    }

    // Track sources
    if (parsedData.duration) {
      const bestEntries = selectBestDurationPerRoute(parsedData.duration);
      for (const entry of bestEntries) {
        stats.durationSources[entry.source] = (stats.durationSources[entry.source] || 0) + 1;
      }
    }
  }

  return updated;
});

// === Output Summary ===

// Capture after stats
const afterStats = countPopulatedArticles(modifiedArticles);

console.log("\n" + "=".repeat(60));
console.log("DOSAGE & DURATION PREPOPULATION");
console.log("=".repeat(60));

// Mode display
console.log(`\nMode: ${dryRun ? "DRY RUN (no changes written)" : "OVERRIDE MODE (replacing dosage/duration)"}`);
console.log(`Selection: Dosage = SAFEST (lowest upper bound) | Duration = Priority (PW > Erowid > TripSit)`);

if (targetSubstances) {
  console.log(`Targeting: ${targetSubstances.join(", ")}`);
}

// Coverage Metrics (before/after comparison)
console.log(`\n--- Coverage Metrics ---`);
console.log(`  Articles with dosage:    ${beforeStats.withDosage} → ${afterStats.withDosage} (+${afterStats.withDosage - beforeStats.withDosage})`);
console.log(`  Articles with duration:  ${beforeStats.withDuration} → ${afterStats.withDuration} (+${afterStats.withDuration - beforeStats.withDuration})`);
console.log(`  Total dosage routes:     ${beforeStats.dosageRoutes} → ${afterStats.dosageRoutes} (+${afterStats.dosageRoutes - beforeStats.dosageRoutes})`);
console.log(`  Total duration routes:   ${beforeStats.durationRoutes} → ${afterStats.durationRoutes} (+${afterStats.durationRoutes - beforeStats.durationRoutes})`);
console.log(`  Dosage coverage:         ${((afterStats.withDosage / articles.length) * 100).toFixed(1)}%`);
console.log(`  Duration coverage:       ${((afterStats.withDuration / articles.length) * 100).toFixed(1)}%`);

// Processing summary
console.log(`\n--- Processing Summary ---`);
console.log(`  Total articles:                 ${stats.articlesProcessed}`);
console.log(`  Newly populated with dosage:    ${stats.populatedDosage.length}`);
console.log(`  Overwritten dosage:             ${stats.overwrittenDosage.length}`);
console.log(`  Newly populated with duration:  ${stats.populatedDuration.length}`);
console.log(`  Overwritten duration:           ${stats.overwrittenDuration.length}`);
console.log(`  No parsed data available:       ${stats.noData.length}`);
if (targetSubstances) {
  console.log(`  Skipped (not in target list):   ${stats.skippedNotTargeted.length}`);
}

if (stats.dosageRoutes > 0 || stats.durationRoutes > 0) {
  console.log(`\n--- Routes Created ---`);
  console.log(`  Dosage routes:        ${stats.dosageRoutes}`);
  console.log(`  Duration routes:      ${stats.durationRoutes}`);
  if (stats.withDosage > 0) {
    console.log(`  Avg dosage routes:    ${(stats.dosageRoutes / stats.withDosage).toFixed(2)} per substance`);
  }
  if (stats.withDuration > 0) {
    console.log(`  Avg duration routes:  ${(stats.durationRoutes / stats.withDuration).toFixed(2)} per substance`);
  }
}

if (Object.keys(stats.dosageSources).length > 0) {
  console.log(`\n--- Dosage Sources Used ---`);
  const sortedDosageSources = Object.entries(stats.dosageSources)
    .sort((a, b) => b[1] - a[1]);
  for (const [src, count] of sortedDosageSources) {
    console.log(`  ${src}: ${count} routes`);
  }
}

if (Object.keys(stats.durationSources).length > 0) {
  console.log(`\n--- Duration Sources Used ---`);
  const sortedDurationSources = Object.entries(stats.durationSources)
    .sort((a, b) => b[1] - a[1]);
  for (const [src, count] of sortedDurationSources) {
    console.log(`  ${src}: ${count} routes`);
  }
}

// Verbose output
if (verbose) {
  if (stats.overwrittenDosage.length > 0) {
    console.log(`\n--- Overwritten Dosage (${stats.overwrittenDosage.length}) ---`);
    stats.overwrittenDosage.slice(0, 20).forEach(s => console.log(`  🔄 ${s}`));
    if (stats.overwrittenDosage.length > 20) {
      console.log(`  ... and ${stats.overwrittenDosage.length - 20} more`);
    }
  }

  if (stats.populatedDosage.length > 0) {
    console.log(`\n--- Newly Populated with Dosage (${stats.populatedDosage.length}) ---`);
    stats.populatedDosage.slice(0, 20).forEach(s => console.log(`  ✅ ${s}`));
    if (stats.populatedDosage.length > 20) {
      console.log(`  ... and ${stats.populatedDosage.length - 20} more`);
    }
  }

  if (stats.noData.length > 0) {
    console.log(`\n--- No Parsed Data (${stats.noData.length}) ---`);
    stats.noData.slice(0, 20).forEach(s => console.log(`  - ${s}`));
    if (stats.noData.length > 20) {
      console.log(`  ... and ${stats.noData.length - 20} more`);
    }
  }
}

// Write if not dry run
if (!dryRun) {
  fs.writeFileSync(articlesPath, JSON.stringify(modifiedArticles, null, 2) + "\n");
  console.log(`\n✅ Changes written to ${articlesPath}`);
  console.log(`   Run: node scripts/build/buildCompressedArticles.mjs`);
} else {
  console.log("\n📋 Dry run - no changes written. Remove --dry-run to apply.");
}

console.log("");
