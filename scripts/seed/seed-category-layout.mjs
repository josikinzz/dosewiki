#!/usr/bin/env node
/**
 * Seed the category layout to Postgres.
 *
 * This script reads the existing psychoactiveIndexManual.json and uploads it
 * to the Postgres categoryLayout table. Run this once to initialize the data.
 *
 * Usage:
 *   node scripts/seed-category-layout.mjs
 *   node scripts/seed-category-layout.mjs --dry-run
 */

import { createDataClient } from "../lib/data-client.ts";
import { api } from "../../lib/postgres/runtime/api.ts";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import {
  assertProductionWriteAllowed,
  createProductionWriteCommand,
  printProductionWriteCommand,
  requireProductionWriteCredential,
} from "../lib/production-write-command.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const command = createProductionWriteCommand({ operation: "seed-category-layout" });

async function main() {
  printProductionWriteCommand(command);
  console.log("🌱 Seeding category layout to Postgres...\n");

  // Read the existing psychoactiveIndexManual.json
  const indexPath = join(__dirname, "../../data/substances/psychoactiveIndexManual.json");
  const indexData = JSON.parse(readFileSync(indexPath, "utf-8"));

  console.log(`📄 Read ${indexData.categories.length} categories from psychoactiveIndexManual.json`);

  // Log category summary
  for (const category of indexData.categories) {
    const sectionCount = category.sections?.length || 0;
    const topLevelDrugCount = category.drugs?.length || 0;
    const sectionDrugCount = (category.sections || []).reduce(
      (sum, s) => sum + (s.drugs?.length || 0),
      0
    );
    console.log(
      `   - ${category.label}: ${sectionCount} sections, ${sectionDrugCount + topLevelDrugCount} drugs`
    );
  }

  // Prepare the layout data
  const layoutData = {
    version: indexData.version || 1,
    categories: indexData.categories.map((cat) => ({
      key: cat.key,
      label: cat.label,
      iconKey: cat.iconKey,
      sections: (cat.sections || []).map((sec) => ({
        key: sec.key,
        label: sec.label,
        drugs: sec.drugs || [],
      })),
      drugs: cat.drugs || [],
      columns: cat.columns,
    })),
  };

  if (command.dryRun) {
    console.log("\n🔍 Dry run - would save the following layout:");
    console.log(JSON.stringify(layoutData, null, 2).slice(0, 1000) + "...");
    console.log(`\n   Total size: ${JSON.stringify(layoutData).length} bytes`);
    return;
  }

  // Connect to Postgres and save
  try {
    assertProductionWriteAllowed(command);
    const credential = requireProductionWriteCredential("seed-category-layout");
    const client = createDataClient({ target: command.targetUrl }).client;
    const result = await client.mutation(api.categoryLayout.save, {
      ...layoutData,
      apiKey: credential.token,
    });
    console.log(`\n✅ Category layout ${result.updated ? "updated" : "created"} successfully!`);
    console.log(`   Document ID: ${result.id}`);
  } catch (error) {
    console.error("\n❌ Failed to save category layout:", error.message);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
