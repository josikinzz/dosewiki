#!/usr/bin/env node

/** Pinned, resumable rollout for the 2026-08-31 Reddit attribution repair. */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, chmodSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { requireCampaignTarget, bindCampaignTarget } from "./lib/postgres-target.mjs";
import { createDataClient } from "../lib/data-client.ts";
import { api } from "../../lib/postgres/runtime/api.ts"
import {
  assertProductionWriteAllowed,
  createProductionWriteCommand,
} from "../lib/production-write-command.mjs";

export const OPERATION = "replication-index-attribution-repair-2026-08-31";
export const EXACT_TARGET = "https://glad-minnow-656.convex.cloud";
export const EXACT_DEPLOYMENT = "prod:glad-minnow-656";
export const PLAN_FILE_SHA256 = "f469b63197c99cc0c89c3b6a16b69852376770541253c76c7a99987598b5179e";
export const DECLARED_PLAN_SHA256 = "98a5662143a6e1ea809a54130d170c378282068db18043a9f41b904e1a67524e";
export const DEDUPE_PLAN_FILE_SHA256 = "ad6c961c9532390cb28e072a866f99234d392e4aa50f4ecc9743138a8b608396";
export const DEDUPE_CONTENT_SHA256 = "ca6ea19c7f09d961cccbf5df72ab69892cf53c354eedc1b72339182419f9202e";
export const DEFAULT_PLAN = "/Users/josie/Documents/Dose Wiki Media Review/Data/Replication Index Campaign 2026-08-30/attribution-repair-plan-2026-08-31.json";
export const MAX_BATCH_SIZE = 50;
/** Digest pins the plan must match; production runs always use the campaign pins. */
export const PINNED_PLAN = Object.freeze({ fileSha256: PLAN_FILE_SHA256, planSha256: DECLARED_PLAN_SHA256 });
const SHA = /^[0-9a-f]{64}$/;
const required = (ok, message) => { if (!ok) throw new Error(message); };
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const nullable = (value) => value ?? null;

function value(argv, name, fallback = null) {
  const exact = argv.find((arg) => arg.startsWith(`${name}=`));
  if (exact) return exact.slice(name.length + 1);
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] ?? fallback : fallback;
}

function atomicJson(filename, data) {
  mkdirSync(path.dirname(filename), { recursive: true });
  const temporary = `${filename}.${process.pid}.part`;
  writeFileSync(temporary, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
  chmodSync(temporary, 0o600);
  renameSync(temporary, filename);
  chmodSync(filename, 0o600);
}

function expectedCurrent(update) {
  return {
    ...update.expected,
    artist: update.intended_credit.artist,
    artist_url: update.intended_credit.artist_url,
    credit_line: update.intended_credit.credit_line,
    rightsholder: update.intended_credit.rightsholder,
  };
}

export function rollbackFor(update, operationId) {
  return {
    expected_current: expectedCurrent(update),
    rollback_credit: {
      artist: update.rollback.artist,
      artist_url: update.rollback.artist_url,
      credit_line: update.rollback.credit_line,
      rightsholder: update.rollback.rightsholder,
    },
    source_digest: update.attribution.source_digest,
    expected_attribution_operation_id: operationId,
  };
}

function validateUpdate(update) {
  required(update?.expected?.id && update.expected.slug, "Every attribution update requires an ID and slug.");
  required(SHA.test(update.expected.source_sha256 ?? ""), `${update.expected.slug}: invalid source SHA.`);
  required(update.expected.source_catalog_id === `reddit-sha256:${update.expected.source_sha256}`, `${update.expected.slug}: non-Reddit or drifted source identity.`);
  required(update.attribution?.source_digest && SHA.test(update.attribution.source_digest), `${update.expected.slug}: invalid evidence digest.`);
  required(update.attribution.review_required === false, `${update.expected.slug}: review-required row is not eligible.`);
  required(update.intended_credit?.artist === update.attribution.proposed_artist, `${update.expected.slug}: intended artist/evidence mismatch.`);
  required(update.rollback?.attribution_record_expected_absent === true, `${update.expected.slug}: rollback must expect a newly created cold record.`);
  for (const field of ["artist", "artist_url", "credit_line", "rightsholder"]) {
    required(nullable(update.rollback[field]) === nullable(update.expected[field]), `${update.expected.slug}: rollback ${field} is not exact.`);
  }
}

export function validatePinnedPlan(plan, fileBytes, pins = PINNED_PLAN) {
  required(digest(fileBytes) === pins.fileSha256, "Pinned attribution plan file SHA-256 drifted.");
  required(plan?.schemaVersion === 1 && plan.artifactType === "replication-index-attribution-repair-plan", "Unsupported attribution repair plan.");
  required(plan.planSha256 === pins.planSha256, "Pinned attribution planSha256 drifted.");
  required(plan.target?.deployment === EXACT_DEPLOYMENT && plan.target?.writesPerformed === 0, "Plan must be the zero-write glad-minnow-656 plan.");
  required(plan.counts?.eligibleCreditUpdates === 5097 && plan.updates?.length === 5097, "Eligible update count drifted.");
  required(plan.counts?.productionRowsPinned === 7013 && plan.counts?.redditRowsPinned === 5895, "Pinned production population drifted.");
  required(plan.counts?.productionWrites === 0, "Input plan must record zero production writes.");
  required(plan.noWriteExceptions?.length === 798, "No-write exception coverage drifted.");
  const ids = new Set(); const slugs = new Set(); const sourceShas = new Set();
  for (const update of plan.updates) {
    validateUpdate(update);
    required(!ids.has(update.expected.id), `Duplicate eligible ID: ${update.expected.id}`);
    required(!slugs.has(update.expected.slug), `Duplicate eligible slug: ${update.expected.slug}`);
    required(!sourceShas.has(update.expected.source_sha256), `Duplicate eligible source SHA: ${update.expected.source_sha256}`);
    ids.add(update.expected.id); slugs.add(update.expected.slug); sourceShas.add(update.expected.source_sha256);
  }
  const held = new Set();
  for (const item of plan.noWriteExceptions) {
    required(item.id && item.slug && SHA.test(item.sourceSha256 ?? "") && item.reason, "Invalid no-write exception.");
    required(!held.has(item.id) && !ids.has(item.id), `Eligibility/no-write overlap: ${item.id}`);
    held.add(item.id);
  }
  required(plan.updates.length + plan.noWriteExceptions.length === 5895, "Eligible/no-write rows do not reconcile to all Reddit rows.");
  return plan;
}

export function deriveBatches(plan) {
  const updates = [...plan.updates].sort((a, b) => a.expected.id.localeCompare(b.expected.id));
  const batches = [];
  for (let offset = 0; offset < updates.length; offset += MAX_BATCH_SIZE) {
    const index = batches.length + 1;
    const operationId = `${OPERATION}-batch-${String(index).padStart(3, "0")}`;
    const rows = updates.slice(offset, offset + MAX_BATCH_SIZE);
    batches.push({ index, operationId, phase: index === 1 ? "canary" : "remaining", updates: rows, rollbackUpdates: rows.map((row) => rollbackFor(row, operationId)) });
  }
  required(batches.length === 102 && batches.every((batch) => batch.updates.length >= 1 && batch.updates.length <= 50), "Deterministic batch derivation drifted.");
  return batches;
}

export function validateDedupeCompletion(evidence) {
  required(evidence && typeof evidence === "object", "Duplicate-suppression completion evidence is required before attribution writes.");
  required(evidence.target === EXACT_TARGET || evidence.target?.url === EXACT_TARGET, "Dedupe evidence target drifted.");
  required(evidence.deployment === EXACT_DEPLOYMENT || evidence.deployment === "glad-minnow-656" || evidence.target?.deployment === EXACT_DEPLOYMENT, "Dedupe evidence deployment drifted.");
  required(evidence.planFileSha256 === DEDUPE_PLAN_FILE_SHA256 || evidence.plan?.fileSha256 === DEDUPE_PLAN_FILE_SHA256, "Dedupe plan file digest drifted.");
  required(evidence.contentSha256 === DEDUPE_CONTENT_SHA256 || evidence.planContentSha256 === DEDUPE_CONTENT_SHA256 || evidence.plan?.contentSha256 === DEDUPE_CONTENT_SHA256, "Dedupe plan content digest drifted.");
  const states = Object.values(evidence.items ?? {});
  const suppressionBatches = Object.entries(evidence.batches ?? {})
    .filter(([key]) => key.startsWith("suppression:"));
  const rollbackBatches = Object.entries(evidence.batches ?? {})
    .filter(([key]) => key.startsWith("rollback:"));
  const completeBatchLedger = suppressionBatches.length === 18
    && suppressionBatches.every(([, state]) => state.status === "verified")
    && rollbackBatches.length === 18
    && rollbackBatches.every(([, state]) => state.status === "pending")
    && evidence.verifiedSuppressionBatches === 18
    && evidence.verifiedSuppressedRows === 331;
  required(
    (evidence.status === "complete" && (completeBatchLedger || Object.keys(evidence.batches ?? {}).length === 0))
      || (states.length === 331 && states.every((item) => ["verified", "suppressed"].includes(item.status))),
    "Dedupe suppression is not completely verified.",
  );
  return true;
}

function newLedger(planPath, batches, pins) {
  return {
    schemaVersion: 1,
    artifactType: "replication-index-attribution-repair-ledger",
    operation: OPERATION,
    target: EXACT_TARGET,
    deployment: EXACT_DEPLOYMENT,
    plan: { path: planPath, fileSha256: pins.fileSha256, planSha256: pins.planSha256 },
    policy: { batchCap: 50, canaryFirst: true, retryUncertain: false, deletesAllowed: false },
    batches: Object.fromEntries(batches.map((batch) => [batch.operationId, { phase: batch.phase, status: "pending", attempts: 0, error: null }])),
  };
}

function loadLedger(filename, planPath, batches, pins) {
  const ledger = existsSync(filename) ? JSON.parse(readFileSync(filename, "utf8")) : newLedger(planPath, batches, pins);
  required(ledger.artifactType === "replication-index-attribution-repair-ledger" && ledger.target === EXACT_TARGET && ledger.deployment === EXACT_DEPLOYMENT, "Attribution ledger identity drifted.");
  required(ledger.plan?.path === planPath && ledger.plan.fileSha256 === pins.fileSha256 && ledger.plan.planSha256 === pins.planSha256, "Attribution ledger plan lineage drifted.");
  required(same(Object.keys(ledger.batches).sort(), batches.map((b) => b.operationId).sort()), "Attribution ledger batch coverage drifted.");
  for (const state of Object.values(ledger.batches)) required(!["dispatching", "verifying", "uncertain"].includes(state.status), "Ledger has an uncertain batch; manual reconciliation is required.");
  return ledger;
}

function hotCredit(row) {
  return { artist: row?.artist, artist_url: nullable(row?.artist_url), credit_line: nullable(row?.credit_line), rightsholder: nullable(row?.rightsholder) };
}
function assertHot(row, expected, label) {
  required(row && row._id === expected.id && row.slug === expected.slug && row.source_sha256 === expected.source_sha256 && nullable(row.source_catalog_id) === expected.source_catalog_id, `${label}: hot identity read-back drifted.`);
  required(same(hotCredit(row), { artist: expected.artist, artist_url: nullable(expected.artist_url), credit_line: nullable(expected.credit_line), rightsholder: nullable(expected.rightsholder) }), `${label}: hot credit read-back drifted.`);
}
function assertCold(cold, update, operationId) {
  required(cold && cold.replication_id === update.expected.id && cold.source_catalog_id === update.expected.source_catalog_id && cold.source_sha256 === update.expected.source_sha256, `${update.expected.slug}: cold identity read-back drifted.`);
  required(cold.source_digest === update.attribution.source_digest && cold.operation_id === operationId, `${update.expected.slug}: cold evidence read-back drifted.`);
}

function readbackById(rows, batch, mode) {
  required(Array.isArray(rows) && rows.length === batch.updates.length, `${batch.operationId}: batch read-back row count drifted.`);
  const byId = new Map(rows.map((row) => [row.id, row]));
  required(byId.size === batch.updates.length, `${batch.operationId}: batch read-back IDs are missing or repeated.`);
  for (const update of batch.updates) {
    const row = byId.get(update.expected.id);
    required(row, `${update.expected.slug}: batch read-back row is missing.`);
    const hot = { ...row, _id: row.id };
    if (mode === "before") {
      assertHot(hot, update.expected, update.expected.slug);
      required(row.attribution === null, `${update.expected.slug}: attribution already exists before apply.`);
    } else if (mode === "after") {
      assertHot(hot, expectedCurrent(update), update.expected.slug);
      assertCold(row.attribution, update, batch.operationId);
    } else {
      assertHot(hot, update.expected, update.expected.slug);
      required(row.attribution === null, `${update.expected.slug}: cold attribution survived rollback.`);
    }
  }
}

export async function runAttributionRollout({ argv = process.argv.slice(2), env = process.env, clientFactory = (url, options) => createDataClient({ target: url, ...options }).client, logger = console, pins = PINNED_PLAN } = {}) {
  const planPath = path.resolve(value(argv, "--plan", DEFAULT_PLAN));
  const ledgerPath = path.resolve(value(argv, "--ledger", `${planPath}.rollout-ledger.json`));
  const bytes = readFileSync(planPath);
  const plan = validatePinnedPlan(JSON.parse(bytes), bytes, pins);
  const batches = deriveBatches(plan);
  const phase = value(argv, "--phase", "canary");
  required(["canary", "remaining", "rollback"].includes(phase), "--phase must be canary, remaining, or rollback.");
  const liveDryRun = argv.includes("--live-dry-run");
  const write = argv.includes("--write");
  required(!(liveDryRun && write), "Choose either --live-dry-run or --write.");
  if (write) {
    const boundaryArgv = [
      ...argv,
      `--target=${value(argv, "--target", "")}`,
      `--expected-deployment=${value(argv, "--expected-deployment", "")}`,
      `--confirm-write=${value(argv, "--confirm-write", "")}`,
    ];
    assertProductionWriteAllowed(createProductionWriteCommand({ operation: OPERATION, argv: boundaryArgv, env, loadsEnvLocal: false }));
  }
  const selected = phase === "canary" ? batches.slice(0, 1) : phase === "remaining" ? batches.slice(1) : [...batches].reverse();
  if (!liveDryRun && !write) {
    logger.log(JSON.stringify({ mode: "local-dry-run", phase, batches: selected.length, updates: selected.reduce((n, b) => n + b.updates.length, 0), networkCalls: 0 }));
    return { mode: "local-dry-run", networkCalls: 0, batches: selected.length };
  }
  const command = createProductionWriteCommand({ operation: OPERATION, argv: [...argv, `--expected-deployment=${value(argv, "--expected-deployment", "")}`], env, loadsEnvLocal: false });
  const postgresTarget = requireCampaignTarget(command);
  required(value(argv, "--expected-plan-file-sha256") === pins.fileSha256 && value(argv, "--expected-plan-sha256") === pins.planSha256, "Exact attribution plan confirmation is required.");
  const apiKey = env.DATA_ADMIN_TOKEN_REPLICATION_MAINTENANCE;
  required(typeof apiKey === "string" && apiKey.length > 0, "DATA_ADMIN_TOKEN_REPLICATION_MAINTENANCE is required.");
  if (liveDryRun) {
    const client = clientFactory(command.targetUrl, { env, argv });
    for (const batch of selected) await client.mutation(api.replicationAttribution.applyBatch, { apiKey, operation_id: batch.operationId, dry_run: true, updates: batch.updates.map(({ rollback: _rollback, ...row }) => row) });
    return { mode: "live-dry-run", networkCalls: selected.length, batches: selected.length };
  }
  required(value(argv, "--confirm-write") === OPERATION, `--confirm-write=${OPERATION} is required.`);
  const evidencePath = value(argv, "--dedupe-completion-evidence");
  required(evidencePath, "--dedupe-completion-evidence is required before attribution writes.");
  validateDedupeCompletion(JSON.parse(readFileSync(evidencePath, "utf8")));
  const ledger = loadLedger(ledgerPath, planPath, batches, pins);
  bindCampaignTarget(ledger, postgresTarget);
  if (phase === "remaining") required(ledger.batches[batches[0].operationId].status === "verified", "Remaining attribution writes are blocked until the canary is verified.");
  if (phase === "rollback") required(Object.values(ledger.batches).some((state) => state.status === "verified"), "Nothing verified is available to roll back.");
  const client = clientFactory(command.targetUrl, { env, argv });
  for (const batch of selected) {
    const state = ledger.batches[batch.operationId];
    if (phase === "rollback" ? state.status === "rolled-back" : state.status === "verified") continue;
    required(phase === "rollback" ? state.status === "verified" : state.status === "pending", `${batch.operationId} is ${state.status}; automatic retry is forbidden.`);
    state.status = "dispatching"; state.attempts += 1; state.error = null; atomicJson(ledgerPath, ledger);
    try {
      if (phase !== "rollback") {
        const before = await client.query(api.replicationAttribution.getRepairReadback, {
          apiKey,
          replication_ids: batch.updates.map((update) => update.expected.id),
        });
        readbackById(before, batch, "before");
      }
      const mutation = phase === "rollback" ? api.replicationAttribution.rollbackBatch : api.replicationAttribution.applyBatch;
      const updates = phase === "rollback" ? batch.rollbackUpdates : batch.updates.map(({ rollback: _rollback, ...row }) => row);
      await client.mutation(mutation, { apiKey, operation_id: `${batch.operationId}${phase === "rollback" ? "-rollback" : ""}`, dry_run: false, updates });
      state.status = "verifying"; atomicJson(ledgerPath, ledger);
      const after = await client.query(api.replicationAttribution.getRepairReadback, {
        apiKey,
        replication_ids: batch.updates.map((update) => update.expected.id),
      });
      readbackById(after, batch, phase === "rollback" ? "rollback" : "after");
      state.status = phase === "rollback" ? "rolled-back" : "verified"; state.error = null; atomicJson(ledgerPath, ledger);
    } catch (error) {
      state.status = "uncertain"; state.error = { message: error instanceof Error ? error.message : String(error) }; atomicJson(ledgerPath, ledger);
      throw new Error(`${batch.operationId} has an uncertain production outcome; reconcile manually. ${state.error.message}`);
    }
  }
  return { mode: phase === "rollback" ? "rollback" : "write", phase, batches: selected.length };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) runAttributionRollout().catch((error) => { console.error(error.message); process.exitCode = 1; });
