#!/usr/bin/env node

import { readFileSync, existsSync } from "fs";
import { ConvexHttpClient } from "convex/browser";

import { api } from "../../convex/_generated/api.js";
import { loadGalleryOrderMapping } from "../replications/lib/reconciliation.mjs";

import {
  BATCH_SIZE,
  DEFAULT_EFFECTS_PATH,
  DEFAULT_REPLICATIONS_PATH,
  GALLERY_ORDER_MAPPING_PATH,
} from "./effects/config.mjs";
import { buildAssetMap } from "./effects/rewrites.mjs";
import { transformEffect } from "./effects/transform.mjs";
import { importEffectsInBatches } from "./effects/persist.mjs";

function parseJsonFile(filePath, label) {
  try {
    return JSON.parse(readFileSync(filePath, "utf-8"));
  } catch (error) {
    console.error(`❌ Failed to parse ${label}: ${error.message}`);
    process.exit(1);
  }
}

async function main() {
  console.log("🚀 Subjective Effects Migration Script\n");

  const effectsPath = process.argv[2] || DEFAULT_EFFECTS_PATH;
  const replicationsPath = process.argv[3] || DEFAULT_REPLICATIONS_PATH;

  if (!existsSync(effectsPath)) {
    console.error(`❌ Effects file not found: ${effectsPath}`);
    console.error("\nUsage: node scripts/migrate-effects.mjs [path-to-effects.json] [path-to-replications.json]");
    process.exit(1);
  }

  console.log(`📄 Reading effects from: ${effectsPath}`);
  const rawEffects = parseJsonFile(effectsPath, "effects file");
  console.log(`📊 Found ${rawEffects.length} effects in source file`);

  let assetMap = new Map();
  if (existsSync(replicationsPath)) {
    console.log(`📄 Reading replications from: ${replicationsPath}`);
    try {
      assetMap = buildAssetMap(parseJsonFile(replicationsPath, "replications file"));
      console.log(`🖼️  Built asset map with ${assetMap.size} entries`);
    } catch (error) {
      console.warn(`⚠️  Failed to parse replications file: ${error.message}`);
      console.warn("   Continuing without asset URL mapping...\n");
    }
  } else {
    console.log(`⚠️  Replications file not found: ${replicationsPath}`);
    console.log("   Continuing without asset URL mapping...\n");
  }

  const galleryOrderByEffect = loadGalleryOrderMapping(GALLERY_ORDER_MAPPING_PATH);
  if (galleryOrderByEffect.size > 0) {
    console.log(`🖼️  Loaded canonical gallery-order mapping for ${galleryOrderByEffect.size} effects`);
  }

  console.log("🔄 Transforming effects to new schema...");
  const transformedEffects = rawEffects.map((effect) =>
    transformEffect(effect, assetMap, galleryOrderByEffect),
  );

  const featuredCount = transformedEffects.filter((effect) => effect.featured).length;
  console.log(`⭐ ${featuredCount} featured effects`);

  const tagCounts = new Map();
  for (const effect of transformedEffects) {
    for (const tag of effect.tags) {
      tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
    }
  }
  console.log(`🏷️  ${tagCounts.size} unique tags`);

  const sortedTags = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  console.log("\nTop 10 tags:");
  for (const [tag, count] of sortedTags) {
    console.log(`   ${tag}: ${count}`);
  }

  console.log("\nContent breakdown:");
  console.log(`   With analysis: ${transformedEffects.filter((effect) => effect.analysis_raw).length}`);
  console.log(
    `   With style variations: ${transformedEffects.filter((effect) => effect.style_variations_raw).length}`,
  );
  console.log(
    `   With personal commentary: ${transformedEffects.filter((effect) => effect.personal_commentary_raw).length}`,
  );
  console.log(`   With long summary: ${transformedEffects.filter((effect) => effect.long_summary_raw).length}`);
  console.log(`   With citations: ${transformedEffects.filter((effect) => effect.citations?.length).length}`);

  const convexUrl = process.env.CONVEX_URL || process.env.VITE_CONVEX_URL;
  if (!convexUrl) {
    console.error("\n❌ CONVEX_URL environment variable not set");
    process.exit(1);
  }

  console.log(`\n🔗 Connecting to Convex: ${convexUrl}`);
  const client = new ConvexHttpClient(convexUrl);

  console.log(`\n📤 Importing ${transformedEffects.length} effects in batches of ${BATCH_SIZE}...\n`);
  const { totalCreated, totalUpdated, allErrors } = await importEffectsInBatches({
    client,
    mutation: api.subjectiveEffects.bulkImport,
    effects: transformedEffects,
    batchSize: BATCH_SIZE,
    onBatchStart: ({ batch, batchNumber, totalBatches }) => {
      process.stdout.write(`  Batch ${batchNumber}/${totalBatches}: ${batch.length} effects... `);
    },
    onBatchComplete: ({ result }) => {
      console.log(`✓ (created: ${result.created}, updated: ${result.updated})`);
    },
    onBatchError: ({ error }) => {
      console.log(`✗ Error: ${error.message}`);
    },
  });

  console.log("\n" + "=".repeat(50));
  console.log("📊 Migration Complete\n");
  console.log(`  ✅ Created: ${totalCreated}`);
  console.log(`  🔄 Updated: ${totalUpdated}`);

  if (allErrors.length > 0) {
    console.log(`  ❌ Errors: ${allErrors.length}`);
    console.log("\nError details:");
    for (const error of allErrors.slice(0, 10)) {
      console.log(`    - ${error}`);
    }
    if (allErrors.length > 10) {
      console.log(`    ... and ${allErrors.length - 10} more`);
    }
  }

  console.log("\n✨ Done!");
}

main().catch(console.error);
