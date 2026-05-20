#!/usr/bin/env node
/**
 * Rebuild subjective effect gallery_order arrays from replication metadata.
 *
 * This script uses the same canonical effect-slug mapping as the replication
 * import flow, so effect pages and the replications table stay aligned.
 *
 * Usage:
 *   node scripts/replications/create-gallery-order.mjs --dry-run
 *   node scripts/replications/create-gallery-order.mjs --execute
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api.js";
import {
  loadGalleryOrderMapping,
  readSimpleEnvFile,
  resolveReplicationsPaths,
} from "./lib/reconciliation.mjs";
import {
  createConvexReplicationMediaAdapter,
  planGalleryOrderMutations,
} from "./lib/workspace.mjs";

const dryRun = process.argv.includes("--dry-run");
const execute = process.argv.includes("--execute");
const __dirname = path.dirname(fileURLToPath(import.meta.url));

if (!dryRun && !execute) {
  console.error("Usage: node scripts/replications/create-gallery-order.mjs --dry-run|--execute");
  process.exit(1);
}

const { metadataFile, galleryOrderMappingFile, envFile } = resolveReplicationsPaths(__dirname);

const env = {
  ...readSimpleEnvFile(envFile),
  ...process.env,
};

const CONVEX_URL = env.CONVEX_URL || env.VITE_CONVEX_URL || env.NEXT_PUBLIC_CONVEX_URL;
const CONVEX_ADMIN_KEY = env.CONVEX_ADMIN_KEY;

if (!CONVEX_URL) {
  throw new Error("Convex URL is not configured.");
}

if (!CONVEX_ADMIN_KEY) {
  throw new Error("CONVEX_ADMIN_KEY is not configured.");
}

if (!fs.existsSync(metadataFile)) {
  throw new Error(`Replication metadata file not found: ${metadataFile}`);
}

const metadata = JSON.parse(fs.readFileSync(metadataFile, "utf8"));
const galleryOrderMapping = loadGalleryOrderMapping(galleryOrderMappingFile);
const client = new ConvexHttpClient(CONVEX_URL);
const replicationMedia = createConvexReplicationMediaAdapter({
  client,
  api,
  apiKey: CONVEX_ADMIN_KEY,
});

async function main() {
  console.log(`\n${"=".repeat(60)}`);
  console.log("Create Gallery Order for Effects");
  console.log(`Mode: ${dryRun ? "DRY RUN" : "EXECUTE"}`);
  console.log(`${"=".repeat(60)}\n`);

  const currentEffects = await client.query(api.subjectiveEffects.getAll, {});
  const { effects, legacyOnlyEffects, staleEffects } = planGalleryOrderMutations({
    replications: metadata.replications,
    galleryOrderMapping,
    currentEffects,
  });

  console.log(`Found ${effects.length} effects with gallery replications:\n`);
  for (const [effectSlug, replicationSlugs] of effects) {
    console.log(`  ${effectSlug.padEnd(35)} (${replicationSlugs.length})`);
  }

  if (staleEffects.length > 0) {
    console.log(`\nFound ${staleEffects.length} effects with stale gallery_order and no matching replications:\n`);
    for (const effectSlug of staleEffects) {
      console.log(`  ${effectSlug}`);
    }
  }

  if (legacyOnlyEffects.length > 0) {
    console.log(`\nSkipping ${legacyOnlyEffects.length} legacy-only gallery mappings with no current effect article:\n`);
    for (const effectSlug of legacyOnlyEffects) {
      console.log(`  ${effectSlug}`);
    }
  }

  if (dryRun) {
    console.log("\n[DRY RUN] Example payload:");
    const sample = effects[0];
    if (sample) {
      console.log(
        JSON.stringify(
          { effect_slug: sample[0], replication_slugs: sample[1].slice(0, 5) },
          null,
          2,
        ),
      );
    }
    console.log("");
    return;
  }

  let updated = 0;
  const errors = [];

  for (const [effectSlug, replicationSlugs] of effects) {
    try {
      await replicationMedia.updateGalleryOrder({
        effect_slug: effectSlug,
        replication_slugs: replicationSlugs,
      });
      updated++;
      console.log(`✓ ${effectSlug} (${replicationSlugs.length} replications)`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${effectSlug}: ${message}`);
      console.log(`✗ ${effectSlug}: ${message}`);
    }
  }

  for (const effectSlug of staleEffects) {
    try {
      await replicationMedia.clearGalleryOrder(effectSlug);
      updated++;
      console.log(`✓ cleared ${effectSlug} gallery_order`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${effectSlug}: ${message}`);
      console.log(`✗ clearing ${effectSlug}: ${message}`);
    }
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`✓ Updated: ${updated} effects`);
  if (errors.length > 0) {
    console.log(`✗ Failed: ${errors.length} effects`);
    for (const error of errors) {
      console.log(`  - ${error}`);
    }
  }
  console.log(`${"=".repeat(60)}\n`);

  if (errors.length === 0) {
    console.log("✅ Gallery order synchronized from replication metadata.\n");
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
