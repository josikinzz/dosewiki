#!/usr/bin/env node
/**
 * Backfill creator-retained rights metadata for existing Postgres replication rows
 * from notes-and-plans/exports/replications/replications-metadata.json.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createDataClient, resolvePostgresSource } from "../lib/data-client.ts";
import { api } from "../../lib/postgres/runtime/api.ts"
import {
  readSimpleEnvFile,
  resolveReplicationsPaths,
} from "./lib/reconciliation.mjs";
import {
  withDefaultReplicationRights,
} from "./lib/workspace.mjs";
import {
  assertProductionWriteAllowed,
  createProductionWriteCommand,
  printProductionWriteCommand,
  requireProductionWriteCredential,
} from "../lib/production-write-command.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { metadataFile, envFile } = resolveReplicationsPaths(__dirname);

const RIGHTS_FIELDS = [
  "rights_status",
  "license_name",
  "license_url",
  "credit_line",
  "source_url",
  "rightsholder",
  "permission_notes",
  "removal_contact",
];

function readArg(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    return fallback;
  }

  return process.argv[index + 1] ?? fallback;
}

function pickRightsUpdates(replication) {
  return Object.fromEntries(
    RIGHTS_FIELDS
      .map((field) => [field, replication[field]])
      .filter(([, value]) => value !== undefined && value !== null && value !== ""),
  );
}

const env = {
  ...readSimpleEnvFile(envFile),
  ...process.env,
};

const command = createProductionWriteCommand({
  operation: "backfill-replication-rights",
  env,
  loadsEnvLocal: false,
});
const readUrl = command.writeRequested ? command.targetUrl : resolvePostgresSource({ env }).url;
const inputPath = readArg("--input", metadataFile);
const limitArg = readArg("--limit", "");
const limit = limitArg ? Number.parseInt(limitArg, 10) : null;

if (!readUrl) {
  throw new Error("Set SOURCE_POSTGRES_URL for dry-run or an explicit target for writes.");
}

if (!fs.existsSync(inputPath)) {
  throw new Error(`Replication metadata file not found: ${inputPath}`);
}

const metadata = JSON.parse(fs.readFileSync(inputPath, "utf8"));
if (!Array.isArray(metadata.replications)) {
  throw new Error(`Expected ${inputPath} to contain a replications array.`);
}

const sourceClient = createDataClient({ target: readUrl, env }).client;
const desiredBySlug = new Map(
  metadata.replications.map((replication) => [
    replication.slug,
    pickRightsUpdates(withDefaultReplicationRights(replication)),
  ]),
);

printProductionWriteCommand(command);
const existing = await sourceClient.query(api.replications.getAll, {});
const candidates = existing
  .filter((replication) => desiredBySlug.has(replication.slug))
  .filter((replication) => {
    const desired = desiredBySlug.get(replication.slug);
    return RIGHTS_FIELDS.some((field) => desired[field] !== undefined && desired[field] !== replication[field]);
  });
const toProcess = limit ? candidates.slice(0, limit) : candidates;

console.log("Replication rights metadata backfill");
console.log(`Input: ${inputPath}`);
console.log(`Existing rows: ${existing.length}`);
console.log(`Rows needing update: ${candidates.length}`);
console.log(`Rows selected: ${toProcess.length}`);

if (command.dryRun) {
  for (const replication of toProcess.slice(0, 20)) {
    console.log(`DRY RUN: ${replication.slug}`);
  }
  if (toProcess.length > 20) {
    console.log(`...and ${toProcess.length - 20} more.`);
  }
  process.exit(0);
}

let updated = 0;
assertProductionWriteAllowed(command);
const credential = requireProductionWriteCredential("replicationMaintenance", { env });
const targetClient = createDataClient({ target: command.targetUrl, env }).client;
for (const replication of toProcess) {
  await targetClient.mutation(api.replications.updateRightsMetadata, {
    apiKey: credential.token,
    slug: replication.slug,
    updates: desiredBySlug.get(replication.slug),
  });
  updated++;
  console.log(`[${updated}/${toProcess.length}] ${replication.slug}`);
}

console.log(`Updated ${updated} replication row(s).`);
