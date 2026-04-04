#!/usr/bin/env node
/**
 * Sync replication effect_slug values in Convex from local replication metadata.
 *
 * Usage:
 *   node scripts/replications/fix-replication-effect-slugs.mjs --dry-run
 *   node scripts/replications/fix-replication-effect-slugs.mjs --execute
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api.js";
import {
  applyGalleryOrderMappingsToMetadata,
  loadGalleryOrderMapping,
  readSimpleEnvFile,
  resolveReplicationsPaths,
} from "./lib/reconciliation.mjs";

const dryRun = process.argv.includes("--dry-run");
const execute = process.argv.includes("--execute");
const __dirname = path.dirname(fileURLToPath(import.meta.url));

if (!dryRun && !execute) {
  console.error("Usage: node scripts/replications/fix-replication-effect-slugs.mjs --dry-run|--execute");
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

const metadata = JSON.parse(fs.readFileSync(metadataFile, "utf8"));
const galleryOrderMapping = loadGalleryOrderMapping(galleryOrderMappingFile);
applyGalleryOrderMappingsToMetadata(metadata.replications, galleryOrderMapping);

const client = new ConvexHttpClient(CONVEX_URL);

async function main() {
  console.log(`\n${"=".repeat(60)}`);
  console.log("Fix Replication Effect Slugs");
  console.log(`Mode: ${dryRun ? "DRY RUN" : "EXECUTE"}`);
  console.log(`${"=".repeat(60)}\n`);

  const currentReplications = await client.query(api.replications.getAll, {});
  const currentBySlug = new Map(currentReplications.map((replication) => [replication.slug, replication]));

  const updates = metadata.replications
    .filter((replication) => replication.effect_slug)
    .map((replication) => ({
      slug: replication.slug,
      desiredEffectSlug: replication.effect_slug,
      currentEffectSlug: currentBySlug.get(replication.slug)?.effect_slug ?? null,
    }))
    .filter(
      (replication) =>
        replication.currentEffectSlug !== null &&
        replication.currentEffectSlug !== replication.desiredEffectSlug,
    );

  console.log(`Found ${updates.length} replications with mismatched effect slugs.\n`);

  for (const update of updates.slice(0, 20)) {
    console.log(
      `  ${update.slug}: ${update.currentEffectSlug ?? "null"} -> ${update.desiredEffectSlug}`,
    );
  }

  if (updates.length > 20) {
    console.log(`  ... and ${updates.length - 20} more`);
  }

  if (dryRun) {
    console.log("");
    return;
  }

  let updated = 0;
  const errors = [];

  for (const update of updates) {
    try {
      await client.mutation(api.replications.updateEffectSlug, {
        apiKey: CONVEX_ADMIN_KEY,
        slug: update.slug,
        effect_slug: update.desiredEffectSlug,
      });
      updated++;
      console.log(`✓ ${update.slug} -> ${update.desiredEffectSlug}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${update.slug}: ${message}`);
      console.log(`✗ ${update.slug}: ${message}`);
    }
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`✓ Updated: ${updated}`);
  if (errors.length > 0) {
    console.log(`✗ Failed: ${errors.length}`);
    for (const error of errors) {
      console.log(`  - ${error}`);
    }
  }
  console.log(`${"=".repeat(60)}\n`);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
