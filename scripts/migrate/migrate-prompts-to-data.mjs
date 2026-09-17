#!/usr/bin/env node
/**
 * Migrate prompts to Postgres.
 * 
 * This script reads all prompt files (generator prompt and section prompts)
 * and uploads them to the Postgres database.
 * 
 * Prerequisites:
 * 1. Set DATA_BACKEND=postgres and configure an explicit Postgres target
 * 2. Ensure POSTGRES_DIRECT_URL is set in your environment or .env.local
 * 
 * Usage:
 *   node scripts/migrate-prompts-to-data.mjs
 *   node scripts/migrate-prompts-to-data.mjs --dry-run
 */

import { createDataClient } from "../lib/data-client.ts";
import { api } from "../../lib/postgres/runtime/api.ts"
import { tryWriteArtifactLineageSidecar } from "../lib/data-artifact-lineage.mjs";
import {
  assertDataOpsWriteAllowed,
  createDataOpsRunContext,
  printDataOpsRunContext,
  requireAdminIntentToken,
  requireTargetUrl,
} from "../lib/data-ops-run-context.mjs";
import { collectLocalPromptsForMigration } from "../lib/prompt-drift-policy.mjs";

async function main() {
  const isDryRun = process.argv.includes("--dry-run");
  const runContext = createDataOpsRunContext({
    operation: "migrate prompts to Postgres",
    intent: "dev-data-import",
    sourceUrlKeys: [],
    localArtifacts: [
      "content/prompts/generator.md",
      "content/prompts/sections/*.md",
    ],
  });
  
  let dataUrl = null;
  
  if (!isDryRun) {
    try {
      dataUrl = requireTargetUrl(runContext);
    } catch (error) {
      console.error(`Error: ${error.message}`);
      console.error("Set DATA_BACKEND=postgres and TARGET_POSTGRES_URL before writing.");
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

  // Create Postgres client
  const client = createDataClient({ target: dataUrl }).client;

  console.log("\nImporting prompts to Postgres...");

  const adminKey = requireAdminIntentToken("promptMigrationWrite").token;

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
      targetDeployment: "POSTGRES_DIRECT_URL or POSTGRES_POOLED_URL",
      schemaVersion: "server/prompts.ts",
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
