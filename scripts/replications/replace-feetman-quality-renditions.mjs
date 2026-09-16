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


function loadLedger(file, manifestPath) {
  if (existsSync(file)) {
    const ledger = readJson(file);
    requireCondition(ledger.manifestPath === manifestPath, "Replacement ledger belongs to another manifest.");
    requireCondition(ledger.target === EXPECTED_TARGET, "Replacement ledger belongs to another target.");
    requireCondition(ledger.schemaVersion === 2 || Object.keys(ledger.items ?? {}).length === 0, "Legacy replacement ledger has activity; reconcile it and use a new native R2 ledger.");
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
  const originalLedgerPath = path.resolve(getFlagValue(argv, "--original-ledger") ?? DEFAULT_ORIGINAL_LEDGER);
  const ledgerPath = path.resolve(getFlagValue(argv, "--ledger") ?? DEFAULT_LEDGER);
  const limitValue = getFlagValue(argv, "--limit");
  const limit = limitValue ? Number.parseInt(limitValue, 10) : Number.POSITIVE_INFINITY;
  const postgresTarget = requireCampaignTarget(command);
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
    requireCondition(originalLedger.items[item.id]?.r2Keys?.main || originalLedger.items[item.id]?.storageIds?.main, `${item.id}: original production media identity is missing.`);
  }

  const client = createDataClient({ target: command.targetUrl }).client;
  const liveRows = await client.query(api.replications.getAll, {});
  const liveById = new Map(liveRows.map((row) => [row._id, row]));
  const ledger = loadLedger(ledgerPath, manifestPath);
  bindCampaignTarget(ledger, postgresTarget);
  const actions = manifest.items.map((item) => {
    const original = originalLedger.items[item.id];
    const live = liveById.get(original.productionId);
    requireCondition(live, `${item.id}: production row disappeared.`);
    requireCondition(live.slug === item.slug, `${item.id}: production slug drifted.`);
    requireCondition(live.artist === EXPECTED_ARTIST, `${item.id}: production artist drifted.`);
    const state = ledger.items[item.id];
    const previousStorageId = original.storageIds?.main ?? null;
    const previousR2Key = original.r2Keys?.main ?? null;
    requireCondition((live.storage_id ?? null) === previousStorageId &&
      ((live.r2_key ?? null) === previousR2Key || (state?.r2Key && live.r2_key === state.r2Key)),
      `${item.id}: production media changed outside this replacement.`);
    if (state) {
      requireCondition(state.productionId === live._id, `${item.id}: replacement ledger row identity drifted.`);
      if (state.status === "verified" || state.status === "repointed") {
        requireCondition(live.r2_key === state.r2Key && live.file_size === item.output.bytes,
          `${item.id}: applied replacement no longer matches its ledger.`);
        for (const [field, key] of Object.entries(state.r2Keys ?? {})) {
          requireCondition(live[field] === key, `${item.id}: applied ${field} changed outside this run.`);
        }
      }
      requireCondition(state.previousStorageId === previousStorageId && state.previousR2Key === previousR2Key,
        `${item.id}: replacement ledger source identity differs from reviewed original.`);
      requireCondition(state.outputPath === item.outputPath && state.outputBytes === item.output.bytes &&
        state.sha256 === item.output.sha256, `${item.id}: replacement ledger output differs from reviewed manifest.`);
    }
    return { item, original, live, state, previousStorageId, previousR2Key };
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
    console.log("Dry run complete: no files uploaded and no Postgres rows modified.");
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
      previousStorageId: action.previousStorageId,
      previousR2Key: action.previousR2Key,
      outputPath: item.outputPath,
      outputBytes: item.output.bytes,
      previousFileSize: action.live.file_size ?? null,
      status: "pending",
    };
    ledger.items[item.id] = state;
    console.log(`[${index + 1}/${batch.length}] ${item.slug}`);

    const currentBeforeUpload = await client.query(api.replications.getResolvedById, { apiKey, id: original.productionId });
    requireCondition(currentBeforeUpload, `${item.id}: row disappeared before upload.`);
    requireCondition(
      (currentBeforeUpload.storage_id ?? null) === state.previousStorageId &&
        ((currentBeforeUpload.r2_key ?? null) === state.previousR2Key || (state.r2Key && currentBeforeUpload.r2_key === state.r2Key)),
      `${item.id}: media identity changed before upload/repoint.`,
    );

    if (!state.r2Key) {
      state.sha256 = await digest(item.outputPath);
      requireCondition(state.sha256 === item.output.sha256, `${item.id}: output hash drifted.`);
      state.r2Key = await uploadReplicationFile(client, apiKey, item.outputPath, "video/mp4");
      state.status = "uploaded";
      atomicJson(ledgerPath, ledger);
    }

    const currentBeforeWrite = await client.query(api.replications.getResolvedById, { apiKey, id: original.productionId });
    requireCondition(currentBeforeWrite, `${item.id}: row disappeared before write.`);
    requireCondition((currentBeforeWrite.storage_id ?? null) === state.previousStorageId, `${item.id}: historical source identity changed.`);
    if ((currentBeforeWrite.r2_key ?? null) === state.previousR2Key) {
      const keys = { r2_key: state.r2Key };
      for (const field of ["thumbnail", "preview", "motion", "motion_poster"]) {
        if (currentBeforeWrite[`${field}_r2_key`]) {
          keys[`${field}_r2_key`] = currentBeforeWrite[`${field}_r2_key`];
        } else if (currentBeforeWrite[`${field}_url`]) {
          const response = await fetch(currentBeforeWrite[`${field}_url`]);
          requireCondition(response.ok, `${item.id}: ${field} download returned HTTP ${response.status}.`);
          const contentType = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
          const extension = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/avif": "avif", "video/mp4": "mp4", "video/webm": "webm" }[contentType];
          requireCondition(extension, `${item.id}: ${field} has unsupported content type ${contentType}.`);
          keys[`${field}_r2_key`] = await uploadReplicationBytes(client, apiKey, new Uint8Array(await response.arrayBuffer()), contentType, extension);
        }
      }
      state.r2Keys = keys;
      atomicJson(ledgerPath, ledger);
      await updateReplicationMedia(client, apiKey, currentBeforeWrite, keys, item.output.bytes);
      state.status = "repointed";
      atomicJson(ledgerPath, ledger);
    } else {
      requireCondition(currentBeforeWrite.r2_key === state.r2Key, `${item.id}: unexpected media identity before write.`);
    }


    const after = await client.query(api.replications.getResolvedById, { apiKey, id: original.productionId });
    requireCondition(after?.r2_key === state.r2Key && (after.storage_id ?? null) === state.previousStorageId, `${item.id}: main replacement did not persist.`);
    requireCondition(after.file_size === item.output.bytes, `${item.id}: delivered file size did not persist.`);
    for (const [field, key] of Object.entries(state.r2Keys ?? {})) {
      requireCondition(after[field] === key, `${item.id}: ${field} did not persist.`);
    }
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
