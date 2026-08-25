#!/usr/bin/env node
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { createReadStream, existsSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api.js";
import {
  assertProductionWriteAllowed,
  createProductionWriteCommand,
  printProductionWriteCommand,
  requireProductionWriteCredential,
} from "../lib/production-write-command.mjs";
import { getFlagValue } from "../lib/data-ops-run-context.mjs";

const OPERATION = "replace-reviewed-video-quality-renditions";
const EXPECTED_TARGET = "https://glad-minnow-656.convex.cloud";
const DEFAULT_MANIFEST = "/Users/josie/Documents/Dose Wiki Media Review/Data/video-quality-replacements-2026-08-24.json";
const DEFAULT_PLAN = "/Users/josie/Documents/Dose Wiki Media Review/Data/production-upload-plan.json";
const DEFAULT_ORIGINAL_LEDGER = "/Users/josie/Documents/Dose Wiki Media Review/Data/production-upload-ledger.json";
const DEFAULT_LEDGER = "/Users/josie/Documents/Dose Wiki Media Review/Data/video-quality-production-replacement-ledger-2026-08-24.json";
const DEFAULT_DELIVERY_OVERRIDES = "/Users/josie/Documents/Dose Wiki Media Review/Data/video-quality-convex-delivery-overrides-2026-08-24.json";

function required(value, message) {
  if (!value) throw new Error(message);
}

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function atomicJson(file, value) {
  const temporary = `${file}.${process.pid}.part`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(temporary, file);
}

async function digest(file) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

async function postFile(uploadUrl, file) {
  return await new Promise((resolve, reject) => {
    const child = spawn("curl", [
      "--silent", "--show-error", "--http1.1",
      "--request", "POST",
      "--header", "Content-Type: video/mp4",
      "--data-binary", `@${file}`,
      "--write-out", "\n%{http_code}",
      uploadUrl,
    ], { stdio: ["ignore", "pipe", "pipe"] });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      const output = Buffer.concat(stdout).toString("utf8");
      const split = output.lastIndexOf("\n");
      const body = split >= 0 ? output.slice(0, split) : output;
      const parsedStatusCode = split >= 0 ? Number.parseInt(output.slice(split + 1), 10) : null;
      const statusCode = code === 0 ? parsedStatusCode : null;
      if (code !== 0 || !statusCode || statusCode < 200 || statusCode >= 300) {
        const detail = Buffer.concat(stderr).toString("utf8").trim() || body;
        const error = new Error(`Upload failed: ${statusCode ?? "transport"} ${detail}`);
        error.statusCode = statusCode;
        reject(error);
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error(`Upload returned invalid JSON: ${error.message}`));
      }
    });
  });
}

async function upload(client, apiKey, file) {
  let lastError;
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    try {
      const uploadUrl = await client.mutation(api.replications.generateUploadUrl, { apiKey });
      const payload = await postFile(uploadUrl, file);
      required(payload.storageId, "Upload returned no storageId.");
      return payload.storageId;
    } catch (error) {
      lastError = error;
      if ((error?.statusCode && error.statusCode < 500) || attempt === 8) throw error;
      const delay = Math.min(1000 * 2 ** (attempt - 1), 30_000);
      console.log(`  upload transport failed (${error.code ?? error.message}); retry ${attempt}/8 after ${delay}ms`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

function loadLedger(file, manifestPath) {
  if (existsSync(file)) {
    const ledger = readJson(file);
    required(ledger.manifestPath === manifestPath, "Replacement ledger belongs to another manifest.");
    required(ledger.target === EXPECTED_TARGET, "Replacement ledger belongs to another target.");
    return ledger;
  }
  return {
    schemaVersion: 1,
    operation: OPERATION,
    target: EXPECTED_TARGET,
    manifestPath,
    createdAt: new Date().toISOString(),
    items: {},
  };
}

async function main() {
  const argv = process.argv.slice(2);
  const command = createProductionWriteCommand({ operation: OPERATION, argv });
  const manifestPath = path.resolve(getFlagValue(argv, "--manifest") ?? DEFAULT_MANIFEST);
  const planPath = path.resolve(getFlagValue(argv, "--plan") ?? DEFAULT_PLAN);
  const originalLedgerPath = path.resolve(getFlagValue(argv, "--original-ledger") ?? DEFAULT_ORIGINAL_LEDGER);
  const ledgerPath = path.resolve(getFlagValue(argv, "--ledger") ?? DEFAULT_LEDGER);
  const deliveryOverridesPath = path.resolve(getFlagValue(argv, "--delivery-overrides") ?? DEFAULT_DELIVERY_OVERRIDES);
  const limitValue = getFlagValue(argv, "--limit");
  const limit = limitValue ? Number.parseInt(limitValue, 10) : Number.POSITIVE_INFINITY;
  required(command.targetUrl === EXPECTED_TARGET, `Pass --target-url=${EXPECTED_TARGET}.`);
  required(Number.isFinite(limit) ? limit > 0 : limit === Number.POSITIVE_INFINITY, "--limit must be positive.");

  const manifest = readJson(manifestPath);
  const plan = readJson(planPath);
  const originalLedger = readJson(originalLedgerPath);
  const deliveryOverrides = existsSync(deliveryOverridesPath) ? readJson(deliveryOverridesPath) : { items: {} };
  required(manifest.status === "prepared", "Replacement manifest is not prepared.");
  required(manifest.completed === manifest.expected && manifest.items.length === manifest.expected, "Replacement manifest is incomplete.");
  required(manifest.productionWrites === 0 && manifest.uploads === 0, "Preparation manifest unexpectedly records production activity.");

  const ids = new Set();
  const candidates = [];
  for (const item of manifest.items) {
    required(!ids.has(item.id), `${item.id}: duplicate manifest ID.`);
    ids.add(item.id);
    const delivery = deliveryOverrides.items?.[item.id];
    if (delivery) item.output = { ...item.output, ...delivery, method: "convex-delivery-h264-videotoolbox" };
    if (!item.publicationEligible) continue;
    if (item.priorAction === "exclude") continue;
    required(existsSync(item.output.path), `${item.id}: output file is missing.`);
    required(statSync(item.output.path).size === item.output.bytes, `${item.id}: output size drifted.`);
    const original = originalLedger.items[item.id];
    const planned = plan.entries.find((entry) => entry.id === item.id);
    if (original?.status === "verified" && original.productionId && original.storageIds?.main) {
      candidates.push({ item, productionId: original.productionId, expectedStorageId: original.storageIds.main, source: "verified-upload-ledger" });
    } else if (planned?.action === "existing" && planned.productionId && planned.productionStorageId) {
      candidates.push({ item, productionId: planned.productionId, expectedStorageId: planned.productionStorageId, source: "existing-production-row" });
    }
  }

  const client = new ConvexHttpClient(command.targetUrl);
  const { token: apiKey } = requireProductionWriteCredential("replicationMaintenance");
  const allRows = await client.query(api.replications.getAll, {});
  const rowsBySlug = new Map();
  for (const row of allRows) {
    const rows = rowsBySlug.get(row.slug) ?? [];
    rows.push(row);
    rowsBySlug.set(row.slug, rows);
  }
  const ledger = loadLedger(ledgerPath, manifestPath);
  const actions = [];
  const skipped = [];
  for (const candidate of candidates) {
    let live = await client.query(api.replications.getResolvedById, { apiKey, id: candidate.productionId });
    if (!live && candidate.source === "existing-production-row") {
      const matches = (rowsBySlug.get(candidate.item.slug) ?? []).filter((row) => row.type === "video");
      if (matches.length === 1) live = matches[0];
    }
    if (!live) {
      skipped.push({ id: candidate.item.id, slug: candidate.item.slug, reason: "production row no longer exists" });
      continue;
    }
    if (candidate.source === "existing-production-row") {
      required(live.slug === candidate.item.slug, `${candidate.item.id}: production slug drifted (${live.slug}).`);
    }
    required(live.type === "video", `${candidate.item.id}: production row is not video.`);
    const state = ledger.items[candidate.item.id];
    const expectedCurrent = state?.newStorageId ?? state?.previousStorageId ?? live.storage_id;
    required(live.storage_id === expectedCurrent, `${candidate.item.id}: production storage changed outside this run.`);
    actions.push({ ...candidate, productionId: live._id, expectedStorageId: state?.previousStorageId ?? live.storage_id, live, state });
  }
  actions.sort((a, b) => a.item.output.bytes - b.item.output.bytes || a.item.id.localeCompare(b.item.id));
  const pending = actions.filter(({ state }) => state?.status !== "verified");

  printProductionWriteCommand(command);
  console.log(`Manifest          : ${manifestPath}`);
  console.log(`Replacement rows  : ${actions.length}`);
  console.log(`Skipped stale rows: ${skipped.length}`);
  for (const item of skipped) console.log(`  ${item.id} ${item.slug}: ${item.reason}`);
  console.log(`Already verified  : ${actions.length - pending.length}`);
  console.log(`Pending           : ${pending.length}`);
  console.log(`Pending bytes     : ${pending.reduce((sum, action) => sum + action.item.output.bytes, 0)}`);
  console.log(`Largest pending   : ${pending.reduce((max, action) => Math.max(max, action.item.output.bytes), 0)}`);

  if (command.dryRun) {
    console.log("Dry run complete: no files uploaded and no Convex rows modified.");
    return;
  }

  assertProductionWriteAllowed(command);
  const batch = pending.slice(0, limit);
  console.log(`Writing ${batch.length} replacement(s).`);
  for (const [index, action] of batch.entries()) {
    const { item } = action;
    const state = ledger.items[item.id] ?? {
      id: item.id,
      slug: action.live.slug,
      sourceSlug: item.slug,
      productionId: action.productionId,
      previousStorageId: action.expectedStorageId,
      previousFileSize: action.live.file_size ?? null,
      outputPath: item.output.path,
      outputBytes: item.output.bytes,
      outputWidth: item.output.width,
      outputHeight: item.output.height,
      outputDuration: item.output.duration,
      status: "pending",
    };
    state.outputPath = item.output.path;
    state.outputBytes = item.output.bytes;
    state.outputWidth = item.output.width;
    state.outputHeight = item.output.height;
    state.outputDuration = item.output.duration;
    ledger.items[item.id] = state;
    console.log(`[${index + 1}/${batch.length}] ${item.id} ${item.slug} (${item.output.bytes} bytes)`);

    const beforeUpload = await client.query(api.replications.getResolvedById, { apiKey, id: state.productionId });
    required(beforeUpload, `${item.id}: row disappeared before upload.`);
    required(beforeUpload.storage_id === (state.newStorageId ?? state.previousStorageId), `${item.id}: storage changed before upload.`);

    if (!state.newStorageId) {
      state.sha256 = await digest(item.output.path);
      required(state.sha256 === item.output.sha256, `${item.id}: output hash drifted.`);
      state.newStorageId = await upload(client, apiKey, item.output.path);
      state.status = "uploaded";
      atomicJson(ledgerPath, ledger);
    }

    const beforeWrite = await client.query(api.replications.getResolvedById, { apiKey, id: state.productionId });
    required(beforeWrite, `${item.id}: row disappeared before write.`);
    if (beforeWrite.storage_id === state.previousStorageId) {
      await client.mutation(api.replications.updateStorageIds, { apiKey, id: state.productionId, storage_id: state.newStorageId });
      state.status = "repointed";
      atomicJson(ledgerPath, ledger);
    } else {
      required(beforeWrite.storage_id === state.newStorageId, `${item.id}: unexpected storage before write.`);
    }

    await client.mutation(api.replications.updateDeliveredFileSize, {
      apiKey,
      id: state.productionId,
      expectedStorageId: state.newStorageId,
      file_size: item.output.bytes,
    });
    const after = await client.query(api.replications.getResolvedById, { apiKey, id: state.productionId });
    required(after?.storage_id === state.newStorageId, `${item.id}: replacement did not persist.`);
    required(after.file_size === item.output.bytes, `${item.id}: file size did not persist.`);
    required(typeof after.url === "string" && after.url, `${item.id}: resolved URL is missing.`);
    const response = await fetch(after.url, { method: "HEAD", cache: "no-store" });
    required(response.ok, `${item.id}: resolved URL returned HTTP ${response.status}.`);
    const length = Number(response.headers.get("content-length"));
    if (Number.isFinite(length) && length > 0) required(length === item.output.bytes, `${item.id}: content length mismatch.`);

    state.url = after.url;
    state.status = "verified";
    state.verifiedAt = new Date().toISOString();
    atomicJson(ledgerPath, ledger);
  }

  const verified = Object.values(ledger.items).filter((item) => item.status === "verified").length;
  console.log(`Verified replacements: ${verified}/${actions.length}`);
  console.log(`Rollback ledger: ${ledgerPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
