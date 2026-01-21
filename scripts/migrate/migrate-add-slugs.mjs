#!/usr/bin/env node
/**
 * Migration script to add slug field to all existing substances.
 *
 * This is needed because the new getBySlug query requires the slug field,
 * but existing documents don't have it populated.
 *
 * Usage:
 *   node scripts/migrate-add-slugs.mjs
 *   node scripts/migrate-add-slugs.mjs --dry-run
 */

import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api.js";

const CONVEX_URL = process.env.VITE_CONVEX_URL || process.env.CONVEX_URL;
const DRY_RUN = process.argv.includes("--dry-run");

if (!CONVEX_URL) {
  console.error("Error: CONVEX_URL or VITE_CONVEX_URL environment variable is required");
  process.exit(1);
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function main() {
  console.log("🔧 Migrating substances to add slug field...\n");

  const client = new ConvexHttpClient(CONVEX_URL);

  // Get all substances
  const substances = await client.query(api.substanceIndex.getAll);
  console.log(`Found ${substances.length} substances\n`);

  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const substance of substances) {
    const expectedSlug = slugify(substance.title);

    if (substance.slug === expectedSlug) {
      skipped++;
      continue;
    }

    if (DRY_RUN) {
      console.log(`Would update: ${substance.title} -> slug: "${expectedSlug}"`);
      updated++;
      continue;
    }

    try {
      // Update the substance with the slug
      await client.mutation(api.substanceIndex.saveSubstance, {
        article: {
          ...substance,
          slug: expectedSlug,
        },
      });
      updated++;

      if (updated % 50 === 0) {
        console.log(`Progress: ${updated} updated...`);
      }
    } catch (error) {
      console.error(`Error updating ${substance.title}:`, error.message);
      errors++;
    }
  }

  console.log(`\n✅ Migration complete!`);
  console.log(`   Updated: ${updated}`);
  console.log(`   Skipped (already had slug): ${skipped}`);
  console.log(`   Errors: ${errors}`);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
