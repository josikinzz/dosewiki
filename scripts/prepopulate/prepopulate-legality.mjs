#!/usr/bin/env node
/**
 * Prepopulate legality data from parsed-sources.json
 *
 * Source Priority (Wikipedia most current for legal status):
 * 1. Wikipedia - Academic, frequently updated
 * 2. PsychonautWiki - Good community coverage
 * 3. Erowid - Historical detail (may be dated)
 *
 * Aggregation Strategy:
 * - Combine ALL countries from ALL sources (maximize coverage)
 * - Deduplicate per-country: if multiple sources cover same country, use highest priority
 * - Deduplicate international treaties
 *
 * Usage:
 *   node scripts/prepopulate-legality.mjs --dry-run     # Preview changes
 *   node scripts/prepopulate-legality.mjs               # Apply changes
 *   node scripts/prepopulate-legality.mjs --verbose     # Show details
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { tryWriteArtifactLineageSidecar } from "../lib/data-artifact-lineage.mjs";
import {
  assertDataOpsWriteAllowed,
  createDataOpsRunContext,
  printDataOpsRunContext,
} from "../lib/data-ops-run-context.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const repoRoot = path.resolve(__dirname, "..", "..");

// Load data
const articlesPath = path.join(ROOT, "src/data/SubstanceIndex.json");
const parsedPath = path.join(ROOT, "src/data/parsed-sources.json");

const articles = JSON.parse(fs.readFileSync(articlesPath, "utf-8"));
const parsed = JSON.parse(fs.readFileSync(parsedPath, "utf-8"));

// Parse CLI args
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const verbose = args.includes("--verbose");
const runContext = createDataOpsRunContext({
  operation: "prepopulate legality",
  intent: "local-prepopulate",
  sourceUrlKeys: [],
  targetUrlKeys: [],
  localArtifacts: ["src/data/SubstanceIndex.json", "src/data/parsed-sources.json"],
});

// === Configuration ===

// Source priority (lower index = higher priority)
// Wikipedia > PsychonautWiki > Erowid for legal status
const SOURCE_PRIORITY = [
  "wikipedia",
  "psychonautwiki",
  "erowid",
  "tripsit-factsheets",
  "tripsit-wiki",
  "thedrugclassroom",
  "disregardeverythingisay",
  "drugusersbible",
];

// US States - will be prefixed with "United States - "
const US_STATES = new Set([
  "alabama", "alaska", "arizona", "arkansas", "california", "colorado",
  "connecticut", "delaware", "florida", "georgia", "hawaii", "idaho",
  "illinois", "indiana", "iowa", "kansas", "kentucky", "louisiana",
  "maine", "maryland", "massachusetts", "michigan", "minnesota", "mississippi",
  "missouri", "montana", "nebraska", "nevada", "new hampshire", "new jersey",
  "new mexico", "new york", "north carolina", "north dakota", "ohio", "oklahoma",
  "oregon", "pennsylvania", "rhode island", "south carolina", "south dakota",
  "tennessee", "texas", "utah", "vermont", "virginia", "washington",
  "west virginia", "wisconsin", "wyoming", "district of columbia", "puerto rico"
]);

// Country name normalization (additional to what parsers do)
const COUNTRY_NORMALIZE = {
  // United States
  "usa": "United States",
  "us": "United States",
  "u.s.": "United States",
  "united states": "United States",
  // United Kingdom
  "uk": "United Kingdom",
  "great britain": "United Kingdom",
  "england": "United Kingdom",
  "united kingdom": "United Kingdom",
  // Germany
  "deutschland": "Germany",
  "gemany": "Germany", // typo fix
  // Italy
  "italia": "Italy",
  // Brazil
  "brasil": "Brazil",
  // Netherlands
  "the netherlands": "Netherlands",
  "holland": "Netherlands",
  "netherlands": "Netherlands",
  // Czech Republic
  "czech republic": "Czech Republic",
  "czechia": "Czech Republic",
  "slovak republic": "Slovakia",
  // European Union
  "e.u.": "European Union",
  "the eu": "European Union",
  "eu": "European Union",
  "european union": "European Union",
  // New Zealand typo
  "new zeland": "New Zealand",
  "new zealand": "New Zealand",
  "australia and new zealand": "Australia", // simplify
  // International
  "international": "International",
  // Skip non-country entries
  "elsewhere": null,
  "south america": null,
};

function normalizeCountry(country) {
  if (!country) return null;

  // Remove trailing colon, extra whitespace
  let cleaned = country.trim().replace(/:$/, "").trim();

  // Skip entries starting with # (header markers)
  if (cleaned.startsWith("#")) return null;

  // Skip very short or very long entries
  if (cleaned.length < 2 || cleaned.length > 50) return null;

  // Remove date/legal suffixes: "as of May", "on July", "since", "under the NpSG", etc.
  cleaned = cleaned
    .replace(/\s+(?:as of|on|since)(?:\s+.*)?$/i, "")  // "as of [anything]" or just "as of"
    .replace(/\s+under the NpSG.*$/i, "")  // German NpSG reference
    .replace(/\s+as$/, "")  // trailing "as"
    .trim();

  // Skip meta/category entries (not actual countries)
  const skipPatterns = [
    /^international/i,
    /^other/i,
    /^controlled$/i,
    /^schedule/i,
    /^many\s/i,
    /^the$/i,
    /^new$/i,  // truncated "New Zealand"
    /doping/i,
    /clinic/i,
    /prescription/i,
    /narcotics law/i,
    /same category/i,
    /^additive/i,
    /^misuse/i,
    /drug control/i,
    /^un\s/i,  // UN conventions
    /^united nations$/i,
    /convention/i,
    /\band\b/i,  // combined countries like "Japan and China"
    /^state of/i,
    /^victoria\s/i,  // Victoria Australia -> should be Australia
  ];

  for (const pattern of skipPatterns) {
    if (pattern.test(cleaned)) return null;
  }

  const key = cleaned.toLowerCase();

  // Check if it's in normalize map (null means skip)
  if (key in COUNTRY_NORMALIZE) {
    return COUNTRY_NORMALIZE[key]; // may be null to skip
  }

  // Check if it's a US state - prefix with "United States - "
  if (US_STATES.has(key)) {
    // Capitalize state name properly
    const stateName = cleaned.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
    return `United States - ${stateName}`;
  }

  // Handle "Republic of Moldova" -> "Moldova"
  if (key === "republic of moldova") return "Moldova";

  return cleaned;
}

import { slugify } from "../lib/slug.mjs";

function getSourcePriority(source) {
  const idx = SOURCE_PRIORITY.indexOf(source);
  return idx === -1 ? SOURCE_PRIORITY.length : idx;
}

// === Status Extraction ===

function cleanCitationNeeded(text) {
  if (!text) return text;
  // Remove various forms of "citation needed" markers
  return text
    .replace(/\s*\[?citation needed\]?\s*/gi, " ")
    .replace(/\s*\[?\[citation needed\]\]?\s*/gi, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function extractStatusAndNotes(fullText) {
  if (!fullText) return { status: "", notes: "" };

  // Clean citation needed markers first
  const text = cleanCitationNeeded(fullText.trim());

  // Try to extract classification patterns
  const patterns = [
    /^(Schedule\s+[IVX0-9]+)/i,
    /^(Class\s+[A-C])/i,
    /^(Anlage\s+[IVX0-9]+)/i,
    /^(List\s+[IVX0-9]+)/i,
    /^(Category\s+[A-Z0-9]+)/i,
    /^(Controlled)/i,
    /^(Prohibited)/i,
    /^(Illegal)/i,
    /^(Legal)/i,
    /^(Uncontrolled)/i,
    /^(Decriminalized)/i,
    /^(Not scheduled)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const status = match[1];
      const remainder = text.slice(match[0].length).replace(/^[\s,\-–:]+/, "").trim();
      return { status, notes: remainder };
    }
  }

  // No classification found - use first sentence as status
  const sentenceEnd = text.search(/[.!?](?:\s|$)/);
  if (sentenceEnd > 0) {
    return {
      status: text.slice(0, sentenceEnd + 1).trim(),
      notes: text.slice(sentenceEnd + 1).trim()
    };
  }

  // No sentence break - use full text as status (no truncation)
  return { status: text, notes: "" };
}

// === Transform Legality ===

function transformLegality(parsedLegal, parsedInternational) {
  // Default empty structure
  const result = {
    international: [],
    countries: {}
  };

  // Process international treaties (deduplicate by normalized name)
  // Combine treaty name with notes for richer context
  const treatySeen = new Set();
  if (parsedInternational && parsedInternational.length > 0) {
    for (const entry of parsedInternational) {
      const normalized = entry.treaty.toLowerCase().trim();
      if (!treatySeen.has(normalized)) {
        treatySeen.add(normalized);
        // If we have notes, create a richer description
        if (entry.notes && entry.notes.length > 20) {
          // Clean up the notes - remove citation needed markers
          const cleanedNotes = cleanCitationNeeded(entry.notes);
          result.international.push(cleanedNotes);
        } else {
          // Fallback to treaty name wrapped in a complete sentence
          result.international.push(`Controlled internationally under the ${entry.treaty}.`);
        }
      }
    }
  }

  if (!parsedLegal || parsedLegal.length === 0) {
    return result;
  }

  // Helper to detect if a status is a fragment (incomplete sentence)
  // Fragments typically start with "a ", "an ", or lack a subject/verb
  function isFragment(status) {
    if (!status) return true;
    const s = status.trim();
    // Starts with article without subject (e.g., "a Class A substance")
    if (/^(a|an)\s+/i.test(s)) return true;
    // Very short and doesn't look like a complete sentence
    if (s.length < 25 && !/\b(is|are|was|were|has|have)\b/i.test(s)) return true;
    return false;
  }

  // Group entries by normalized country
  // Prefer complete sentences over fragments, then by source priority
  const byCountry = new Map();

  for (const entry of parsedLegal) {
    const country = normalizeCountry(entry.country);
    // Skip if country normalizes to null (non-country entries)
    if (!country) continue;

    const existing = byCountry.get(country);

    if (!existing) {
      byCountry.set(country, entry);
    } else {
      const existingIsFragment = isFragment(existing.status);
      const newIsFragment = isFragment(entry.status);

      // Prefer complete sentences over fragments
      if (existingIsFragment && !newIsFragment) {
        byCountry.set(country, entry);
      } else if (!existingIsFragment && newIsFragment) {
        // Keep existing (it's complete, new is fragment)
      } else {
        // Both same type - use source priority
        if (getSourcePriority(entry.source) < getSourcePriority(existing.source)) {
          byCountry.set(country, entry);
        }
      }
    }
  }

  // Convert to schema format
  for (const [country, entry] of byCountry) {
    // Use details if already extracted, otherwise extract from status
    let status, notes;

    if (entry.details) {
      // Parser already separated status and details
      status = entry.status;
      notes = entry.details;
    } else {
      // Need to extract from combined status field
      const extracted = extractStatusAndNotes(entry.status);
      status = extracted.status;
      notes = extracted.notes;
    }

    result.countries[country] = {
      status: status || "See notes",
      notes: notes || ""
    };
  }

  return result;
}

// === Stats ===

const stats = {
  articlesProcessed: 0,
  withLegalData: 0,
  withInternational: 0,
  totalCountries: 0,
  countriesCovered: new Set(),
  sourceUsage: {},
  noData: [],
};

// === Process ===

const modifiedArticles = articles.map(article => {
  const slug = slugify(article.title);
  const parsedData = parsed.substances[slug];

  stats.articlesProcessed++;

  const updated = JSON.parse(JSON.stringify(article));

  if (!parsedData || (!parsedData.legal?.length && !parsedData.internationalLaw?.length)) {
    updated.legality = { international: [], countries: {} };
    stats.noData.push(article.title);
    return updated;
  }

  const newLegality = transformLegality(
    parsedData.legal,
    parsedData.internationalLaw
  );

  const countryCount = Object.keys(newLegality.countries).length;

  if (countryCount > 0) {
    stats.withLegalData++;
    stats.totalCountries += countryCount;

    // Track countries
    for (const country of Object.keys(newLegality.countries)) {
      stats.countriesCovered.add(country);
    }

    // Track sources used (from original parsed data)
    if (parsedData.legal) {
      for (const entry of parsedData.legal) {
        stats.sourceUsage[entry.source] = (stats.sourceUsage[entry.source] || 0) + 1;
      }
    }
  }

  if (newLegality.international.length > 0) {
    stats.withInternational++;
  }

  updated.legality = newLegality;

  if (verbose) {
    const intlCount = newLegality.international.length;
    if (countryCount > 0 || intlCount > 0) {
      console.log(`  ${article.title}: ${countryCount} countries, ${intlCount} international`);
    }
  }

  return updated;
});

// === Output ===

console.log("\n" + "=".repeat(60));
console.log("LEGALITY PREPOPULATION");
console.log("=".repeat(60));
console.log(`\nMode: ${dryRun ? "DRY RUN (no changes written)" : "APPLY CHANGES"}`);
printDataOpsRunContext(runContext);

console.log(`\n--- Coverage ---`);
console.log(`  Total articles:        ${stats.articlesProcessed}`);
console.log(`  With legal data:       ${stats.withLegalData} (${(stats.withLegalData / stats.articlesProcessed * 100).toFixed(1)}%)`);
console.log(`  With international:    ${stats.withInternational}`);
console.log(`  Unique countries:      ${stats.countriesCovered.size}`);
console.log(`  Total country entries: ${stats.totalCountries}`);
console.log(`  No data:               ${stats.noData.length}`);

if (stats.withLegalData > 0) {
  console.log(`  Avg countries/article: ${(stats.totalCountries / stats.withLegalData).toFixed(2)}`);
}

console.log(`\n--- Countries Populated ---`);
const sortedCountries = [...stats.countriesCovered].sort();
// Print in rows of 5
for (let i = 0; i < sortedCountries.length; i += 5) {
  console.log(`  ${sortedCountries.slice(i, i + 5).join(", ")}`);
}

console.log(`\n--- Sources Used ---`);
const sortedSources = Object.entries(stats.sourceUsage)
  .sort((a, b) => b[1] - a[1]);
for (const [src, count] of sortedSources) {
  console.log(`  ${src}: ${count} entries`);
}

if (verbose && stats.noData.length > 0) {
  console.log(`\n--- No Legal Data (${stats.noData.length}) ---`);
  stats.noData.slice(0, 15).forEach(s => console.log(`  - ${s}`));
  if (stats.noData.length > 15) {
    console.log(`  ... and ${stats.noData.length - 15} more`);
  }
}

if (!dryRun) {
  assertDataOpsWriteAllowed(runContext);
  fs.writeFileSync(articlesPath, JSON.stringify(modifiedArticles, null, 2) + "\n");
  const lineage = tryWriteArtifactLineageSidecar({
    artifactPath: "src/data/SubstanceIndex.json",
    rootDir: repoRoot,
    producer: "scripts/prepopulate/prepopulate-legality.mjs",
    sourceDeployment: "src/data/parsed-sources.json",
    schemaVersion: "src/schema/substance.schema.ts",
    extra: {
      articlesProcessed: stats.articlesProcessed,
      withLegalData: stats.withLegalData,
      withInternational: stats.withInternational,
      totalCountries: stats.totalCountries,
    },
  });
  console.log(`\n✓ Changes written to ${articlesPath}`);
  if (lineage) {
    console.log(`🧾 Lineage metadata written to ${lineage.outputPath}`);
  }
} else {
  console.log("\n→ Dry run - no changes written. Remove --dry-run to apply.");
}

console.log("");
