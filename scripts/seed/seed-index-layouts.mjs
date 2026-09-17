#!/usr/bin/env node
/**
 * Seed index layouts to Postgres.
 *
 * Reads the JSON files from data/substances/ and uploads them to the
 * indexLayouts table in Postgres.
 *
 * Usage:
 *   TARGET_POSTGRES_URL=postgresql://localhost/dosewiki node scripts/seed/seed-index-layouts.mjs --type psychoactive --dry-run
 */

import { createDataClient } from "../lib/data-client.ts";
import { api } from "../../lib/postgres/runtime/api.ts";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  assertProductionWriteAllowed,
  createProductionWriteCommand,
  printProductionWriteCommand,
  requireProductionWriteCredential,
} from "../lib/production-write-command.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const command = createProductionWriteCommand({
  operation: "seed-index-layouts",
});

const typeIndex = process.argv.indexOf("--type");
const requestedType = typeIndex >= 0 ? process.argv[typeIndex + 1] : undefined;
const INDEX_FILES = [
  { type: "psychoactive", file: "psychoactiveIndexManual.json" },
  { type: "chemical", file: "chemicalIndexManual.json" },
  { type: "mechanism", file: "mechanismIndexManual.json" },
].filter(({ type }) => requestedType === undefined || type === requestedType);

if (requestedType !== undefined && INDEX_FILES.length === 0) {
  throw new Error(`Unknown index layout type: ${requestedType}`);
}

async function seedIndexLayouts() {
  printProductionWriteCommand(command);

  const layouts = [];

  for (const { type, file } of INDEX_FILES) {
    const filePath = path.join(__dirname, "../../data/substances", file);

    if (!fs.existsSync(filePath)) {
      console.error(`  ✗ ${file} not found`);
      continue;
    }

    const content = JSON.parse(fs.readFileSync(filePath, "utf-8"));

    // Transform to Postgres format (remove $schema, add type)
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

  if (command.dryRun) {
    console.log(`\nDry run; would seed ${layouts.length} layouts.`);
    return;
  }

  console.log(`\nUploading ${layouts.length} layouts to Postgres...`);

  try {
    assertProductionWriteAllowed(command);
    const credential = requireProductionWriteCredential("seed-index-layouts");
    const client = createDataClient({ target: command.targetUrl }).client;
    const result = await client.mutation(api.indexLayouts.bulkImport, {
      layouts,
      apiKey: credential.token,
    });
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
