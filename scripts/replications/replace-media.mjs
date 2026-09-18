#!/usr/bin/env node
/**
 * Point one replication row at a verified native R2 upload, preserving its
 * metadata, rights, and historical recovery storage IDs. Stale derivatives
 * are cleared atomically with the main replacement.
 *
 * Dry run (default):
 *   node scripts/replications/replace-media.mjs --id=<rowId> --file=<path>
 *
 * Apply:
 *   node scripts/replications/replace-media.mjs --id=<rowId> --file=<path> --write \
 *     --confirm-write=replace-replication-media --expected-deployment=<fingerprint>
 */
import fs from "fs";
import path from "path";
import { createDataClient } from "../lib/data-client.ts";
import { api } from "../../lib/postgres/runtime/api.ts"
import { uploadReplicationBytes, updateReplicationMedia } from "./lib/r2-upload.mjs";
import {
  assertProductionWriteAllowed,
  createProductionWriteCommand,
  printProductionWriteCommand,
  requireProductionWriteCredential,
} from "../lib/production-write-command.mjs";

const OPERATION = "replace-replication-media";

const CONTENT_TYPES = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
};

function readArg(name) {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
}

async function main() {
  const command = createProductionWriteCommand({ operation: OPERATION });
  const id = readArg("id");
  const file = readArg("file");

  if (!id) throw new Error("Pass --id=<replication row id>.");
  if (!file) throw new Error("Pass --file=<path to the media file>.");
  if (!fs.existsSync(file)) throw new Error(`File not found: ${file}`);

  const contentType = CONTENT_TYPES[path.extname(file).toLowerCase()];
  if (!contentType) throw new Error(`Unsupported file extension: ${path.extname(file)}`);

  printProductionWriteCommand(command);

  const bytes = fs.readFileSync(file);
  console.log(`\nRow  : ${id}`);
  console.log(`File : ${file}`);
  console.log(`Type : ${contentType}  (${bytes.length} bytes)`);

  if (command.dryRun) {
    console.log("\nDry run: nothing uploaded, no Postgres writes performed.");
    return;
  }

  assertProductionWriteAllowed(command);
  const { token: apiKey } = requireProductionWriteCredential("replicationMaintenance");
  const client = createDataClient({ target: command.targetUrl }).client;

  const row = await client.query(api.replications.getResolvedById, { apiKey, id });
  if (!row) throw new Error(`Replication not found: ${id}`);
  const r2Key = await uploadReplicationBytes(client, apiKey, bytes, contentType, path.extname(file).slice(1));
  await updateReplicationMedia(client, apiKey, row, { r2_key: r2Key }, bytes.length);

  const after = await client.query(api.replications.getResolvedById, { apiKey, id });
  if (after?.r2_key !== r2Key || after.file_size !== bytes.length || !after.url) {
    throw new Error(`Replacement readback failed for ${id}. Uploaded R2 key: ${r2Key}`);
  }
  console.log(`\nUploaded and repointed ${id} -> R2 ${r2Key}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
