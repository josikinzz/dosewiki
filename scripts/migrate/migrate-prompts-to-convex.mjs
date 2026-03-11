#!/usr/bin/env node
/**
 * Migrate prompts to Convex.
 * 
 * This script reads all prompt files (generator prompt and section prompts)
 * and uploads them to the Convex database.
 * 
 * Prerequisites:
 * 1. Run `bunx convex dev` to set up the Convex project and generate types
 * 2. Ensure CONVEX_URL is set in your environment or .env.local
 * 
 * Usage:
 *   node scripts/migrate-prompts-to-convex.mjs
 *   node scripts/migrate-prompts-to-convex.mjs --dry-run
 */

import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api.js";

const GENERATOR_PROMPT_PATH = "./src/data/config/generatorPrompt.md";
const SECTION_PROMPTS_DIR = "./src/data/config/sectionPrompts";

async function main() {
  const isDryRun = process.argv.includes("--dry-run");
  
  // Get Convex URL from environment
  const convexUrl = process.env.CONVEX_URL || process.env.VITE_CONVEX_URL;
  
  if (!convexUrl && !isDryRun) {
    console.error("Error: CONVEX_URL or VITE_CONVEX_URL environment variable is not set.");
    console.error("Run 'bunx convex dev' first to set up your Convex project.");
    process.exit(1);
  }

  console.log("Collecting prompts...\n");

  const prompts = [];

  // Read main generator prompt
  try {
    const generatorContent = readFileSync(GENERATOR_PROMPT_PATH, "utf-8");
    prompts.push({
      key: "generator",
      content: generatorContent,
    });
    console.log(`  generator: ${generatorContent.length.toLocaleString()} chars`);
  } catch (error) {
    console.error(`Error reading generator prompt: ${error.message}`);
  }

  // Read section prompts
  try {
    const files = readdirSync(SECTION_PROMPTS_DIR);
    const mdFiles = files.filter((f) => f.endsWith(".md"));

    for (const file of mdFiles) {
      const filePath = join(SECTION_PROMPTS_DIR, file);
      const content = readFileSync(filePath, "utf-8");
      
      // Convert filename to key: base.md -> section_base, harmPotential.md -> section_harm_potential
      const baseName = file.replace(".md", "");
      // Convert camelCase to snake_case
      const snakeCase = baseName.replace(/([A-Z])/g, "_$1").toLowerCase();
      const key = `section_${snakeCase}`;

      prompts.push({
        key,
        content,
      });
      console.log(`  ${key}: ${content.length.toLocaleString()} chars`);
    }
  } catch (error) {
    console.error(`Error reading section prompts: ${error.message}`);
  }

  console.log(`\nTotal: ${prompts.length} prompts collected.`);

  if (isDryRun) {
    console.log("\n[DRY RUN] Would import the following prompts:");
    for (const prompt of prompts) {
      console.log(`  - ${prompt.key}: ${prompt.content.length.toLocaleString()} chars`);
    }
    console.log("\nRun without --dry-run to perform the actual import.");
    return;
  }

  // Create Convex client
  const client = new ConvexHttpClient(convexUrl);

  console.log("\nImporting prompts to Convex...");

  const adminKey = process.env.CONVEX_ADMIN_KEY;
  if (!adminKey) {
    console.error("Error: CONVEX_ADMIN_KEY environment variable is required for Convex sync");
    process.exit(1);
  }

  try {
    const result = await client.mutation(api.prompts.bulkImport, {
      apiKey: adminKey,
      prompts,
      updatedBy: "migration-script",
    });

    console.log("\nImport complete!");
    console.log(`  Created: ${result.created}`);
    console.log(`  Updated: ${result.updated}`);
    if (result.errors.length > 0) {
      console.log(`  Errors: ${result.errors.length}`);
      result.errors.forEach((e) => console.log(`    - ${e}`));
    }
  } catch (error) {
    console.error("Error importing prompts:", error);
    process.exit(1);
  }
}

main();
