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

import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api.js";
import { tryWriteArtifactLineageSidecar } from "../lib/data-artifact-lineage.mjs";
import {
  assertDataOpsWriteAllowed,
  createDataOpsRunContext,
  printDataOpsRunContext,
  requireTargetUrl,
} from "../lib/data-ops-run-context.mjs";
import { collectLocalPromptsForMigration } from "../lib/prompt-drift-policy.mjs";

async function main() {
  const isDryRun = process.argv.includes("--dry-run");
  const runContext = createDataOpsRunContext({
    operation: "migrate prompts to Convex",
    intent: "dev-convex-import",
    sourceUrlKeys: [],
    localArtifacts: [
      "src/data/config/generatorPrompt.md",
      "src/data/config/sectionPrompts/*.md",
    ],
  });
  
  let convexUrl = null;
  
  if (!isDryRun) {
    try {
      convexUrl = requireTargetUrl(runContext);
    } catch (error) {
      console.error(`Error: ${error.message}`);
      console.error("Run 'bunx convex dev' first to set up your Convex project.");
      process.exit(1);
    }
  }

  console.log("Collecting prompts...\n");
  printDataOpsRunContext(runContext);

  const prompts = collectLocalPromptsForMigration();
  for (const prompt of prompts) {
    console.log(`  ${prompt.key}: ${prompt.content.length.toLocaleString()} chars`);
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

  try {
    assertDataOpsWriteAllowed(runContext);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
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
      prompts: prompts.map(({ key, content }) => ({ key, content })),
      updatedBy: "migration-script",
    });

    console.log("\nImport complete!");
    console.log(`  Created: ${result.created}`);
    console.log(`  Updated: ${result.updated}`);
    if (result.errors.length > 0) {
      console.log(`  Errors: ${result.errors.length}`);
      result.errors.forEach((e) => console.log(`    - ${e}`));
    }
    const lineageOutputs = prompts.map((prompt) => tryWriteArtifactLineageSidecar({
      artifactPath: prompt.filePath,
      sourceDeployment: "local working tree",
      targetDeployment: "CONVEX_URL or VITE_CONVEX_URL",
      schemaVersion: "convex/prompts.ts",
      extra: {
        promptKey: prompt.key,
        charCount: prompt.content.length,
        importResult: {
          created: result.created,
          updated: result.updated,
          errors: result.errors.length,
        },
      },
    })?.outputPath).filter(Boolean);
    console.log(`  Lineage sidecars: ${lineageOutputs.length}`);
  } catch (error) {
    console.error("Error importing prompts:", error);
    process.exit(1);
  }
}

main();
