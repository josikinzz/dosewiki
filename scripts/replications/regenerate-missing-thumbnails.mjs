#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createDataClient } from "../lib/data-client.ts";
import { getFlagValue } from "../lib/data-ops-run-context.mjs";
import { api } from "../../lib/postgres/runtime/api.ts"
import { uploadReplicationBytes, updateReplicationMedia } from "./lib/r2-upload.mjs";
import {
  assertProductionWriteAllowed,
  createProductionWriteCommand,
  printProductionWriteCommand,
  requireProductionWriteCredential,
} from "../lib/production-write-command.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const AUDIT_PATH = path.resolve(getFlagValue(process.argv.slice(2), "--audit-path") ?? path.join(os.homedir(), ".local/state/dosewiki-housecleaning/replication-provenance/audit-latest.json"));
const LEDGER_PATH = path.join(ROOT, "tmp/replication-provenance/thumbnail-ledger.json");
const WRITE = process.argv.includes("--write");
const CONFIRMED = process.argv.includes("--confirm-thumbnail-write");
const requestedDigest = process.argv.find((value) => value.startsWith("--digest="))?.slice(9);

function digest(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function download(url, destination) {
  const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(`Media download failed with ${response.status}`);
  fs.writeFileSync(destination, Buffer.from(await response.arrayBuffer()));
}

function extractThumbnail(input, output) {
  const result = spawnSync("ffmpeg", ["-y", "-ss", "0.5", "-i", input, "-frames:v", "1", "-vf", "scale='min(1280,iw)':-2", "-quality", "82", output], { encoding: "utf8" });
  if (result.status !== 0 || !fs.existsSync(output)) throw new Error(result.stderr || "ffmpeg thumbnail extraction failed");
}

async function main() {
  const command = createProductionWriteCommand({
    operation: "regenerate-replication-thumbnails",
    startDir: ROOT,
  });
  printProductionWriteCommand(command);
  const audit = JSON.parse(fs.readFileSync(AUDIT_PATH, "utf8"));
  if (!audit.sources?.target_selected || audit.sources.postgres_target !== command.deploymentFingerprint) throw new Error("Audit must match the explicitly selected Postgres write target.");
  const records = audit.records.filter((record) => record.current.type === "video" && record.health.media === "ok" && record.health.thumbnail === "missing");
  const payloadDigest = digest(records.map((record) => ({ id: record.live_id, storage_id: record.current.storage_id ?? null, r2_key: record.current.r2_key ?? null, url: record.current.url })));
  console.log(JSON.stringify({ mode: command.dryRun ? "dry-run" : "write", thumbnails: records.length, payload_digest: payloadDigest }, null, 2));
  if (command.dryRun) return;
  assertProductionWriteAllowed(command);
  if (!WRITE || !CONFIRMED || requestedDigest !== payloadDigest) throw new Error(`Write requires --write --confirm-thumbnail-write --digest=${payloadDigest}`);
  const apiKey = requireProductionWriteCredential("replicationMaintenance").token;
  const client = createDataClient({ target: command.targetUrl }).client;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "replication-thumbnails-"));
  const outcomes = [];
  try {
    for (const [index, record] of records.entries()) {
      process.stderr.write(`\rGenerating thumbnail ${index + 1}/${records.length}`);
      const input = path.join(tempDir, `${index}.${record.current.format || "mp4"}`);
      const output = path.join(tempDir, `${index}.webp`);
      try {
        const live = await client.query(api.replications.getResolvedById, { apiKey, id: record.live_id });
        if (!live || (live.storage_id ?? null) !== (record.current.storage_id ?? null) ||
            (live.r2_key ?? null) !== (record.current.r2_key ?? null) || live.url !== record.current.url) {
          throw new Error("Source identity changed since the reviewed audit.");
        }
        if (live.thumbnail_url) throw new Error("Thumbnail appeared since the reviewed audit.");
        await download(record.current.url, input);
        extractThumbnail(input, output);
        const buffer = fs.readFileSync(output);
        const r2Key = await uploadReplicationBytes(client, apiKey, buffer, "image/webp", "webp");
        await updateReplicationMedia(client, apiKey, live, { thumbnail_r2_key: r2Key });
        const after = await client.query(api.replications.getResolvedById, { apiKey, id: record.live_id });
        if (after?.thumbnail_r2_key !== r2Key || !after.thumbnail_url || after.url !== live.url) {
          throw new Error(`Thumbnail readback failed after association: ${r2Key}`);
        }
        outcomes.push({ live_id: record.live_id, slug: record.slug, status: "applied", thumbnail_r2_key: r2Key, sha256: digest(buffer) });
      } catch (error) {
        outcomes.push({ live_id: record.live_id, slug: record.slug, status: "failed", error: error instanceof Error ? error.message : String(error) });
      } finally {
        if (fs.existsSync(input)) fs.unlinkSync(input);
        if (fs.existsSync(output)) fs.unlinkSync(output);
      }
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
    process.stderr.write("\n");
  }
  const ledger = { schema_version: 1, applied_at: new Date().toISOString(), audit_generated_at: audit.generated_at, payload_digest: payloadDigest, summary: { proposed: records.length, applied: outcomes.filter((row) => row.status === "applied").length, failed: outcomes.filter((row) => row.status === "failed").length }, outcomes };
  fs.mkdirSync(path.dirname(LEDGER_PATH), { recursive: true });
  fs.writeFileSync(LEDGER_PATH, `${JSON.stringify(ledger, null, 2)}\n`);
  console.log(JSON.stringify(ledger.summary, null, 2));
  if (ledger.summary.failed) process.exitCode = 1;
}

await main();
