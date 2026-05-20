#!/usr/bin/env node
/**
 * Compare local prompts with Convex prompts.
 *
 * Shows differences between local files and what's stored in Convex,
 * helping you decide whether to sync.
 *
 * Usage:
 *   VITE_CONVEX_URL="https://..." node scripts/migrate/compare-prompts.mjs
 */

import { pathToFileURL } from "node:url";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api.js";
import {
  createDataOpsRunContext,
  printDataOpsRunContext,
  requireSourceUrl,
} from "../lib/data-ops-run-context.mjs";
import {
  PROMPT_DRIFT_STATUS,
  META_COMMENTARY_RULE,
  collectConvexPromptInventory,
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
    lines.push(`\n⚠ CONVEX ONLY (${results[PROMPT_DRIFT_STATUS.MISSING_IN_SOURCE].length}):`);
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
      lines.push(`      Convex: ${diff.target.content.length} chars, has new rule: ${targetHasNewLine}`);
      lines.push(`      Last updated: ${diff.target.updatedAt} by ${diff.target.updatedBy || "unknown"}`);

      if (diff.status === PROMPT_DRIFT_STATUS.SAFE_POLICY_DIFFERENCE) {
        lines.push("      → Likely SAFE to sync (local just adds new meta-commentary rule)");
      } else if (diff.policy === "meta-commentary-rule-missing-locally") {
        lines.push("      → WARNING: Convex has the new rule but local doesn't!");
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
    lines.push("   Run the migration script to update Convex.\n");
  } else if (sourceCount !== undefined && results[PROMPT_DRIFT_STATUS.IDENTICAL].length === sourceCount) {
    lines.push("\n✓ ALL SYNCED:");
    lines.push("   Local and Convex prompts are identical.\n");
  }

  if (targetCount !== undefined && drift.some((entry) => entry.key === "generator")) {
    lines.push("Note: generator prompt drift is included in this comparison.");
  }

  return lines.join("\n");
}

export async function runComparePrompts({ convexPrompts, convexUrl, log = console.log } = {}) {
  const runContext = createDataOpsRunContext({
    operation: "compare local prompts with Convex prompts",
    intent: "convex-read-compare",
    sourceUrlKeys: ["SOURCE_CONVEX_URL", "CONVEX_URL", "VITE_CONVEX_URL", "NEXT_PUBLIC_CONVEX_URL"],
    targetUrlKeys: [],
    localArtifacts: [
      "src/data/config/generatorPrompt.md",
      "src/data/config/sectionPrompts/*.md",
      "src/data/config/formalCitationsPrompts/*.md",
    ],
  });

  const resolvedConvexUrl = convexUrl ?? requireSourceUrl(runContext, "Convex prompt source URL");

  log("Comparing local prompts with Convex...\n");
  printDataOpsRunContext(runContext);

  const localPrompts = collectLocalPromptInventory();
  log(`Local prompts: ${localPrompts.size}`);

  let promptRecords = convexPrompts;
  if (!promptRecords) {
    const client = new ConvexHttpClient(resolvedConvexUrl);
    promptRecords = await client.query(api.prompts.getAll);
  }

  const convexInventory = collectConvexPromptInventory(promptRecords);
  log(`Convex prompts: ${promptRecords.length}`);
  log();

  const drift = comparePromptInventories(localPrompts, convexInventory);
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
