#!/usr/bin/env node
/**
 * Push a single prompt seed file to Postgres by key.
 *
 * Unlike migrate-prompts-to-data.mjs (which bulk-imports every prompt and
 * would overwrite Postgres-side hand edits to unrelated prompts), this writes
 * exactly one prompt row, then verifies the write by read-back.
 *
 * Usage:
 *   TARGET_POSTGRES_URL="https://..." node scripts/migrate/push-single-prompt.mjs --key=section_subjective_effects
 *   node scripts/migrate/push-single-prompt.mjs --key=section_subjective_effects --dry-run
 */

import { createDataClient, postgresFingerprintFromUrl } from "../lib/data-client.ts";
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
  const keyArg = process.argv.find((arg) => arg.startsWith("--key="));
  const promptKey = keyArg?.slice("--key=".length);
  if (!promptKey) {
    console.error("Error: --key=<promptKey> is required (e.g. --key=section_subjective_effects)");
    process.exit(1);
  }

  const prompt = collectLocalPromptsForMigration().find((entry) => entry.key === promptKey);
  if (!prompt) {
    console.error(`Error: no local seed prompt found for key "${promptKey}"`);
    process.exit(1);
  }

  const runContext = createDataOpsRunContext({
    operation: `push single prompt (${promptKey}) to Postgres`,
    intent: "dev-data-import",
    sourceUrlKeys: [],
    localArtifacts: [prompt.filePath],
  });

  console.log(`Prompt: ${prompt.key} (${prompt.content.length.toLocaleString()} chars)\n`);
  printDataOpsRunContext(runContext);

  if (isDryRun) {
    console.log(`\n[DRY RUN] Would save ${prompt.key} to the target deployment.`);
    return;
  }

  let dataUrl;
  try {
    dataUrl = requireTargetUrl(runContext);
    assertDataOpsWriteAllowed(runContext);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }

  const client = createDataClient({ target: dataUrl }).client;
  const adminKey = requireAdminIntentToken("promptMigrationWrite").token;

  const before = await client.query(api.prompts.getByKey, { key: promptKey });
  console.log(
    `\nBefore: ${before ? `${before.content.length.toLocaleString()} chars, updated ${before.updatedAt} by ${before.updatedBy ?? "unknown"}` : "no existing row"}`,
  );

  const result = await client.mutation(api.prompts.save, {
    apiKey: adminKey,
    key: promptKey,
    content: prompt.content,
    updatedBy: "push-single-prompt",
  });

  const after = await client.query(api.prompts.getByKey, { key: promptKey });
  const matches = after?.content === prompt.content;
  console.log(`Saved: ${result.updated ? "updated existing row" : "created new row"}`);
  console.log(`After: ${after.content.length.toLocaleString()} chars, read-back matches seed: ${matches}`);
  if (!matches) {
    console.error("Error: read-back does not match the local seed file.");
    process.exit(1);
  }

  const lineage = tryWriteArtifactLineageSidecar({
    artifactPath: prompt.filePath,
    sourceDeployment: "local working tree",
    targetDeployment: postgresFingerprintFromUrl(dataUrl),
    schemaVersion: "server/prompts.ts",
    extra: {
      promptKey: prompt.key,
      charCount: prompt.content.length,
    },
  });
  if (lineage?.outputPath) {
    console.log(`Lineage sidecar: ${lineage.outputPath}`);
  }
}

main();
