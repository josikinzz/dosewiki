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
import { createDataClient, resolvePostgresSource } from "../lib/data-client.ts";
import { api } from "../../lib/postgres/runtime/api.ts"
import {
  loadGalleryOrderMapping,
  readSimpleEnvFile,
  resolveReplicationsPaths,
} from "./lib/reconciliation.mjs";
import {
  createReplicationMediaAdapter,
  planGalleryOrderMutations,
} from "./lib/workspace.mjs";
import {
  assertProductionWriteAllowed,
  createProductionWriteCommand,
  printProductionWriteCommand,
  requireProductionWriteCredential,
} from "../lib/production-write-command.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const { metadataFile, galleryOrderMappingFile, envFile } = resolveReplicationsPaths(__dirname);

const env = {
  ...readSimpleEnvFile(envFile),
  ...process.env,
};

const command = createProductionWriteCommand({
  operation: "create-replication-gallery-order",
  env,
  loadsEnvLocal: false,
});
const readUrl = command.writeRequested ? command.targetUrl : resolvePostgresSource({ env }).url;

if (!readUrl) {
  throw new Error("Set SOURCE_POSTGRES_URL for dry-run or an explicit target for writes.");
}

if (!fs.existsSync(metadataFile)) {
  throw new Error(`Replication metadata file not found: ${metadataFile}`);
}

const metadata = JSON.parse(fs.readFileSync(metadataFile, "utf8"));
const galleryOrderMapping = loadGalleryOrderMapping(galleryOrderMappingFile);
const sourceClient = createDataClient({ target: readUrl, env }).client;

async function main() {
  console.log(`\n${"=".repeat(60)}`);
  console.log("Create Gallery Order for Effects");
  printProductionWriteCommand(command);
  console.log(`${"=".repeat(60)}\n`);

  const currentEffects = await sourceClient.query(api.subjectiveEffects.getAll, {});
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

  if (command.dryRun) {
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
  assertProductionWriteAllowed(command);
  const credential = requireProductionWriteCredential("replicationMaintenance", { env });
  const replicationMedia = createReplicationMediaAdapter({
    client: createDataClient({ target: command.targetUrl, env }).client,
    api,
    apiKey: credential.token,
  });

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
