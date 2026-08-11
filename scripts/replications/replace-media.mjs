#!/usr/bin/env node
/**
 * Point one replication row at a file uploaded into this deployment's storage.
 *
 * Exists because a row can carry a `storage_id` that belongs to a *different*
 * Convex deployment. `resolveReplicationUrls` then silently falls back to the
 * row's legacy `url` field, so the page renders whatever that URL happens to
 * hold — which may be a completely different picture. Nothing errors; the wrong
 * image is simply served. Re-uploading the intended file to the target
 * deployment and repointing `storage_id` is the fix.
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
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api.js";
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
    console.log("\nDry run — nothing uploaded, no Convex writes performed.");
    return;
  }

  assertProductionWriteAllowed(command);
  const { token: apiKey } = requireProductionWriteCredential("replicationMaintenance");
  const client = new ConvexHttpClient(command.targetUrl);

  const uploadUrl = await client.mutation(api.replications.generateUploadUrl, { apiKey });
  const upload = await fetch(uploadUrl, {
    method: "POST",
    headers: { "Content-Type": contentType },
    body: bytes,
  });

  if (!upload.ok) {
    throw new Error(`Upload failed: ${upload.status} ${await upload.text()}`);
  }

  const { storageId } = await upload.json();
  if (!storageId) throw new Error("Upload succeeded but returned no storageId.");

  await client.mutation(api.replications.updateStorageIds, {
    apiKey,
    id,
    storage_id: storageId,
  });

  console.log(`\nUploaded and repointed ${id} -> storage ${storageId}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
