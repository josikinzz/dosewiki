#!/usr/bin/env node
/**
 * Migration script: Transform harm_potential from old schema to new structured schema
 *
 * Old schema:
 *   harm_potential:
 *     addiction_liability: string
 *     dependence_liability: string
 *     toxicity: { ld50, organ_toxicity, carcinogenicity, other }
 *     risks: { psychosis, self_harm, seizure, other[] }
 *
 * New schema:
 *   harm_potential:
 *     addiction:
 *       psychological: { level, description }
 *       physical_dependence: { level, description }
 *     toxicity:
 *       ld50: Array<{ species, route, value, unit }>
 *       organ_toxicity: Array<{ system, findings, mechanism, notes }>
 *       carcinogenicity: { level, evidence, description }
 *       antibiotic_function: { level, description }
 *       other: string
 *     risks:
 *       psychosis: { level, description }
 *       seizure: { level, description }
 *       self_harm: { level, description }
 *       other: string[]
 *
 * Usage:
 *   node scripts/migrate-harm-potential-schema.mjs --dry-run
 *   node scripts/migrate-harm-potential-schema.mjs
 */

import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

// Parse command line arguments
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const verbose = args.includes("--verbose");

// Initialize Convex client
const convexUrl = process.env.CONVEX_URL || process.env.VITE_CONVEX_URL;
if (!convexUrl) {
  console.error("Error: CONVEX_URL or VITE_CONVEX_URL environment variable is required");
  process.exit(1);
}

const client = new ConvexHttpClient(convexUrl);

/**
 * Create empty new harm_potential structure
 */
function createEmptyHarmPotential() {
  return {
    addiction: {
      psychological: { level: null, description: "" },
      physical_dependence: { level: null, description: "" },
    },
    toxicity: {
      ld50: [],
      organ_toxicity: [],
      carcinogenicity: { level: null, evidence: null, description: "" },
      antibiotic_function: { level: null, description: "" },
      other: "",
    },
    risks: {
      psychosis: { level: null, description: "" },
      seizure: { level: null, description: "" },
      self_harm: { level: null, description: "" },
      other: [],
    },
  };
}

/**
 * Check if harm_potential is in the old format
 */
function isOldFormat(hp) {
  if (!hp) return false;
  // Old format has addiction_liability/dependence_liability at top level
  return (
    hp.addiction_liability !== undefined ||
    hp.dependence_liability !== undefined ||
    // Or toxicity fields are strings instead of structured
    typeof hp.toxicity?.ld50 === "string" ||
    typeof hp.toxicity?.organ_toxicity === "string" ||
    // Or risks fields are strings instead of objects
    typeof hp.risks?.psychosis === "string" ||
    typeof hp.risks?.seizure === "string" ||
    typeof hp.risks?.self_harm === "string"
  );
}

/**
 * Migrate a single harm_potential object from old to new format
 */
function migrateHarmPotential(oldHp) {
  if (!oldHp) return createEmptyHarmPotential();

  const newHp = createEmptyHarmPotential();

  // Migrate addiction fields
  if (oldHp.addiction_liability) {
    newHp.addiction.psychological.description = oldHp.addiction_liability;
  }
  if (oldHp.dependence_liability) {
    newHp.addiction.physical_dependence.description = oldHp.dependence_liability;
  }

  // Migrate toxicity fields
  if (oldHp.toxicity) {
    // ld50: string -> array (keep as single entry in description for now)
    if (typeof oldHp.toxicity.ld50 === "string" && oldHp.toxicity.ld50.trim()) {
      // Parse simple LD50 string if possible, otherwise leave as-is
      // The batch generation will fill in structured data later
      newHp.toxicity.ld50 = [];
      // Store in carcinogenicity.description temporarily? No, better to use other
      // Actually, let's store the old ld50 text in a special first entry
      newHp.toxicity.ld50.push({
        species: "",
        route: "",
        value: null,
        unit: oldHp.toxicity.ld50.trim(),  // Store full text in unit field temporarily
      });
    }

    // organ_toxicity: string -> array
    if (typeof oldHp.toxicity.organ_toxicity === "string" && oldHp.toxicity.organ_toxicity.trim()) {
      newHp.toxicity.organ_toxicity.push({
        system: "",
        findings: oldHp.toxicity.organ_toxicity.trim(),
        mechanism: "",
        notes: "",
      });
    }

    // carcinogenicity: string -> object
    if (typeof oldHp.toxicity.carcinogenicity === "string" && oldHp.toxicity.carcinogenicity.trim()) {
      newHp.toxicity.carcinogenicity.description = oldHp.toxicity.carcinogenicity.trim();
    }

    // other: string -> string (keep as-is)
    if (typeof oldHp.toxicity.other === "string") {
      newHp.toxicity.other = oldHp.toxicity.other;
    }
  }

  // Migrate risks fields
  if (oldHp.risks) {
    // psychosis: string -> object
    if (typeof oldHp.risks.psychosis === "string" && oldHp.risks.psychosis.trim()) {
      newHp.risks.psychosis.description = oldHp.risks.psychosis.trim();
    }

    // seizure: string -> object
    if (typeof oldHp.risks.seizure === "string" && oldHp.risks.seizure.trim()) {
      newHp.risks.seizure.description = oldHp.risks.seizure.trim();
    }

    // self_harm: string -> object
    if (typeof oldHp.risks.self_harm === "string" && oldHp.risks.self_harm.trim()) {
      newHp.risks.self_harm.description = oldHp.risks.self_harm.trim();
    }

    // other: array -> array (keep as-is)
    if (Array.isArray(oldHp.risks.other)) {
      newHp.risks.other = oldHp.risks.other;
    }
  }

  return newHp;
}

/**
 * Main migration function
 */
async function main() {
  console.log("\nHarm Potential Schema Migration");
  console.log("=".repeat(50));
  console.log(`Mode: ${dryRun ? "DRY RUN" : "LIVE"}`);
  console.log();

  // Fetch all substances from Convex
  console.log("Fetching substances from Convex...");
  const substances = await client.query(api.substanceIndex.getAll);
  console.log(`Found ${substances.length} substances`);

  // Find substances that need migration
  const needsMigration = substances.filter(s => isOldFormat(s.harm_potential));
  console.log(`${needsMigration.length} substances need migration`);

  if (needsMigration.length === 0) {
    console.log("\nNo migration needed. All substances are already in new format.");
    return;
  }

  // Preview changes
  console.log("\nSubstances to migrate:");
  for (const substance of needsMigration.slice(0, 10)) {
    const oldHp = substance.harm_potential;
    const hasData =
      oldHp?.addiction_liability ||
      oldHp?.dependence_liability ||
      oldHp?.toxicity?.ld50 ||
      oldHp?.risks?.psychosis;
    console.log(`  - ${substance.title}${hasData ? " (has data)" : " (empty)"}`);
  }
  if (needsMigration.length > 10) {
    console.log(`  ... and ${needsMigration.length - 10} more`);
  }

  if (dryRun) {
    console.log("\n[DRY RUN] Would migrate the above substances.");

    // Show example transformation
    const example = needsMigration.find(s =>
      s.harm_potential?.addiction_liability || s.harm_potential?.toxicity?.ld50
    );
    if (example) {
      console.log("\nExample transformation:");
      console.log(`\nBEFORE (${example.title}):`);
      console.log(JSON.stringify(example.harm_potential, null, 2));
      console.log("\nAFTER:");
      console.log(JSON.stringify(migrateHarmPotential(example.harm_potential), null, 2));
    }

    return;
  }

  // Perform migration
  console.log("\nMigrating...");
  let migrated = 0;
  let errors = 0;

  // Transform all substances
  const updatedSubstances = substances.map(substance => {
    if (!isOldFormat(substance.harm_potential)) {
      return substance;
    }

    const newHarmPotential = migrateHarmPotential(substance.harm_potential);
    migrated++;

    if (verbose) {
      console.log(`  Migrated: ${substance.title}`);
    }

    return {
      ...substance,
      harm_potential: newHarmPotential,
    };
  });

  // Save to Convex
  console.log(`\nSaving ${migrated} migrated substances to Convex...`);
  try {
    const result = await client.mutation(api.substanceIndex.saveSubstances, {
      articles: updatedSubstances,
    });
    console.log(`Convex sync complete (${result.created} created, ${result.updated} updated).`);
  } catch (error) {
    console.error("Error saving to Convex:", error.message);
    process.exit(1);
  }

  console.log("\n" + "=".repeat(50));
  console.log("Migration complete!");
  console.log(`  Migrated: ${migrated}`);
  console.log(`  Errors: ${errors}`);
}

main().catch(error => {
  console.error("Fatal error:", error);
  process.exit(1);
});
