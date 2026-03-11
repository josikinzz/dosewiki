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

import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api.js";

const SECTION_PROMPTS_DIR = "./src/data/config/sectionPrompts";

function getLocalPrompts() {
  const prompts = new Map();

  try {
    const files = readdirSync(SECTION_PROMPTS_DIR);
    const mdFiles = files.filter((f) => f.endsWith(".md"));

    for (const file of mdFiles) {
      const filePath = join(SECTION_PROMPTS_DIR, file);
      const content = readFileSync(filePath, "utf-8");

      // Convert filename to key: base.md -> section_base, harmPotential.md -> section_harm_potential
      const baseName = file.replace(".md", "");
      const snakeCase = baseName.replace(/([A-Z])/g, "_$1").toLowerCase();
      const key = `section_${snakeCase}`;

      prompts.set(key, { content, file });
    }
  } catch (error) {
    console.error(`Error reading section prompts: ${error.message}`);
  }

  return prompts;
}

async function main() {
  const convexUrl = process.env.CONVEX_URL || process.env.VITE_CONVEX_URL;

  if (!convexUrl) {
    console.error("Error: CONVEX_URL or VITE_CONVEX_URL environment variable is not set.");
    process.exit(1);
  }

  console.log("Comparing local prompts with Convex...\n");

  // Get local prompts
  const localPrompts = getLocalPrompts();
  console.log(`Local prompts: ${localPrompts.size}`);

  // Get Convex prompts
  const client = new ConvexHttpClient(convexUrl);
  const convexPrompts = await client.query(api.prompts.getAll);
  const convexMap = new Map(convexPrompts.map(p => [p.key, p]));
  console.log(`Convex prompts: ${convexPrompts.length}`);
  console.log();

  // Compare
  const results = {
    identical: [],
    localOnly: [],
    convexOnly: [],
    different: [],
  };

  for (const [key, local] of localPrompts) {
    const convex = convexMap.get(key);

    if (!convex) {
      results.localOnly.push({ key, file: local.file });
    } else if (local.content === convex.content) {
      results.identical.push(key);
    } else {
      // Find the differences
      const localLines = local.content.split('\n');
      const convexLines = convex.content.split('\n');

      // Check if local is just Convex + the new meta-commentary line
      const newLine = "- Do not reference or comment on sources; present information directly without meta-commentary";
      const localHasNewLine = local.content.includes(newLine);
      const convexHasNewLine = convex.content.includes(newLine);

      results.different.push({
        key,
        file: local.file,
        localChars: local.content.length,
        convexChars: convex.content.length,
        localHasNewLine,
        convexHasNewLine,
        updatedAt: convex.updatedAt,
        updatedBy: convex.updatedBy,
      });
    }

    convexMap.delete(key);
  }

  // Remaining in convexMap are Convex-only
  for (const [key, convex] of convexMap) {
    if (key.startsWith("section_")) {
      results.convexOnly.push({ key, updatedAt: convex.updatedAt });
    }
  }

  // Report
  console.log("=".repeat(60));
  console.log("COMPARISON RESULTS");
  console.log("=".repeat(60));

  if (results.identical.length > 0) {
    console.log(`\n✓ IDENTICAL (${results.identical.length}):`);
    results.identical.forEach(k => console.log(`  - ${k}`));
  }

  if (results.localOnly.length > 0) {
    console.log(`\n+ LOCAL ONLY (${results.localOnly.length}):`);
    results.localOnly.forEach(({ key, file }) => console.log(`  - ${key} (${file})`));
  }

  if (results.convexOnly.length > 0) {
    console.log(`\n⚠ CONVEX ONLY (${results.convexOnly.length}):`);
    results.convexOnly.forEach(({ key, updatedAt }) => console.log(`  - ${key} (updated: ${updatedAt})`));
  }

  if (results.different.length > 0) {
    console.log(`\n≠ DIFFERENT (${results.different.length}):`);
    for (const diff of results.different) {
      console.log(`  - ${diff.key}`);
      console.log(`      Local: ${diff.localChars} chars, has new rule: ${diff.localHasNewLine}`);
      console.log(`      Convex: ${diff.convexChars} chars, has new rule: ${diff.convexHasNewLine}`);
      console.log(`      Last updated: ${diff.updatedAt} by ${diff.updatedBy || 'unknown'}`);

      const charDiff = diff.localChars - diff.convexChars;
      if (diff.localHasNewLine && !diff.convexHasNewLine && charDiff > 0 && charDiff < 200) {
        console.log(`      → Likely SAFE to sync (local just adds new meta-commentary rule)`);
      } else if (!diff.localHasNewLine && diff.convexHasNewLine) {
        console.log(`      → WARNING: Convex has the new rule but local doesn't!`);
      } else {
        console.log(`      → REVIEW NEEDED: Significant differences beyond the new rule`);
      }
    }
  }

  console.log("\n" + "=".repeat(60));

  // Summary recommendation
  const safeToSync = results.different.filter(d =>
    d.localHasNewLine && !d.convexHasNewLine && (d.localChars - d.convexChars) > 0 && (d.localChars - d.convexChars) < 200
  );
  const needsReview = results.different.filter(d =>
    !(d.localHasNewLine && !d.convexHasNewLine && (d.localChars - d.convexChars) > 0 && (d.localChars - d.convexChars) < 200)
  );

  if (needsReview.length > 0) {
    console.log("\n⚠️  REVIEW REQUIRED:");
    console.log(`   ${needsReview.length} prompt(s) have differences beyond the new rule.`);
    console.log("   Run with --show-diff to see detailed differences.\n");
  } else if (safeToSync.length > 0) {
    console.log("\n✓ SAFE TO SYNC:");
    console.log(`   ${safeToSync.length} prompt(s) only differ by the new meta-commentary rule.`);
    console.log("   Run the migration script to update Convex.\n");
  } else if (results.identical.length === localPrompts.size) {
    console.log("\n✓ ALL SYNCED:");
    console.log("   Local and Convex prompts are identical.\n");
  }
}

main().catch(console.error);
