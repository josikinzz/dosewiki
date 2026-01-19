#!/usr/bin/env node
/**
 * Seed index layouts to Convex.
 *
 * Reads the JSON files from src/data/indexes/ and uploads them to the
 * indexLayouts table in Convex.
 *
 * Usage:
 *   VITE_CONVEX_URL=https://enchanted-echidna-791.convex.cloud node scripts/seed-index-layouts.mjs
 */

import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Get Convex URL from environment
const convexUrl = process.env.VITE_CONVEX_URL;
if (!convexUrl) {
  console.error("Error: VITE_CONVEX_URL environment variable is required");
  console.error("Usage: VITE_CONVEX_URL=https://your-deployment.convex.cloud node scripts/seed-index-layouts.mjs");
  process.exit(1);
}

const client = new ConvexHttpClient(convexUrl);

// Index files to process
const INDEX_FILES = [
  { type: "psychoactive", file: "psychoactiveIndexManual.json" },
  { type: "chemical", file: "chemicalIndexManual.json" },
  { type: "mechanism", file: "mechanismIndexManual.json" },
];

async function seedIndexLayouts() {
  console.log(`Seeding index layouts to ${convexUrl}...\n`);

  const layouts = [];

  for (const { type, file } of INDEX_FILES) {
    const filePath = path.join(__dirname, "../src/data/indexes", file);

    if (!fs.existsSync(filePath)) {
      console.error(`  ✗ ${file} not found`);
      continue;
    }

    const content = JSON.parse(fs.readFileSync(filePath, "utf-8"));

    // Transform to Convex format (remove $schema, add type)
    const layout = {
      type,
      version: content.version || 1,
      categories: content.categories.map((cat) => ({
        key: cat.key,
        label: cat.label,
        iconKey: cat.iconKey,
        notes: cat.notes || undefined,
        columns: cat.columns || undefined,
        drugs: cat.drugs || [],
        sections: (cat.sections || []).map((sec) => ({
          key: sec.key,
          label: sec.label,
          notes: sec.notes || undefined,
          link: sec.link || undefined,
          drugs: sec.drugs || [],
        })),
      })),
    };

    layouts.push(layout);
    console.log(`  ✓ Loaded ${file} (${layout.categories.length} categories)`);
  }

  if (layouts.length === 0) {
    console.error("\nNo layouts to seed");
    process.exit(1);
  }

  console.log(`\nUploading ${layouts.length} layouts to Convex...`);

  try {
    const result = await client.mutation(api.indexLayouts.bulkImport, { layouts });
    console.log(`\n✓ Seeding complete!`);
    console.log(`  Created: ${result.created}`);
    console.log(`  Updated: ${result.updated}`);
    if (result.errors.length > 0) {
      console.log(`  Errors: ${result.errors.length}`);
      result.errors.forEach((err) => console.log(`    - ${err}`));
    }
  } catch (error) {
    console.error("\n✗ Failed to seed:", error.message);
    process.exit(1);
  }
}

seedIndexLayouts();
