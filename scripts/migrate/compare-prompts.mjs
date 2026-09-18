#!/usr/bin/env node
/**
 * Compare local prompts with Postgres prompts.
 *
 * Shows differences between local files and what's stored in Postgres,
 * helping you decide whether to sync.
 *
 * Usage:
 *   POSTGRES_POOLED_URL="https://..." node scripts/migrate/compare-prompts.mjs
 */

import { pathToFileURL } from "node:url";
import { createDataClient } from "../lib/data-client.ts";
import { api } from "../../lib/postgres/runtime/api.ts"
import {
  createDataOpsRunContext,
  printDataOpsRunContext,
  requireSourceUrl,
} from "../lib/data-ops-run-context.mjs";
import {
  PROMPT_DRIFT_STATUS,
  META_COMMENTARY_RULE,
  collectDataPromptInventory,
  collectLocalPromptInventory,
  comparePromptInventories,
  groupPromptDriftByStatus,
} from "../lib/prompt-drift-policy.mjs";

export function renderPromptDriftReport(drift, { sourceCount, targetCount } = {}) {
  const results = groupPromptDriftByStatus(drift);
  const lines = [];

  lines.push("=".repeat(60));
  lines.push("COMPARISON RESULTS");
  lines.push("=".repeat(60));

  if (results[PROMPT_DRIFT_STATUS.IDENTICAL].length > 0) {
    lines.push(`\n✓ IDENTICAL (${results[PROMPT_DRIFT_STATUS.IDENTICAL].length}):`);
    results[PROMPT_DRIFT_STATUS.IDENTICAL].forEach(({ key }) => lines.push(`  - ${key}`));
  }

  if (results[PROMPT_DRIFT_STATUS.MISSING_IN_TARGET].length > 0) {
    lines.push(`\n+ LOCAL ONLY (${results[PROMPT_DRIFT_STATUS.MISSING_IN_TARGET].length}):`);
    results[PROMPT_DRIFT_STATUS.MISSING_IN_TARGET].forEach(({ key, source }) => {
      lines.push(`  - ${key} (${source.file})`);
    });
  }

  if (results[PROMPT_DRIFT_STATUS.MISSING_IN_SOURCE].length > 0) {
    lines.push(`\nDATA ONLY (${results[PROMPT_DRIFT_STATUS.MISSING_IN_SOURCE].length}):`);
    results[PROMPT_DRIFT_STATUS.MISSING_IN_SOURCE].forEach(({ key, target }) => {
      lines.push(`  - ${key} (updated: ${target.updatedAt})`);
    });
  }

  const different = [
    ...results[PROMPT_DRIFT_STATUS.CONTENT_DIFFERENT],
    ...results[PROMPT_DRIFT_STATUS.SAFE_POLICY_DIFFERENCE],
    ...results[PROMPT_DRIFT_STATUS.REVIEW_REQUIRED],
  ];

  if (different.length > 0) {
    lines.push(`\n≠ DIFFERENT (${different.length}):`);
    for (const diff of different) {
      const sourceHasNewLine = diff.source.content.includes(META_COMMENTARY_RULE);
      const targetHasNewLine = diff.target.content.includes(META_COMMENTARY_RULE);
      lines.push(`  - ${diff.key}`);
      lines.push(`      Local: ${diff.source.content.length} chars, has new rule: ${sourceHasNewLine}`);
      lines.push(`      Postgres: ${diff.target.content.length} chars, has new rule: ${targetHasNewLine}`);
      lines.push(`      Last updated: ${diff.target.updatedAt} by ${diff.target.updatedBy || "unknown"}`);

      if (diff.status === PROMPT_DRIFT_STATUS.SAFE_POLICY_DIFFERENCE) {
        lines.push("      → Likely SAFE to sync (local just adds new meta-commentary rule)");
      } else if (diff.policy === "meta-commentary-rule-missing-locally") {
        lines.push("      → WARNING: Postgres has the new rule but local doesn't!");
      } else {
        lines.push("      → REVIEW NEEDED: Significant differences beyond the new rule");
      }
    }
  }

  lines.push("\n" + "=".repeat(60));

  const safeToSync = results[PROMPT_DRIFT_STATUS.SAFE_POLICY_DIFFERENCE];
  const needsReview = [
    ...results[PROMPT_DRIFT_STATUS.CONTENT_DIFFERENT],
    ...results[PROMPT_DRIFT_STATUS.REVIEW_REQUIRED],
  ];

  if (needsReview.length > 0) {
    lines.push("\n⚠️  REVIEW REQUIRED:");
    lines.push(`   ${needsReview.length} prompt(s) have differences beyond the new rule.`);
    lines.push("   Run with --show-diff to see detailed differences.\n");
  } else if (safeToSync.length > 0) {
    lines.push("\n✓ SAFE TO SYNC:");
    lines.push(`   ${safeToSync.length} prompt(s) only differ by the new meta-commentary rule.`);
    lines.push("   Run the migration script to update Postgres.\n");
  } else if (sourceCount !== undefined && results[PROMPT_DRIFT_STATUS.IDENTICAL].length === sourceCount) {
    lines.push("\n✓ ALL SYNCED:");
    lines.push("   Local and Postgres prompts are identical.\n");
  }

  if (targetCount !== undefined && drift.some((entry) => entry.key === "generator")) {
    lines.push("Note: generator prompt drift is included in this comparison.");
  }

  return lines.join("\n");
}

export async function runComparePrompts({ dataPrompts, dataUrl, log = console.log } = {}) {
  const runContext = createDataOpsRunContext({
    operation: "compare local prompts with Postgres prompts",
    intent: "data-read-compare",
    sourceUrlKeys: ["SOURCE_POSTGRES_URL", "POSTGRES_DIRECT_URL", "POSTGRES_POOLED_URL"],
    targetUrlKeys: [],
    localArtifacts: [
      "content/prompts/generator.md",
      "content/prompts/sections/*.md",
      "content/prompts/formal-citations/*.md",
    ],
  });

  const resolvedDataUrl = dataUrl ?? requireSourceUrl(runContext, "Postgres prompt source URL");

  log("Comparing local prompts with Postgres...\n");
  printDataOpsRunContext(runContext);

  const localPrompts = collectLocalPromptInventory();
  log(`Local prompts: ${localPrompts.size}`);

  let promptRecords = dataPrompts;
  if (!promptRecords) {
    const client = createDataClient({ target: resolvedDataUrl }).client;
    promptRecords = await client.query(api.prompts.getAll);
  }

  const dataInventory = collectDataPromptInventory(promptRecords);
  log(`Postgres prompts: ${promptRecords.length}`);
  log();

  const drift = comparePromptInventories(localPrompts, dataInventory);
  log(renderPromptDriftReport(drift, {
    sourceCount: localPrompts.size,
    targetCount: promptRecords.length,
  }));
  return drift;
}

async function main() {
  try {
    await runComparePrompts();
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
