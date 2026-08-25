#!/usr/bin/env node
import { createHash } from "node:crypto";
import { createReadStream, existsSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import https from "node:https";
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

const isStasCampaign = process.env.REPLACEMENT_CAMPAIGN === "stas";
const OPERATION = isStasCampaign ? "replace-stas-quality-renditions" : "replace-feetman-quality-renditions";
const EXPECTED_TARGET = "https://glad-minnow-656.convex.cloud";
const EXPECTED_ARTIST = isStasCampaign ? "Stas Constantine" : "FEETMAN100";
const EXPECTED_COUNT = isStasCampaign ? 15 : 58;
const DEFAULT_MANIFEST = isStasCampaign
  ? "/Users/josie/Documents/Dose Wiki Media Review/Data/Dillan Review/stas-quality-replacements-manifest.json"
  : "/Users/josie/Documents/Dose Wiki Media Review/Data/Dillan Review/feetman-quality-replacements-manifest.json";
const DEFAULT_ORIGINAL_LEDGER = "/Users/josie/Documents/Dose Wiki Media Review/Data/Dillan Review/feetman-stas-production-upload-ledger.json";
const DEFAULT_LEDGER = isStasCampaign
  ? "/Users/josie/Documents/Dose Wiki Media Review/Data/Dillan Review/stas-quality-replacement-production-ledger.json"
  : "/Users/josie/Documents/Dose Wiki Media Review/Data/Dillan Review/feetman-quality-replacement-production-ledger.json";
const MAX_BYTES = 95_000_000;

function requireCondition(value, message) {
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
    const request = https.request(uploadUrl, {
      method: "POST",
      agent: false,
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": String(statSync(file).size),
      },
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8");
        if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`Upload failed: ${response.statusCode ?? "unknown"} ${body}`));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(new Error(`Upload returned invalid JSON: ${error.message}`));
        }
      });
    });
    request.on("error", reject);
    const stream = createReadStream(file);
    stream.on("error", reject);
    stream.pipe(request);
  });
}

async function upload(client, apiKey, file) {
  let lastError;
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    try {
      const uploadUrl = await client.mutation(api.replications.generateUploadUrl, { apiKey });
      const payload = await postFile(uploadUrl, file);
      requireCondition(payload.storageId, "Upload returned no storageId.");
      return payload.storageId;
    } catch (error) {
      lastError = error;
      if (String(error?.message).startsWith("Upload failed:") || attempt === 8) throw error;
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
    requireCondition(ledger.manifestPath === manifestPath, "Replacement ledger belongs to another manifest.");
    requireCondition(ledger.target === EXPECTED_TARGET, "Replacement ledger belongs to another target.");
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
  const originalLedgerPath = path.resolve(getFlagValue(argv, "--original-ledger") ?? DEFAULT_ORIGINAL_LEDGER);
  const ledgerPath = path.resolve(getFlagValue(argv, "--ledger") ?? DEFAULT_LEDGER);
  const limitValue = getFlagValue(argv, "--limit");
  const limit = limitValue ? Number.parseInt(limitValue, 10) : Number.POSITIVE_INFINITY;
  requireCondition(command.targetUrl === EXPECTED_TARGET, `Pass --target-url=${EXPECTED_TARGET}.`);
  requireCondition(Number.isFinite(limit) ? limit > 0 : limit === Number.POSITIVE_INFINITY, "--limit must be positive.");

  const manifest = readJson(manifestPath);
  const originalLedger = readJson(originalLedgerPath);
  requireCondition(manifest.status === "validated", "Replacement manifest is not validated.");
  requireCondition(manifest.completed === EXPECTED_COUNT && manifest.items.length === EXPECTED_COUNT, `Expected exactly ${EXPECTED_COUNT} ${EXPECTED_ARTIST} replacements.`);
  const ids = new Set();
  for (const item of manifest.items) {
    requireCondition(item.artist === EXPECTED_ARTIST, `${item.id}: unexpected artist ${item.artist}.`);
    requireCondition(!ids.has(item.id), `${item.id}: duplicate manifest ID.`);
    ids.add(item.id);
    requireCondition(existsSync(item.outputPath), `${item.id}: output file is missing.`);
    requireCondition(statSync(item.outputPath).size === item.output.bytes, `${item.id}: output size drifted.`);
    requireCondition(item.output.bytes <= MAX_BYTES, `${item.id}: output exceeds upload ceiling.`);
    requireCondition(originalLedger.items[item.id]?.status === "verified", `${item.id}: original production ledger is not verified.`);
    requireCondition(originalLedger.items[item.id]?.productionId, `${item.id}: original production row ID is missing.`);
    requireCondition(originalLedger.items[item.id]?.storageIds?.main, `${item.id}: original production storage ID is missing.`);
  }

  const client = new ConvexHttpClient(command.targetUrl);
  const liveRows = await client.query(api.replications.getAll, {});
  const liveById = new Map(liveRows.map((row) => [row._id, row]));
  const ledger = loadLedger(ledgerPath, manifestPath);
  const actions = manifest.items.map((item) => {
    const original = originalLedger.items[item.id];
    const live = liveById.get(original.productionId);
    requireCondition(live, `${item.id}: production row disappeared.`);
    requireCondition(live.slug === item.slug, `${item.id}: production slug drifted.`);
    requireCondition(live.artist === EXPECTED_ARTIST, `${item.id}: production artist drifted.`);
    const state = ledger.items[item.id];
    const expectedCurrent = state?.newStorageId ?? original.storageIds.main;
    requireCondition(live.storage_id === expectedCurrent, `${item.id}: production storage changed outside this replacement (${expectedCurrent} -> ${live.storage_id}).`);
    return { item, original, live, state };
  });
  const pending = actions.filter(({ state }) => state?.status !== "verified");

  printProductionWriteCommand(command);
  console.log(`Manifest          : ${manifestPath}`);
  console.log(`Replacement rows  : ${actions.length}`);
  console.log(`Already verified  : ${actions.length - pending.length}`);
  console.log(`Pending           : ${pending.length}`);
  console.log(`Pending bytes     : ${pending.reduce((sum, action) => sum + action.item.output.bytes, 0)}`);
  console.log(`Stream copies     : ${manifest.items.filter((item) => item.sourceVideoPreserved).length}`);
  console.log(`Grain encodes     : ${manifest.items.filter((item) => !item.sourceVideoPreserved).length}`);

  if (command.dryRun) {
    console.log("Dry run complete: no files uploaded and no Convex rows modified.");
    return;
  }

  assertProductionWriteAllowed(command);
  const { token: apiKey } = requireProductionWriteCredential("replicationMaintenance");
  const batch = pending.slice(0, limit);
  console.log(`Writing ${batch.length} replacement(s).`);

  for (const [index, action] of batch.entries()) {
    const { item, original } = action;
    const state = ledger.items[item.id] ?? {
      id: item.id,
      slug: item.slug,
      productionId: original.productionId,
      previousStorageId: original.storageIds.main,
      previousFileSize: action.live.file_size ?? null,
      status: "pending",
    };
    ledger.items[item.id] = state;
    console.log(`[${index + 1}/${batch.length}] ${item.slug}`);

    const currentBeforeUpload = await client.query(api.replications.getResolvedById, { apiKey, id: original.productionId });
    requireCondition(currentBeforeUpload, `${item.id}: row disappeared before upload.`);
    requireCondition(
      currentBeforeUpload.storage_id === (state.newStorageId ?? state.previousStorageId),
      `${item.id}: storage changed before upload/repoint.`,
    );

    if (!state.newStorageId) {
      state.sha256 = await digest(item.outputPath);
      requireCondition(state.sha256 === item.output.sha256, `${item.id}: output hash drifted.`);
      state.newStorageId = await upload(client, apiKey, item.outputPath);
      state.status = "uploaded";
      atomicJson(ledgerPath, ledger);
    }

    const currentBeforeWrite = await client.query(api.replications.getResolvedById, { apiKey, id: original.productionId });
    requireCondition(currentBeforeWrite, `${item.id}: row disappeared before write.`);
    if (currentBeforeWrite.storage_id === state.previousStorageId) {
      await client.mutation(api.replications.updateStorageIds, {
        apiKey,
        id: original.productionId,
        storage_id: state.newStorageId,
      });
      state.status = "repointed";
      atomicJson(ledgerPath, ledger);
    } else {
      requireCondition(currentBeforeWrite.storage_id === state.newStorageId, `${item.id}: unexpected storage before write.`);
    }

    await client.mutation(api.replications.updateDeliveredFileSize, {
      apiKey,
      id: original.productionId,
      expectedStorageId: state.newStorageId,
      file_size: item.output.bytes,
    });

    const after = await client.query(api.replications.getResolvedById, { apiKey, id: original.productionId });
    requireCondition(after?.storage_id === state.newStorageId, `${item.id}: main storage replacement did not persist.`);
    requireCondition(after.file_size === item.output.bytes, `${item.id}: delivered file size did not persist.`);
    requireCondition(after.thumbnail_storage_id === original.storageIds.thumbnail, `${item.id}: thumbnail storage changed.`);
    requireCondition(after.preview_storage_id === original.storageIds.preview, `${item.id}: preview storage changed.`);
    requireCondition(typeof after.url === "string" && after.url, `${item.id}: resolved main URL is missing.`);
    const response = await fetch(after.url, { method: "HEAD", cache: "no-store" });
    requireCondition(response.ok, `${item.id}: resolved main URL returned HTTP ${response.status}.`);
    const length = Number(response.headers.get("content-length"));
    if (Number.isFinite(length) && length > 0) {
      requireCondition(length === item.output.bytes, `${item.id}: storage content length mismatch (${length} != ${item.output.bytes}).`);
    }

    state.url = after.url;
    state.status = "verified";
    state.verifiedAt = new Date().toISOString();
    atomicJson(ledgerPath, ledger);
  }

  const verified = Object.values(ledger.items).filter((item) => item.status === "verified").length;
  console.log(`Verified replacements: ${verified}/${manifest.items.length}`);
  console.log(`Rollback ledger: ${ledgerPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
