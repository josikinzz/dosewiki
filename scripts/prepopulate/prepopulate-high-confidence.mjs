#!/usr/bin/env node
/**
 * Pre-populate articles with high-confidence structured data from parsed-sources.json
 *
 * Fields populated:
 * 1. Chemistry/Identification: SMILES, IUPAC, CAS, formula, weight, InChI key
 * 2. Interactions: dangerous, unsafe, caution lists
 * 3. Tolerance: full, half, baseline tolerance + cross-tolerances
 *
 * Usage:
 *   npm run prepopulate:high-confidence -- --dry-run     # Preview changes
 *   npm run prepopulate:high-confidence                  # Apply changes
 *   npm run prepopulate:high-confidence -- --slug=lsd    # Single substance
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// Load data
const articlesPath = path.join(ROOT, "src/data/SubstanceIndex.json");
const parsedPath = path.join(ROOT, "src/data/parsed-sources.json");

const articles = JSON.parse(fs.readFileSync(articlesPath, "utf-8"));
const parsed = JSON.parse(fs.readFileSync(parsedPath, "utf-8"));

// Parse CLI args
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const singleSlug = args.find(a => a.startsWith("--slug="))?.split("=")[1];
const verbose = args.includes("--verbose");

// Slugify function matching parsed-sources keys
function slugify(str) {
  return str.toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// Normalize route names for consistency
function normalizeRoute(route) {
  const normalized = route.charAt(0).toUpperCase() + route.slice(1).toLowerCase();
  // Map common variations
  const routeMap = {
    "Oral": "Oral",
    "Sublingual": "Sublingual",
    "Insufflated": "Insufflated",
    "Intranasal": "Insufflated",
    "Nasal": "Insufflated",
    "Smoked": "Smoked",
    "Inhaled": "Inhaled",
    "Intravenous": "Intravenous",
    "Iv": "Intravenous",
    "Intramuscular": "Intramuscular",
    "Im": "Intramuscular",
    "Rectal": "Rectal",
    "Transdermal": "Transdermal",
    "Buccal": "Buccal",
  };
  return routeMap[normalized] || normalized;
}

// Stats tracking
const stats = {
  articlesProcessed: 0,
  articlesModified: 0,
  fieldsPopulated: {
    smiles: 0,
    iupac_name: 0,
    cas_number: 0,
    molecular_formula: 0,
    molecular_weight: 0,
    inchi_key: 0,
    interactions_dangerous: 0,
    interactions_unsafe: 0,
    interactions_caution: 0,
    tolerance_full: 0,
    tolerance_half: 0,
    tolerance_baseline: 0,
    tolerance_cross: 0,
  },
  fieldsSkipped: {
    already_populated: 0,
    no_source_data: 0,
  },
  unmatched: [],
};

// Process each article
const modifiedArticles = articles.map(article => {
  const slug = slugify(article.title);

  // Filter by single slug if specified
  if (singleSlug && slug !== singleSlug) {
    return article;
  }

  const source = parsed.substances[slug];

  if (!source) {
    stats.unmatched.push(article.title);
    return article;
  }

  stats.articlesProcessed++;

  // Clone article for modification
  const updated = JSON.parse(JSON.stringify(article));
  let modified = false;
  const changes = [];

  // === CHEMISTRY / IDENTIFICATION ===
  if (source.chemistry) {
    const chem = source.chemistry;

    // SMILES
    if (chem.smiles && !updated.identification.smiles) {
      updated.identification.smiles = chem.smiles;
      stats.fieldsPopulated.smiles++;
      changes.push(`smiles: "${chem.smiles.slice(0, 40)}..."`);
      modified = true;
    } else if (chem.smiles && updated.identification.smiles) {
      stats.fieldsSkipped.already_populated++;
    }

    // IUPAC
    if (chem.iupac && !updated.identification.iupac_name) {
      updated.identification.iupac_name = chem.iupac;
      stats.fieldsPopulated.iupac_name++;
      changes.push(`iupac_name: "${chem.iupac.slice(0, 50)}..."`);
      modified = true;
    } else if (chem.iupac && updated.identification.iupac_name) {
      stats.fieldsSkipped.already_populated++;
    }

    // CAS
    if (chem.cas && !updated.identification.cas_number) {
      updated.identification.cas_number = chem.cas;
      stats.fieldsPopulated.cas_number++;
      changes.push(`cas_number: "${chem.cas}"`);
      modified = true;
    } else if (chem.cas && updated.identification.cas_number) {
      stats.fieldsSkipped.already_populated++;
    }

    // Molecular formula
    if (chem.formula && !updated.identification.molecular_formula) {
      updated.identification.molecular_formula = chem.formula;
      stats.fieldsPopulated.molecular_formula++;
      changes.push(`molecular_formula: "${chem.formula}"`);
      modified = true;
    } else if (chem.formula && updated.identification.molecular_formula) {
      stats.fieldsSkipped.already_populated++;
    }

    // Molecular weight (add g/mol if missing)
    if (chem.molecularWeight && !updated.identification.molecular_weight) {
      let weight = chem.molecularWeight;
      if (!weight.includes("g/mol") && !weight.includes("g·mol")) {
        weight = `${weight} g/mol`;
      }
      updated.identification.molecular_weight = weight;
      stats.fieldsPopulated.molecular_weight++;
      changes.push(`molecular_weight: "${weight}"`);
      modified = true;
    } else if (chem.molecularWeight && updated.identification.molecular_weight) {
      stats.fieldsSkipped.already_populated++;
    }

    // InChI key
    if (chem.inchiKey && !updated.identification.inchi_key) {
      updated.identification.inchi_key = chem.inchiKey;
      stats.fieldsPopulated.inchi_key++;
      changes.push(`inchi_key: "${chem.inchiKey}"`);
      modified = true;
    } else if (chem.inchiKey && updated.identification.inchi_key) {
      stats.fieldsSkipped.already_populated++;
    }
  }

  // === INTERACTIONS ===
  if (source.interactions && source.interactions.length > 0) {
    // Extract substance names by severity
    const dangerous = source.interactions
      .filter(i => i.severity === "dangerous")
      .map(i => i.substance);
    const unsafe = source.interactions
      .filter(i => i.severity === "unsafe")
      .map(i => i.substance);
    const caution = source.interactions
      .filter(i => i.severity === "caution")
      .map(i => i.substance);

    // Dangerous
    if (dangerous.length > 0 && updated.interactions.dangerous.length === 0) {
      updated.interactions.dangerous = dangerous;
      stats.fieldsPopulated.interactions_dangerous++;
      changes.push(`dangerous: [${dangerous.length} items]`);
      modified = true;
    } else if (dangerous.length > 0 && updated.interactions.dangerous.length > 0) {
      stats.fieldsSkipped.already_populated++;
    }

    // Unsafe
    if (unsafe.length > 0 && updated.interactions.unsafe.length === 0) {
      updated.interactions.unsafe = unsafe;
      stats.fieldsPopulated.interactions_unsafe++;
      changes.push(`unsafe: [${unsafe.length} items]`);
      modified = true;
    } else if (unsafe.length > 0 && updated.interactions.unsafe.length > 0) {
      stats.fieldsSkipped.already_populated++;
    }

    // Caution
    if (caution.length > 0 && updated.interactions.caution.length === 0) {
      updated.interactions.caution = caution;
      stats.fieldsPopulated.interactions_caution++;
      changes.push(`caution: [${caution.length} items]`);
      modified = true;
    } else if (caution.length > 0 && updated.interactions.caution.length > 0) {
      stats.fieldsSkipped.already_populated++;
    }
  }

  // === TOLERANCE ===
  if (source.tolerance && source.tolerance.length > 0) {
    const tol = source.tolerance[0];

    // Full tolerance
    if (tol.fullTolerance && !updated.tolerance.full_tolerance) {
      updated.tolerance.full_tolerance = tol.fullTolerance;
      stats.fieldsPopulated.tolerance_full++;
      changes.push(`full_tolerance: "${tol.fullTolerance}"`);
      modified = true;
    } else if (tol.fullTolerance && updated.tolerance.full_tolerance) {
      stats.fieldsSkipped.already_populated++;
    }

    // Half tolerance
    if (tol.halfTolerance && !updated.tolerance.half_tolerance) {
      updated.tolerance.half_tolerance = tol.halfTolerance;
      stats.fieldsPopulated.tolerance_half++;
      changes.push(`half_tolerance: "${tol.halfTolerance}"`);
      modified = true;
    } else if (tol.halfTolerance && updated.tolerance.half_tolerance) {
      stats.fieldsSkipped.already_populated++;
    }

    // Baseline tolerance
    if (tol.baselineTolerance && !updated.tolerance.baseline_tolerance) {
      updated.tolerance.baseline_tolerance = tol.baselineTolerance;
      stats.fieldsPopulated.tolerance_baseline++;
      changes.push(`baseline_tolerance: "${tol.baselineTolerance}"`);
      modified = true;
    } else if (tol.baselineTolerance && updated.tolerance.baseline_tolerance) {
      stats.fieldsSkipped.already_populated++;
    }

    // Cross tolerance
    if (tol.crossTolerances && tol.crossTolerances.length > 0 && updated.tolerance.cross_tolerance.length === 0) {
      updated.tolerance.cross_tolerance = tol.crossTolerances;
      stats.fieldsPopulated.tolerance_cross++;
      changes.push(`cross_tolerance: [${tol.crossTolerances.length} items]`);
      modified = true;
    } else if (tol.crossTolerances?.length > 0 && updated.tolerance.cross_tolerance.length > 0) {
      stats.fieldsSkipped.already_populated++;
    }
  }

  if (modified) {
    stats.articlesModified++;
    if (verbose || singleSlug) {
      console.log(`\n📝 ${article.title}:`);
      changes.forEach(c => console.log(`   + ${c}`));
    }
  }

  return updated;
});

// Output summary
console.log("\n" + "=".repeat(60));
console.log("PRE-POPULATION SUMMARY");
console.log("=".repeat(60));
console.log(`\nMode: ${dryRun ? "DRY RUN (no changes written)" : "APPLY CHANGES"}`);
console.log(`\nArticles processed: ${stats.articlesProcessed}`);
console.log(`Articles modified: ${stats.articlesModified}`);
console.log(`Unmatched articles: ${stats.unmatched.length}`);

console.log("\n--- Fields Populated ---");
console.log(`  identification.smiles:        ${stats.fieldsPopulated.smiles}`);
console.log(`  identification.iupac_name:    ${stats.fieldsPopulated.iupac_name}`);
console.log(`  identification.cas_number:    ${stats.fieldsPopulated.cas_number}`);
console.log(`  identification.molecular_formula: ${stats.fieldsPopulated.molecular_formula}`);
console.log(`  identification.molecular_weight:  ${stats.fieldsPopulated.molecular_weight}`);
console.log(`  identification.inchi_key:     ${stats.fieldsPopulated.inchi_key}`);
console.log(`  interactions.dangerous:       ${stats.fieldsPopulated.interactions_dangerous}`);
console.log(`  interactions.unsafe:          ${stats.fieldsPopulated.interactions_unsafe}`);
console.log(`  interactions.caution:         ${stats.fieldsPopulated.interactions_caution}`);
console.log(`  tolerance.full_tolerance:     ${stats.fieldsPopulated.tolerance_full}`);
console.log(`  tolerance.half_tolerance:     ${stats.fieldsPopulated.tolerance_half}`);
console.log(`  tolerance.baseline_tolerance: ${stats.fieldsPopulated.tolerance_baseline}`);
console.log(`  tolerance.cross_tolerance:    ${stats.fieldsPopulated.tolerance_cross}`);

const totalPopulated = Object.values(stats.fieldsPopulated).reduce((a, b) => a + b, 0);
console.log(`\nTotal fields populated: ${totalPopulated}`);
console.log(`Fields skipped (already populated): ${stats.fieldsSkipped.already_populated}`);

if (stats.unmatched.length > 0 && verbose) {
  console.log("\n--- Unmatched Articles ---");
  stats.unmatched.forEach(t => console.log(`  - ${t}`));
}

// Write if not dry run
if (!dryRun) {
  fs.writeFileSync(articlesPath, JSON.stringify(modifiedArticles, null, 2) + "\n");
  console.log(`\n✅ Changes written to ${articlesPath}`);
} else {
  console.log("\n⚠️  Dry run - no changes written. Remove --dry-run to apply.");
}

console.log("");
