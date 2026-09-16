#!/usr/bin/env node
/**
 * Import the independently reviewed local replication library.
 *
 * Dry run is the default. A write requires the shared production-write
 * ceremony plus --confirm-reviewed-library. The manifest remains the source of
 * truth; the script re-reads production, refuses live slug collisions, uploads
 * only the compressed delivery files named by the manifest, and records every
 * R2 key in an atomic resume ledger before inserting the row.
 */
import { createHash } from "node:crypto";
import { createReadStream, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { requireCampaignTarget, bindCampaignTarget } from "./lib/postgres-target.mjs";
import { createDataClient } from "../lib/data-client.ts";
import { api } from "../../lib/postgres/runtime/api.ts"
import { uploadReplicationFile, replicationImportReceipts } from "./lib/r2-upload.mjs";
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


function loadLedger(ledgerPath, planPath) {
  try {
    const ledger = readJson(ledgerPath);
    requireCondition(ledger.planPath === planPath, "Ledger belongs to a different plan path.");
    requireCondition(!Object.values(ledger.items ?? {}).some((item) => Object.values(item.storageIds ?? {}).some(Boolean)), "Legacy upload ledger requires explicit reconciliation before native R2 import.");
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
    requireCondition(!Object.keys(entry.proposedRow ?? {}).some((field) => field === "storage_id" || field.endsWith("_storage_id") || field === "r2_key" || field.endsWith("_r2_key")), `${entry.id}: proposed metadata must not contain preexisting media identities.`);
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

async function verifyInserted(client, apiKey, entry, productionId, r2Keys) {
  const live = await client.query(api.replications.getResolvedById, { apiKey, id: productionId });
  requireCondition(live, `Inserted row disappeared: ${entry.slug}`);
  for (const field of ["slug", "title", "artist", "role", "type", "format", "effect_slug"]) {
    requireCondition(live[field] === entry.proposedRow[field], `${entry.slug} ${field} mismatch after insert.`);
  }
  requireCondition(live.r2_key === r2Keys.main, `${entry.slug} main R2 mismatch.`);
  requireCondition(live.thumbnail_r2_key === r2Keys.thumbnail, `${entry.slug} thumbnail R2 mismatch.`);
  requireCondition(live.file_size === statSync(entry.upload.mainPath).size, `${entry.slug} file size mismatch.`);
  if (r2Keys.preview) {
    requireCondition(live.preview_r2_key === r2Keys.preview, `${entry.slug} preview R2 mismatch.`);
  }
  for (const [label, url] of [["main", live.url], ["thumbnail", live.thumbnail_url], ["preview", live.preview_url]]) {
    if (label === "preview" && !r2Keys.preview) continue;
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
  const postgresTarget = requireCampaignTarget(command);

  const plan = readJson(planPath);
  requireCondition(!plan.postgresTarget || plan.postgresTarget === postgresTarget, "Plan Postgres target differs from the explicit target.");
  const creates = validatePlan(plan);
  const ledger = loadLedger(ledgerPath, planPath);
  bindCampaignTarget(ledger, postgresTarget);
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
    return Boolean(live && state?.r2Keys?.main && state.r2Keys.main === live.r2_key);
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
  console.log(`Target            : ${command.deploymentFingerprint}`);
  console.log(`Reviewed entries  : ${plan.entries.length}`);
  console.log(`Planned creates   : ${creates.length}`);
  console.log(`Live new collisions: ${newlyColliding.length}`);
  console.log(`Pending creates   : ${pending.length}`);
  console.log(`Deferred oversized: ${deferredOversized.length}`);
  console.log(`Pending upload    : ${uploadBytes} bytes`);
  console.log(`Excluded locally  : ${plan.counts.exclude}`);
  console.log(`Existing in plan  : ${plan.counts.existing}`);

  if (command.dryRun) {
    console.log("Dry run complete: no files uploaded and no Postgres records modified.");
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

    state.r2Keys = state.r2Keys ?? {};
    state.hashes = state.hashes ?? {};
    for (const [role, filePath] of Object.entries({
      main: entry.upload.mainPath,
      thumbnail: entry.upload.thumbnailPath,
      ...(entry.upload.previewPath ? { preview: entry.upload.previewPath } : {}),
    })) {
      const hash = await digestFile(filePath);
      if (state.r2Keys[role]) {
        requireCondition(state.hashes[role] === hash, `${entry.slug} ${role} resume digest drifted.`);
        requireCondition(state.r2Keys[role].startsWith(`media/sha256/${hash.slice(0, 2)}/${hash}.`), `${entry.slug} ${role} resume R2 digest mismatch.`);
        continue;
      }
      state.r2Keys[role] = await uploadReplicationFile(client, apiKey, filePath, contentType(filePath));
      requireCondition(state.r2Keys[role].startsWith(`media/sha256/${hash.slice(0, 2)}/${hash}.`), `${entry.slug} ${role} upload digest drifted.`);
      state.hashes[role] = hash;
      state.status = `${role}-uploaded`;
      atomicJson(ledgerPath, ledger);
    }
    const keys = {
      r2_key: state.r2Keys.main,
      thumbnail_r2_key: state.r2Keys.thumbnail,
      ...(state.r2Keys.preview ? { preview_r2_key: state.r2Keys.preview } : {}),
    };

    const latestRows = await client.query(api.replications.getAll, {});
    const existing = latestRows.find((row) => row.slug === entry.slug);
    if (existing) {
      requireCondition(existing.r2_key === state.r2Keys.main, `Unrelated row took slug ${entry.slug}.`);
      state.productionId = existing._id;
    } else {
      const result = await client.mutation(api.replications.insertMediaAsset, {
        apiKey,
        expected_absent: true,
        ...entry.proposedRow,
        rights_status: entry.proposedRow.rights_status ?? "unknown",
        ...keys,
        file_size: statSync(entry.upload.mainPath).size,
        ...(await replicationImportReceipts(client, apiKey, entry.slug, keys)),
      });
      state.productionId = result.id;
      state.status = "inserted";
      atomicJson(ledgerPath, ledger);
    }


    await verifyInserted(client, apiKey, entry, state.productionId, state.r2Keys);
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
