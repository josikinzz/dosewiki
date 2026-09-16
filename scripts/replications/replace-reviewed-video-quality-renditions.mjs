#!/usr/bin/env node
import { createHash } from "node:crypto";
import { createReadStream, existsSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { requireCampaignTarget, bindCampaignTarget } from "./lib/postgres-target.mjs";
import { createDataClient } from "../lib/data-client.ts";
import { api } from "../../lib/postgres/runtime/api.ts"
import {
  assertProductionWriteAllowed,
  createProductionWriteCommand,
  printProductionWriteCommand,
  requireProductionWriteCredential,
} from "../lib/production-write-command.mjs";
import { getFlagValue } from "../lib/data-ops-run-context.mjs";
import { uploadReplicationFile, uploadReplicationBytes, updateReplicationMedia } from "./lib/r2-upload.mjs";

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


function loadLedger(file, manifestPath) {
  if (existsSync(file)) {
    const ledger = readJson(file);
    required(ledger.manifestPath === manifestPath, "Replacement ledger belongs to another manifest.");
    required(ledger.target === EXPECTED_TARGET, "Replacement ledger belongs to another target.");
    required(ledger.schemaVersion === 2 || Object.keys(ledger.items ?? {}).length === 0, "Legacy replacement ledger has activity; reconcile it and use a new native R2 ledger.");
    ledger.schemaVersion = 2;
    return ledger;
  }
  return {
    schemaVersion: 2,
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
  const postgresTarget = requireCampaignTarget(command);
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
    if (delivery) item.output = { ...item.output, ...delivery, method: "convex-delivery-h264-videotoolbox" }; // Reviewed historical delivery provenance.
    if (!item.publicationEligible) continue;
    if (item.priorAction === "exclude") continue;
    required(existsSync(item.output.path), `${item.id}: output file is missing.`);
    required(statSync(item.output.path).size === item.output.bytes, `${item.id}: output size drifted.`);
    const original = originalLedger.items[item.id];
    const planned = plan.entries.find((entry) => entry.id === item.id);
    if (original?.status === "verified" && original.productionId && (original.r2Keys?.main || original.storageIds?.main)) {
      candidates.push({ item, productionId: original.productionId, expectedStorageId: original.storageIds?.main ?? null, expectedR2Key: original.r2Keys?.main ?? null, source: "verified-upload-ledger" });
    } else if (planned?.action === "existing" && planned.productionId && (planned.productionR2Key || planned.productionStorageId)) {
      candidates.push({ item, productionId: planned.productionId, expectedStorageId: planned.productionStorageId ?? null, expectedR2Key: planned.productionR2Key ?? null, source: "existing-production-row" });
    }
  }

  const client = createDataClient({ target: command.targetUrl }).client;
  const { token: apiKey } = requireProductionWriteCredential("replicationMaintenance");
  const allRows = await client.query(api.replications.getAll, {});
  const rowsBySlug = new Map();
  for (const row of allRows) {
    const rows = rowsBySlug.get(row.slug) ?? [];
    rows.push(row);
    rowsBySlug.set(row.slug, rows);
  }
  const ledger = loadLedger(ledgerPath, manifestPath);
  bindCampaignTarget(ledger, postgresTarget);
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
    required((live.storage_id ?? null) === candidate.expectedStorageId &&
      ((live.r2_key ?? null) === candidate.expectedR2Key || (state?.r2Key && live.r2_key === state.r2Key)),
      `${candidate.item.id}: production media changed outside this run.`);
    if (state) {
      required(state.productionId === live._id, `${candidate.item.id}: replacement ledger row identity drifted.`);
      if (state.status === "verified" || state.status === "repointed") {
        required(live.r2_key === state.r2Key && live.file_size === candidate.item.output.bytes,
          `${candidate.item.id}: applied replacement no longer matches its ledger.`);
        for (const [field, key] of Object.entries(state.r2Keys ?? {})) {
          required(live[field] === key, `${candidate.item.id}: applied ${field} changed outside this run.`);
        }
      }
      required(state.previousStorageId === candidate.expectedStorageId && state.previousR2Key === candidate.expectedR2Key,
        `${candidate.item.id}: replacement ledger source identity differs from reviewed original.`);
      required(state.outputPath === candidate.item.output.path && state.outputBytes === candidate.item.output.bytes &&
        state.sha256 === candidate.item.output.sha256, `${candidate.item.id}: replacement ledger output differs from reviewed manifest.`);
    }
    actions.push({ ...candidate, productionId: live._id, live, state });
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
    console.log("Dry run complete: no files uploaded and no Postgres rows modified.");
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
      previousR2Key: action.expectedR2Key,
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
    required((beforeUpload.storage_id ?? null) === state.previousStorageId &&
      ((beforeUpload.r2_key ?? null) === state.previousR2Key || (state.r2Key && beforeUpload.r2_key === state.r2Key)),
      `${item.id}: media identity changed before upload.`);

    if (!state.r2Key) {
      state.sha256 = await digest(item.output.path);
      required(state.sha256 === item.output.sha256, `${item.id}: output hash drifted.`);
      state.r2Key = await uploadReplicationFile(client, apiKey, item.output.path, "video/mp4");
      state.status = "uploaded";
      atomicJson(ledgerPath, ledger);
    }

    const beforeWrite = await client.query(api.replications.getResolvedById, { apiKey, id: state.productionId });
    required(beforeWrite, `${item.id}: row disappeared before write.`);
    required((beforeWrite.storage_id ?? null) === state.previousStorageId, `${item.id}: historical source identity changed.`);
    if ((beforeWrite.r2_key ?? null) === state.previousR2Key) {
      const keys = { r2_key: state.r2Key };
      for (const field of ["thumbnail", "preview", "motion", "motion_poster"]) {
        if (beforeWrite[`${field}_r2_key`]) {
          keys[`${field}_r2_key`] = beforeWrite[`${field}_r2_key`];
        } else if (beforeWrite[`${field}_url`]) {
          const response = await fetch(beforeWrite[`${field}_url`]);
          required(response.ok, `${item.id}: ${field} download returned HTTP ${response.status}.`);
          const contentType = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
          const extension = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/avif": "avif", "video/mp4": "mp4", "video/webm": "webm" }[contentType];
          required(extension, `${item.id}: ${field} has unsupported content type ${contentType}.`);
          keys[`${field}_r2_key`] = await uploadReplicationBytes(client, apiKey, new Uint8Array(await response.arrayBuffer()), contentType, extension);
        }
      }
      state.r2Keys = keys;
      atomicJson(ledgerPath, ledger);
      await updateReplicationMedia(client, apiKey, beforeWrite, keys, item.output.bytes);
      state.status = "repointed";
      atomicJson(ledgerPath, ledger);
    } else {
      required(beforeWrite.r2_key === state.r2Key, `${item.id}: unexpected media identity before write.`);
    }

    const after = await client.query(api.replications.getResolvedById, { apiKey, id: state.productionId });
    required(after?.r2_key === state.r2Key && (after.storage_id ?? null) === state.previousStorageId, `${item.id}: replacement did not persist.`);
    for (const [field, key] of Object.entries(state.r2Keys ?? {})) {
      required(after[field] === key, `${item.id}: ${field} did not persist.`);
    }
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
