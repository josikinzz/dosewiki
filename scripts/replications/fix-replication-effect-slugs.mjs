#!/usr/bin/env node
/**
 * Sync replication effect_slug values in Postgres from local replication metadata.
 *
 * Usage:
 *   node scripts/replications/fix-replication-effect-slugs.mjs --dry-run
 *   node scripts/replications/fix-replication-effect-slugs.mjs --execute
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createDataClient, resolvePostgresSource } from "../lib/data-client.ts";
import { api } from "../../lib/postgres/runtime/api.ts"
import {
  assertProductionWriteAllowed,
  createProductionWriteCommand,
  printProductionWriteCommand,
  requireProductionWriteCredential,
} from "../lib/production-write-command.mjs";
import {
  applyGalleryOrderMappingsToMetadata,
  loadGalleryOrderMapping,
  readSimpleEnvFile,
  resolveReplicationsPaths,
} from "./lib/reconciliation.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const { metadataFile, galleryOrderMappingFile, envFile } = resolveReplicationsPaths(__dirname);
const env = {
  ...readSimpleEnvFile(envFile),
  ...process.env,
};

const command = createProductionWriteCommand({
  operation: "fix-replication-effect-slugs",
  env,
  loadsEnvLocal: false,
});
const readUrl = command.writeRequested ? command.targetUrl : resolvePostgresSource({ env }).url;

if (!readUrl) {
  throw new Error("Set SOURCE_POSTGRES_URL for dry-run or an explicit target for writes.");
}

const metadata = JSON.parse(fs.readFileSync(metadataFile, "utf8"));
const galleryOrderMapping = loadGalleryOrderMapping(galleryOrderMappingFile);
applyGalleryOrderMappingsToMetadata(metadata.replications, galleryOrderMapping);

const sourceClient = createDataClient({ target: readUrl, env }).client;

async function main() {
  console.log(`\n${"=".repeat(60)}`);
  console.log("Fix Replication Effect Slugs");
  printProductionWriteCommand(command);
  console.log(`${"=".repeat(60)}\n`);

  const currentReplications = await sourceClient.query(api.replications.getAll, {});
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

  if (command.dryRun) {
    console.log("");
    return;
  }

  let updated = 0;
  const errors = [];
  assertProductionWriteAllowed(command);
  const credential = requireProductionWriteCredential("replicationMaintenance", { env });
  const targetClient = createDataClient({ target: command.targetUrl, env }).client;

  for (const update of updates) {
    try {
      await targetClient.mutation(api.replications.updateEffectSlug, {
        apiKey: credential.token,
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
