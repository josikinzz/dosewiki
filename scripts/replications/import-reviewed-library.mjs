#!/usr/bin/env node
/**
 * Import the independently reviewed local replication library.
 *
 * Dry run is the default. A write requires the shared production-write
 * ceremony plus --confirm-reviewed-library. The manifest remains the source of
 * truth; the script re-reads production, refuses live slug collisions, uploads
 * only the compressed delivery files named by the manifest, and records every
 * storage id in an atomic resume ledger before inserting the row.
 */
import { createHash } from "node:crypto";
import { createReadStream, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import https from "node:https";
import path from "node:path";
import { createDataClient } from "../lib/data-client.ts";
import { api } from "../../convex/_generated/api.js";
import {
  assertProductionWriteAllowed,
  createProductionWriteCommand,
  requireProductionWriteCredential,
} from "../lib/production-write-command.mjs";
import { getFlagValue, hasFlag } from "../lib/data-ops-run-context.mjs";

const OPERATION = "import-reviewed-replications";
const EXTRA_CONFIRMATION = "--confirm-reviewed-library";
const DEFAULT_PLAN = "/Users/josie/Documents/Dose Wiki Media Review/Data/production-upload-plan.json";
const DEFAULT_LEDGER = "/Users/josie/Documents/Dose Wiki Media Review/Data/production-upload-ledger.json";
const EXPECTED_TARGET = "https://glad-minnow-656.convex.cloud";
const UPLOAD_ATTEMPTS = 8;

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function atomicJson(filePath, value) {
  const temporary = `${filePath}.${process.pid}.part`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(temporary, filePath);
}

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function contentType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  const types = new Map([
    [".webp", "image/webp"],
    [".gif", "image/gif"],
    [".mp4", "video/mp4"],
  ]);
  const found = types.get(extension);
  if (!found) throw new Error(`Unsupported upload extension: ${filePath}`);
  return found;
}

async function digestFile(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}

async function postFile(uploadUrl, filePath) {
  return await new Promise((resolve, reject) => {
    const request = https.request(
      uploadUrl,
      {
        method: "POST",
        agent: false,
        headers: {
          "Content-Type": contentType(filePath),
          "Content-Length": String(statSync(filePath).size),
        },
      },
      (response) => {
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
      },
    );
    request.on("error", reject);
    const stream = createReadStream(filePath);
    stream.on("error", reject);
    stream.pipe(request);
  });
}

async function uploadFile(client, apiKey, filePath) {
  let lastError;
  for (let attempt = 1; attempt <= UPLOAD_ATTEMPTS; attempt += 1) {
    try {
      const uploadUrl = await client.mutation(api.replications.generateUploadUrl, { apiKey });
      const payload = await postFile(uploadUrl, filePath);
      if (!payload.storageId) throw new Error("Upload returned no storageId.");
      return payload.storageId;
    } catch (error) {
      lastError = error;
      if (String(error?.message).startsWith("Upload failed:") || attempt === UPLOAD_ATTEMPTS) {
        throw error;
      }
      const delay = Math.min(1000 * 2 ** (attempt - 1), 30_000);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

function loadLedger(ledgerPath, planPath) {
  try {
    const ledger = readJson(ledgerPath);
    requireCondition(ledger.planPath === planPath, "Ledger belongs to a different plan path.");
    return ledger;
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    return {
      schemaVersion: 1,
      operation: OPERATION,
      target: EXPECTED_TARGET,
      planPath,
      items: {},
    };
  }
}

function validatePlan(plan) {
  requireCondition(plan.target === EXPECTED_TARGET, `Plan target is not ${EXPECTED_TARGET}.`);
  requireCondition(Array.isArray(plan.entries) && plan.entries.length > 0, "Plan must contain at least one entry.");
  const creates = plan.entries.filter((entry) => entry.action === "create");
  requireCondition(creates.length === plan.counts.create, "Plan create count is inconsistent.");
  const slugs = new Set();
  for (const entry of creates) {
    requireCondition(!slugs.has(entry.slug), `Duplicate create slug: ${entry.slug}`);
    slugs.add(entry.slug);
    requireCondition(entry.review.verdict === "replication", `${entry.id} is not a reviewed replication.`);
    requireCondition(entry.proposedRow.duration <= 600, `${entry.id} exceeds the 10-minute upload limit.`);
    requireCondition(entry.proposedRow.effect_slug, `${entry.id} has no primary effect.`);
    const uniquePaths = new Set(Object.values(entry.upload));
    for (const filePath of uniquePaths) {
      requireCondition(path.isAbsolute(filePath), `Upload path is not absolute: ${filePath}`);
      requireCondition(statSync(filePath).isFile(), `Upload path is not a file: ${filePath}`);
      contentType(filePath);
    }
    requireCondition(statSync(entry.upload.mainPath).size === entry.proposedRow.file_size, `Main file size drifted: ${entry.id}`);
  }
  return creates;
}

async function verifyInserted(client, apiKey, entry, productionId, storageIds) {
  const live = await client.query(api.replications.getResolvedById, { apiKey, id: productionId });
  requireCondition(live, `Inserted row disappeared: ${entry.slug}`);
  for (const field of ["slug", "title", "artist", "role", "type", "format", "effect_slug"]) {
    requireCondition(live[field] === entry.proposedRow[field], `${entry.slug} ${field} mismatch after insert.`);
  }
  requireCondition(live.storage_id === storageIds.main, `${entry.slug} main storage mismatch.`);
  requireCondition(live.thumbnail_storage_id === storageIds.thumbnail, `${entry.slug} thumbnail storage mismatch.`);
  if (storageIds.preview) {
    requireCondition(live.preview_storage_id === storageIds.preview, `${entry.slug} preview storage mismatch.`);
  }
  for (const [label, url] of [["main", live.url], ["thumbnail", live.thumbnail_url], ["preview", live.preview_url]]) {
    if (label === "preview" && !storageIds.preview) continue;
    requireCondition(typeof url === "string" && url, `${entry.slug} has no resolved ${label} URL.`);
    const response = await fetch(url, { method: "HEAD" });
    requireCondition(response.ok, `${entry.slug} ${label} URL returned HTTP ${response.status}.`);
  }
  return live;
}

async function main() {
  const argv = process.argv.slice(2);
  const command = createProductionWriteCommand({ operation: OPERATION, argv });
  const planPath = path.resolve(getFlagValue(argv, "--plan") ?? DEFAULT_PLAN);
  const ledgerPath = path.resolve(getFlagValue(argv, "--ledger") ?? DEFAULT_LEDGER);
  const limitValue = getFlagValue(argv, "--limit");
  const limit = limitValue ? Number.parseInt(limitValue, 10) : Number.POSITIVE_INFINITY;
  const maxMainBytesValue = getFlagValue(argv, "--max-main-bytes");
  const maxMainBytes = maxMainBytesValue
    ? Number.parseInt(maxMainBytesValue, 10)
    : Number.POSITIVE_INFINITY;
  requireCondition(Number.isFinite(limit) ? limit > 0 : limit === Number.POSITIVE_INFINITY, "--limit must be positive.");
  requireCondition(
    Number.isFinite(maxMainBytes) ? maxMainBytes > 0 : maxMainBytes === Number.POSITIVE_INFINITY,
    "--max-main-bytes must be positive.",
  );
  requireCondition(command.targetUrl === EXPECTED_TARGET, `Pass --target-url=${EXPECTED_TARGET}.`);

  const plan = readJson(planPath);
  const creates = validatePlan(plan);
  const ledger = loadLedger(ledgerPath, planPath);
  const client = createDataClient({ target: command.targetUrl }).client;
  const [liveRows, effects] = await Promise.all([
    client.query(api.replications.getAll, {}),
    client.query(api.subjectiveEffects.getPublicPreviews, {}),
  ]);
  const liveBySlug = new Map(liveRows.map((row) => [row.slug, row]));
  const effectSlugs = new Set(effects.map((effect) => effect.slug));
  for (const entry of creates) {
    requireCondition(effectSlugs.has(entry.proposedRow.effect_slug), `Live effect missing: ${entry.proposedRow.effect_slug}`);
    for (const tag of entry.proposedRow.effect_tags) {
      requireCondition(effectSlugs.has(tag), `Live effect tag missing: ${tag}`);
    }
  }

  const isOwnedLiveRow = (entry) => {
    const live = liveBySlug.get(entry.slug);
    const state = ledger.items[entry.id];
    return Boolean(live && state?.storageIds?.main === live.storage_id);
  };
  const newlyColliding = creates.filter(
    (entry) => liveBySlug.has(entry.slug) && !isOwnedLiveRow(entry),
  );
  const allPending = creates.filter(
    (entry) => ledger.items[entry.id]?.status !== "verified",
  );
  const deferredOversized = allPending.filter(
    (entry) => statSync(entry.upload.mainPath).size > maxMainBytes,
  );
  const pending = allPending.filter(
    (entry) => statSync(entry.upload.mainPath).size <= maxMainBytes,
  );
  const uploadBytes = pending.reduce((total, entry) => {
    const unique = new Set(Object.values(entry.upload));
    return total + [...unique].reduce((sum, filePath) => sum + statSync(filePath).size, 0);
  }, 0);

  console.log(`Plan              : ${planPath}`);
  console.log(`Target            : ${command.targetUrl}`);
  console.log(`Reviewed entries  : ${plan.entries.length}`);
  console.log(`Planned creates   : ${creates.length}`);
  console.log(`Live new collisions: ${newlyColliding.length}`);
  console.log(`Pending creates   : ${pending.length}`);
  console.log(`Deferred oversized: ${deferredOversized.length}`);
  console.log(`Pending upload    : ${uploadBytes} bytes`);
  console.log(`Excluded locally  : ${plan.counts.exclude}`);
  console.log(`Existing in plan  : ${plan.counts.existing}`);

  if (command.dryRun) {
    console.log("Dry run complete: no files uploaded and no Convex records modified.");
    return;
  }

  assertProductionWriteAllowed(command);
  requireCondition(hasFlag(argv, EXTRA_CONFIRMATION), `Refusing to write without ${EXTRA_CONFIRMATION}.`);
  requireCondition(newlyColliding.length === 0, `Refusing write: ${newlyColliding.length} create slug(s) now collide with production.`);
  const { token: apiKey } = requireProductionWriteCredential("replicationMaintenance");
  const batch = pending.slice(0, limit);
  console.log(`Writing ${batch.length} pending row(s).`);

  for (const [index, entry] of batch.entries()) {
    const state = ledger.items[entry.id] ?? { id: entry.id, slug: entry.slug, status: "pending" };
    ledger.items[entry.id] = state;
    console.log(`[${index + 1}/${batch.length}] ${entry.slug}`);

    if (!state.storageIds?.main) {
      state.storageIds = state.storageIds ?? {};
      state.hashes = state.hashes ?? {};
      state.storageIds.main = await uploadFile(client, apiKey, entry.upload.mainPath);
      state.hashes.main = await digestFile(entry.upload.mainPath);
      state.status = "main-uploaded";
      atomicJson(ledgerPath, ledger);
    }
    if (!state.storageIds.thumbnail) {
      if (entry.upload.thumbnailPath === entry.upload.mainPath) {
        state.storageIds.thumbnail = state.storageIds.main;
        state.hashes.thumbnail = state.hashes.main;
      } else {
        state.storageIds.thumbnail = await uploadFile(client, apiKey, entry.upload.thumbnailPath);
        state.hashes.thumbnail = await digestFile(entry.upload.thumbnailPath);
      }
      state.status = "thumbnail-uploaded";
      atomicJson(ledgerPath, ledger);
    }
    if (entry.upload.previewPath && !state.storageIds.preview) {
      state.storageIds.preview = await uploadFile(client, apiKey, entry.upload.previewPath);
      state.hashes.preview = await digestFile(entry.upload.previewPath);
      state.status = "preview-uploaded";
      atomicJson(ledgerPath, ledger);
    }

    const latestRows = await client.query(api.replications.getAll, {});
    const existing = latestRows.find((row) => row.slug === entry.slug);
    if (existing) {
      requireCondition(existing.storage_id === state.storageIds.main, `Unrelated row took slug ${entry.slug}.`);
      state.productionId = existing._id;
    } else {
      const result = await client.mutation(api.replications.insertMediaAsset, {
        apiKey,
        expected_absent: true,
        ...entry.proposedRow,
        rights_status: entry.proposedRow.rights_status ?? "unknown",
        storage_id: state.storageIds.main,
        thumbnail_storage_id: state.storageIds.thumbnail,
      });
      state.productionId = result.id;
      state.status = "inserted";
      atomicJson(ledgerPath, ledger);
    }

    if (state.storageIds.preview) {
      const resolved = await client.query(api.replications.getResolvedById, { apiKey, id: state.productionId });
      if (!resolved.preview_storage_id) {
        await client.mutation(api.replications.updatePreviewStorageIds, {
          apiKey,
          updates: [{
            id: state.productionId,
            previewStorageId: state.storageIds.preview,
            expectedStorageId: state.storageIds.main,
          }],
        });
      } else {
        requireCondition(resolved.preview_storage_id === state.storageIds.preview, `${entry.slug} preview was changed externally.`);
      }
    }

    await verifyInserted(client, apiKey, entry, state.productionId, state.storageIds);
    state.status = "verified";
    state.verifiedAt = new Date().toISOString();
    atomicJson(ledgerPath, ledger);
  }

  const verified = Object.values(ledger.items).filter((row) => row.status === "verified").length;
  console.log(`Verified ledger rows: ${verified}/${creates.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
