#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDataClient } from "../lib/data-client.ts";
import { api } from "../../convex/_generated/api.js";
import {
  assertProductionWriteAllowed,
  createProductionWriteCommand,
  printProductionWriteCommand,
  requireProductionWriteCredential,
} from "../lib/production-write-command.mjs";

const OPERATION = "apply-pinned-duplicate-suppression";
const EXACT_TARGET = "https://glad-minnow-656.convex.cloud";
const EXACT_DEPLOYMENT = "glad-minnow-656";
const DEFAULT_PLAN_PATH = "/Users/josie/Documents/Dose Wiki Media Review/Data/Replication Index Campaign 2026-08-30/expanded-duplicate-suppression-plan-2026-08-31.json";
const PLAN_FILE_SHA256 = "ad6c961c9532390cb28e072a866f99234d392e4aa50f4ecc9743138a8b608396";
const PLAN_CONTENT_SHA256 = "ca6ea19c7f09d961cccbf5df72ab69892cf53c354eedc1b72339182419f9202e";
const EXPECTED_COUNTS = Object.freeze({
  confirmedDuplicatePairs: 367,
  duplicateComponents: 311,
  componentRows: 642,
  suppressedRows: 331,
  suppressionBatches: 18,
  rollbackBatches: 18,
  maximumBatchSize: 20,
  currentPublicWorks: 6986,
  projectedPublicWorks: 6655,
});

function required(condition, message) {
  if (!condition) throw new Error(message);
}

function flagValue(argv, name) {
  const direct = argv.find((entry) => entry.startsWith(`${name}=`));
  if (direct) return direct.slice(name.length + 1);
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] ?? null : null;
}

function hasFlag(argv, name) {
  return argv.includes(name);
}

function normalizeCommandArgv(argv) {
  const values = new Set(["--target-url", "--confirm-write", "--expected-deployment"]);
  const normalized = [];
  for (let index = 0; index < argv.length; index += 1) {
    const entry = argv[index];
    if (values.has(entry) && argv[index + 1] && !argv[index + 1].startsWith("--")) {
      normalized.push(`${entry}=${argv[index + 1]}`);
      index += 1;
    } else normalized.push(entry);
  }
  return normalized;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, canonical(nested)]));
  }
  return value;
}

export function digestValue(value) {
  const bytes = Buffer.isBuffer(value) || typeof value === "string"
    ? value
    : JSON.stringify(canonical(value));
  return createHash("sha256").update(bytes).digest("hex");
}

function sameJson(left, right) {
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
}

function atomicWriteJson(filePath, value) {
  const temporary = `${filePath}.tmp-${process.pid}`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  chmodSync(temporary, 0o600);
  renameSync(temporary, filePath);
  chmodSync(filePath, 0o600);
}

function validateExpectedRow(row, label) {
  for (const field of ["id", "slug", "artist"]) {
    required(typeof row?.[field] === "string" && row[field], `${label}.${field} must be a nonempty string.`);
  }
  for (const field of ["source_catalog_id", "source_sha256", "publication_state", "duplicate_of_replication_id"]) {
    required(row[field] === null || typeof row[field] === "string", `${label}.${field} must be string or null.`);
  }
}

function validateSuppressionUpdate(update, label) {
  validateExpectedRow(update?.expected_keeper, `${label}.expected_keeper`);
  validateExpectedRow(update?.expected_suppressed, `${label}.expected_suppressed`);
  required(update.expected_keeper.id !== update.expected_suppressed.id, `${label}: keeper equals suppressed row.`);
  const reconciliation = update.reconciliation;
  required(typeof reconciliation?.component_id === "string" && reconciliation.component_id, `${label}: missing component ID.`);
  required(/^[0-9a-f]{64}$/.test(reconciliation.evidence_digest ?? ""), `${label}: invalid evidence digest.`);
  required(reconciliation.classification === "same-work-confirmed-prior-multi-method-review", `${label}: classification drifted.`);
  required(["original-collection-default", "measured-quality-exception-reddit-version"].includes(reconciliation.keeper_policy), `${label}: keeper policy drifted.`);
  required(Array.isArray(reconciliation.reddit_post_ids) && reconciliation.reddit_post_ids.length > 0, `${label}: missing Reddit post provenance.`);
  required(Array.isArray(reconciliation.source_references) && reconciliation.source_references.length > 0 && reconciliation.source_references.length <= 32, `${label}: source reference cardinality exceeds 32.`);
}

export function validatePinnedPlan(plan) {
  required(plan?.artifactType === "replication-index-expanded-duplicate-suppression-plan", "Unexpected duplicate plan artifact type.");
  required(plan.schemaVersion === 1 && plan.mode === "local-zero-write-cas-plan", "Duplicate plan schema or mode drifted.");
  required(plan.target?.deployment === "prod:glad-minnow-656", "Duplicate plan target must be prod:glad-minnow-656.");
  required(plan.target?.writesPerformed === 0, "Pinned planning artifact must record zero writes.");
  const content = { ...plan };
  delete content.contentSha256;
  required(plan.contentSha256 === digestValue(content), "Duplicate plan self-hash does not match its content.");
  for (const [field, expected] of Object.entries(EXPECTED_COUNTS)) {
    required(plan.counts?.[field] === expected, `Duplicate plan counts.${field} must equal ${expected}.`);
  }
  for (const field of ["replicationRowsDeleted", "r2ObjectsDeleted", "sourceMediaDeleted", "productionWrites"]) {
    required(plan.counts?.[field] === 0, `Duplicate plan counts.${field} must remain zero.`);
  }
  required(Array.isArray(plan.components) && plan.components.length === 311, "Duplicate plan must contain 311 components.");
  required(Array.isArray(plan.suppressionBatches) && plan.suppressionBatches.length === 18, "Duplicate plan must contain 18 suppression batches.");
  required(Array.isArray(plan.rollbackBatches) && plan.rollbackBatches.length === 18, "Duplicate plan must contain 18 rollback batches.");

  const componentIds = new Set();
  const suppressedIds = new Set();
  const updateByComponent = new Map();
  let updateCount = 0;
  for (const [batchIndex, batch] of plan.suppressionBatches.entries()) {
    const expectedNumber = batchIndex + 1;
    required(batch.batchNumber === expectedNumber, `Suppression batch ${expectedNumber} numbering drifted.`);
    required(batch.entryCount === batch.payload?.updates?.length, `Suppression batch ${expectedNumber} entry count drifted.`);
    required(batch.entryCount > 0 && batch.entryCount <= 20, `Suppression batch ${expectedNumber} exceeds max 20.`);
    required(batch.payload?.dry_run === true, `Suppression batch ${expectedNumber} must be pinned dry_run true.`);
    required(batch.payloadSha256 === digestValue(batch.payload), `Suppression batch ${expectedNumber} payload hash drifted.`);
    for (const [updateIndex, update] of batch.payload.updates.entries()) {
      validateSuppressionUpdate(update, `suppression batch ${expectedNumber} update ${updateIndex + 1}`);
      const componentId = update.reconciliation.component_id;
      required(!componentIds.has(componentId), `Repeated suppression component ${componentId}.`);
      required(!suppressedIds.has(update.expected_suppressed.id), `Repeated suppressed row ${update.expected_suppressed.id}.`);
      componentIds.add(componentId);
      suppressedIds.add(update.expected_suppressed.id);
      updateByComponent.set(componentId, update);
      updateCount += 1;
    }
  }
  required(updateCount === 331 && suppressedIds.size === 331 && componentIds.size === 331, "Suppression coverage must be 331 unique rows/components.");

  let rollbackCount = 0;
  for (const [batchIndex, batch] of plan.rollbackBatches.entries()) {
    const expectedNumber = batchIndex + 1;
    required(batch.batchNumber === expectedNumber, `Rollback batch ${expectedNumber} numbering drifted.`);
    required(batch.entryCount === batch.payload?.updates?.length, `Rollback batch ${expectedNumber} entry count drifted.`);
    required(batch.entryCount > 0 && batch.entryCount <= 20, `Rollback batch ${expectedNumber} exceeds max 20.`);
    required(batch.payload?.dry_run === true, `Rollback batch ${expectedNumber} must be pinned dry_run true.`);
    required(batch.payloadSha256 === digestValue(batch.payload), `Rollback batch ${expectedNumber} payload hash drifted.`);
    for (const update of batch.payload.updates) {
      const suppression = updateByComponent.get(update.component_id);
      required(suppression, `Rollback references unknown component ${update.component_id}.`);
      required(update.keeper_id === suppression.expected_keeper.id, `${update.component_id}: rollback keeper drifted.`);
      required(update.suppressed_id === suppression.expected_suppressed.id, `${update.component_id}: rollback suppressed row drifted.`);
      required(update.evidence_digest === suppression.reconciliation.evidence_digest, `${update.component_id}: rollback evidence drifted.`);
      rollbackCount += 1;
    }
  }
  required(rollbackCount === 331, "Rollback coverage must be exactly 331 rows.");

  const relationsByKeeper = new Map();
  for (const update of updateByComponent.values()) {
    const keeperId = update.expected_keeper.id;
    relationsByKeeper.set(keeperId, (relationsByKeeper.get(keeperId) ?? 0) + 1);
  }
  required(Math.max(...relationsByKeeper.values()) <= 32, "A keeper exceeds the 32-relation readback limit.");
  return { updateByComponent, relationsByKeeper };
}

function newLedger({ planPath, plan, planFileSha256 }) {
  return {
    schemaVersion: 1,
    artifactType: "pinned-duplicate-suppression-production-ledger",
    target: EXACT_TARGET,
    deployment: EXACT_DEPLOYMENT,
    planPath,
    planFileSha256,
    planContentSha256: plan.contentSha256,
    status: "pending",
    verifiedSuppressionBatches: 0,
    verifiedSuppressedRows: 0,
    batches: Object.fromEntries([
      ...plan.suppressionBatches.map((batch) => [`suppression:${String(batch.batchNumber).padStart(2, "0")}`, {
        kind: "suppression", batchNumber: batch.batchNumber, payloadSha256: batch.payloadSha256,
        phase: batch.batchNumber === 1 ? "canary" : "remaining", status: "pending",
      }]),
      ...plan.rollbackBatches.map((batch) => [`rollback:${String(batch.batchNumber).padStart(2, "0")}`, {
        kind: "rollback", batchNumber: batch.batchNumber, payloadSha256: batch.payloadSha256,
        phase: "rollback", status: "pending",
      }]),
    ]),
  };
}

function refreshLedgerSummary(ledger, plan) {
  const verifiedSuppression = plan.suppressionBatches.filter((batch) =>
    ledger.batches[`suppression:${String(batch.batchNumber).padStart(2, "0")}`].status === "verified");
  const verifiedRollback = plan.rollbackBatches.filter((batch) =>
    ledger.batches[`rollback:${String(batch.batchNumber).padStart(2, "0")}`].status === "verified");
  ledger.verifiedSuppressionBatches = verifiedSuppression.length;
  ledger.verifiedSuppressedRows = verifiedSuppression.reduce((total, batch) => total + batch.entryCount, 0);
  ledger.verifiedRollbackBatches = verifiedRollback.length;
  ledger.status = verifiedSuppression.length === plan.suppressionBatches.length
    && verifiedRollback.length === 0
    ? "complete"
    : "pending";
  return ledger;
}

function loadLedger({ ledgerPath, planPath, plan, planFileSha256 }) {
  if (!existsSync(ledgerPath)) return newLedger({ planPath, plan, planFileSha256 });
  const ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
  required((statSync(ledgerPath).mode & 0o077) === 0, "Existing ledger permissions must be owner-only (0600)." );
  required(ledger.artifactType === "pinned-duplicate-suppression-production-ledger", "Existing ledger artifact type drifted.");
  required(ledger.target === EXACT_TARGET && ledger.deployment === EXACT_DEPLOYMENT, "Existing ledger target drifted.");
  required(path.resolve(ledger.planPath) === planPath, "Existing ledger plan path drifted.");
  required(ledger.planFileSha256 === planFileSha256 && ledger.planContentSha256 === plan.contentSha256, "Existing ledger plan hash drifted.");
  const expected = newLedger({ planPath, plan, planFileSha256 });
  required(sameJson(Object.keys(ledger.batches ?? {}).sort(), Object.keys(expected.batches).sort()), "Existing ledger batch coverage drifted.");
  for (const [key, pinned] of Object.entries(expected.batches)) {
    const actual = ledger.batches[key];
    required(actual.kind === pinned.kind && actual.batchNumber === pinned.batchNumber && actual.payloadSha256 === pinned.payloadSha256 && actual.phase === pinned.phase, `${key}: existing ledger pin drifted.`);
  }
  return refreshLedgerSummary(ledger, plan);
}

function intendedProjection(update, state, operationId, rollbackOperationId) {
  return {
    component_id: update.reconciliation.component_id,
    keeper_replication_id: update.expected_keeper.id,
    suppressed_replication_id: update.expected_suppressed.id,
    evidence_digest: update.reconciliation.evidence_digest,
    classification: update.reconciliation.classification,
    keeper_policy: update.reconciliation.keeper_policy,
    reddit_post_ids: update.reconciliation.reddit_post_ids,
    source_references: update.reconciliation.source_references,
    state,
    operation_id: operationId,
    ...(rollbackOperationId ? { rollback_operation_id: rollbackOperationId } : {}),
  };
}

function storedProjection(row) {
  return {
    component_id: row.component_id,
    keeper_replication_id: row.keeper_replication_id,
    suppressed_replication_id: row.suppressed_replication_id,
    evidence_digest: row.evidence_digest,
    classification: row.classification,
    keeper_policy: row.keeper_policy,
    reddit_post_ids: row.reddit_post_ids,
    source_references: row.source_references,
    state: row.state,
    operation_id: row.operation_id,
    ...(row.rollback_operation_id ? { rollback_operation_id: row.rollback_operation_id } : {}),
  };
}

function expectedForKeeper(plan, ledger, keeperId) {
  const expected = [];
  for (const batch of plan.suppressionBatches) {
    const suppressionState = ledger.batches[`suppression:${String(batch.batchNumber).padStart(2, "0")}`];
    if (suppressionState.status !== "verified") continue;
    const rollbackBatch = plan.rollbackBatches[batch.batchNumber - 1];
    const rollbackState = ledger.batches[`rollback:${String(batch.batchNumber).padStart(2, "0")}`];
    for (const update of batch.payload.updates.filter((candidate) => candidate.expected_keeper.id === keeperId)) {
      const rolledBack = rollbackState.status === "verified";
      expected.push(intendedProjection(
        update,
        rolledBack ? "rolled-back" : "active",
        batch.payload.operation_id,
        rolledBack ? rollbackBatch.payload.operation_id : null,
      ));
    }
  }
  return expected.sort((left, right) => left.component_id.localeCompare(right.component_id));
}

function replicationSnapshotMatches(row, expected) {
  return row
    && row._id === expected.id
    && row.slug === expected.slug
    && row.artist === expected.artist
    && (row.source_catalog_id ?? null) === expected.source_catalog_id
    && (row.source_sha256 ?? null) === expected.source_sha256;
}

async function assertExactReplicationReadback({ client, apiKey, kind, batch }) {
  let calls = 0;
  for (const update of batch.payload.updates) {
    const keeperId = kind === "suppression" ? update.expected_keeper.id : update.keeper_id;
    const suppressedId = kind === "suppression" ? update.expected_suppressed.id : update.suppressed_id;
    const source = kind === "suppression"
      ? update
      : null;
    const keeper = await client.query(api.replications.getResolvedById, { apiKey, id: keeperId });
    const suppressed = await client.query(api.replications.getResolvedById, { apiKey, id: suppressedId });
    calls += 2;
    if (source) {
      required(replicationSnapshotMatches(keeper, source.expected_keeper), `${keeperId}: keeper hot-row readback drifted.`);
      required(replicationSnapshotMatches(suppressed, source.expected_suppressed), `${suppressedId}: suppressed hot-row identity drifted.`);
      required(
        suppressed.publication_state === "duplicate-suppressed"
          && suppressed.duplicate_of_replication_id === keeperId
          && suppressed.duplicate_evidence_digest === source.reconciliation.evidence_digest,
        `${suppressedId}: suppressed hot-row publication state drifted.`,
      );
    } else {
      required(keeper && keeper._id === keeperId, `${keeperId}: rollback keeper is missing.`);
      required(
        suppressed
          && suppressed._id === suppressedId
          && (suppressed.publication_state ?? null) === null
          && (suppressed.duplicate_of_replication_id ?? null) === null
          && (suppressed.duplicate_evidence_digest ?? null) === null,
        `${suppressedId}: rollback did not restore public eligibility.`,
      );
    }
  }
  return calls;
}

async function assertExactKeeperReadback({ client, plan, ledger, keeperIds }) {
  let calls = 0;
  for (const keeperId of [...new Set(keeperIds)].sort()) {
    const rows = await client.query(api.replicationDuplicates.getByKeeper, { keeper_replication_id: keeperId });
    calls += 1;
    const actual = rows.map(storedProjection).sort((left, right) => left.component_id.localeCompare(right.component_id));
    const expected = expectedForKeeper(plan, ledger, keeperId);
    required(
      sameJson(actual, expected),
      `${keeperId}: exact getByKeeper readback mismatch; actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)}.`,
    );
  }
  return calls;
}

function validateLiveTarget(argv) {
  const target = flagValue(argv, "--target-url");
  const deployment = flagValue(argv, "--expected-deployment");
  required(target === EXACT_TARGET, `Live execution requires --target-url=${EXACT_TARGET}.`);
  required(deployment === EXACT_DEPLOYMENT, `Live execution requires --expected-deployment=${EXACT_DEPLOYMENT}.`);
}

export async function runPinnedDuplicateSuppression({
  argv = process.argv.slice(2),
  env = process.env,
  expectedPlanPath = DEFAULT_PLAN_PATH,
  expectedPlanFileSha256 = PLAN_FILE_SHA256,
  expectedPlanContentSha256 = PLAN_CONTENT_SHA256,
  clientFactory = (url) => createDataClient({ target: url }).client,
  logger = console,
} = {}) {
  const planPath = path.resolve(flagValue(argv, "--plan") ?? DEFAULT_PLAN_PATH);
  required(planPath === path.resolve(expectedPlanPath), `Runner is pinned to exact plan path ${path.resolve(expectedPlanPath)}.`);
  const planBytes = readFileSync(planPath);
  required(digestValue(planBytes) === expectedPlanFileSha256, "Pinned duplicate plan file SHA-256 mismatch.");
  const plan = JSON.parse(planBytes.toString("utf8"));
  required(plan.contentSha256 === expectedPlanContentSha256, "Pinned duplicate plan content SHA-256 mismatch.");
  validatePinnedPlan(plan);

  const phase = flagValue(argv, "--phase") ?? "canary";
  required(["canary", "remaining", "rollback", "reconcile"].includes(phase), "--phase must be canary, remaining, rollback, or reconcile.");
  const liveDryRun = hasFlag(argv, "--live-dry-run");
  required(!(liveDryRun && hasFlag(argv, "--write")), "--live-dry-run and --write cannot be combined.");
  const rollbackNumberText = flagValue(argv, "--batch");
  if (phase === "rollback") required(/^([1-9]|1[0-8])$/.test(rollbackNumberText ?? ""), "Rollback requires --batch=1..18.");

  const command = createProductionWriteCommand({ operation: OPERATION, argv: normalizeCommandArgv(argv), env, loadsEnvLocal: false });
  printProductionWriteCommand(command, { logger });
  logger.log(`Pinned plan: ${planPath}`);
  logger.log(`Plan file SHA-256: ${expectedPlanFileSha256}`);
  logger.log(`Plan content SHA-256: ${expectedPlanContentSha256}`);

  if (!liveDryRun && command.dryRun) {
    return { mode: "local-dry-run", phase, batches: phase === "canary" ? 1 : phase === "remaining" ? 17 : 1, suppressedRows: 331, networkCalls: 0 };
  }

  validateLiveTarget(argv);
  if (!liveDryRun) {
    assertProductionWriteAllowed(command);
    required(command.targetUrl === EXACT_TARGET && command.deploymentFingerprint === EXACT_DEPLOYMENT, "Production target drifted.");
  }
  const credential = requireProductionWriteCredential("replicationMaintenance", { env });
  required(credential.source === "scoped", "Live execution requires the scoped replicationMaintenance credential; legacy fallback is disabled.");
  const client = clientFactory(EXACT_TARGET);

  if (liveDryRun) {
    required(phase !== "rollback", "Live dry-run validates suppression only; rollback requires the explicit write phase.");
    const selected = phase === "canary" ? plan.suppressionBatches.slice(0, 1) : plan.suppressionBatches.slice(1);
    let networkCalls = 0;
    for (const batch of selected) {
      const result = await client.mutation(api.replicationDuplicates.applySuppressionBatch, {
        apiKey: credential.token,
        ...batch.payload,
        dry_run: true,
      });
      networkCalls += 1;
      required(result?.operation_id === batch.payload.operation_id && result.dry_run === true, `Suppression batch ${batch.batchNumber}: live dry-run response drifted.`);
      required(result.suppressed + result.unchanged === batch.entryCount && result.rows?.length === batch.entryCount, `Suppression batch ${batch.batchNumber}: live dry-run count mismatch.`);
    }
    return { mode: "live-dry-run", phase, batches: selected.length, networkCalls };
  }

  const ledgerPath = path.resolve(flagValue(argv, "--ledger") ?? path.join(path.dirname(planPath), "expanded-duplicate-suppression-production-ledger.json"));
  const ledger = loadLedger({ ledgerPath, planPath, plan, planFileSha256: expectedPlanFileSha256 });
  const uncertain = Object.entries(ledger.batches).filter(([, value]) => value.status === "uncertain").map(([key]) => key);
  if (phase === "reconcile") {
    const uncertainSuppression = uncertain.filter((key) => key.startsWith("suppression:"));
    required(uncertainSuppression.length > 0, "No uncertain suppression batch is available to reconcile.");
    const client = clientFactory(EXACT_TARGET);
    let networkCalls = 0;
    for (const key of uncertainSuppression) {
      const batchNumber = Number(key.split(":")[1]);
      const batch = plan.suppressionBatches[batchNumber - 1];
      const state = ledger.batches[key];
      state.status = "verified";
      try {
        const keeperIds = batch.payload.updates.map((update) => update.expected_keeper.id);
        networkCalls += await assertExactKeeperReadback({ client, plan, ledger, keeperIds });
        networkCalls += await assertExactReplicationReadback({
          client,
          apiKey: credential.token,
          kind: "suppression",
          batch,
        });
        state.reason = "uncertain-dispatch-reconciled-by-exact-readback";
        state.verifiedAt = new Date().toISOString();
        delete state.errorClass;
        delete state.errorDigestSha256;
        refreshLedgerSummary(ledger, plan);
        atomicWriteJson(ledgerPath, ledger);
      } catch (error) {
        state.status = "uncertain";
        state.reason = "exact-reconciliation-failed";
        state.errorClass = error instanceof Error ? error.name : "UnknownError";
        state.errorDigestSha256 = digestValue(error instanceof Error ? error.message : String(error));
        atomicWriteJson(ledgerPath, ledger);
        throw error;
      }
    }
    return { mode: "reconcile", batches: uncertainSuppression.length, verified: uncertainSuppression.length, networkCalls, ledgerPath };
  }
  required(uncertain.length === 0, `Ledger contains uncertain outcomes and cannot auto-retry: ${uncertain.join(", ")}.`);
  if (phase === "remaining") required(ledger.batches["suppression:01"].status === "verified", "Remaining phase requires a separately verified canary.");
  const rollbackNumber = Number(rollbackNumberText);
  if (phase === "rollback") required(ledger.batches[`suppression:${String(rollbackNumber).padStart(2, "0")}`].status === "verified", "Rollback requires the matching verified suppression batch.");
  atomicWriteJson(ledgerPath, ledger);

  const selected = phase === "canary"
    ? [{ kind: "suppression", batch: plan.suppressionBatches[0] }]
    : phase === "remaining"
      ? plan.suppressionBatches.slice(1).map((batch) => ({ kind: "suppression", batch }))
      : [{ kind: "rollback", batch: plan.rollbackBatches[rollbackNumber - 1] }];
  let verified = 0;
  let networkCalls = 0;
  for (const { kind, batch } of selected) {
    const key = `${kind}:${String(batch.batchNumber).padStart(2, "0")}`;
    const state = ledger.batches[key];
    if (state.status === "verified") continue;
    required(state.status === "pending", `${key}: ledger status ${state.status} is not resumable.`);
    state.status = "uncertain";
    state.reason = "mutation-dispatched-outcome-pending";
    state.dispatchedAt = new Date().toISOString();
    atomicWriteJson(ledgerPath, ledger);
    try {
      const mutation = kind === "suppression" ? api.replicationDuplicates.applySuppressionBatch : api.replicationDuplicates.rollbackSuppressionBatch;
      const result = await client.mutation(mutation, { apiKey: credential.token, ...batch.payload, dry_run: false });
      networkCalls += 1;
      const changed = kind === "suppression" ? result?.suppressed : result?.restored;
      required(result?.operation_id === batch.payload.operation_id && result.dry_run === false, `${key}: mutation response drifted.`);
      required(changed + result.unchanged === batch.entryCount && result.rows?.length === batch.entryCount, `${key}: mutation result count mismatch.`);
      state.status = "verified"; // Temporarily exposes intended state solely to calculate exact readback.
      const keeperIds = kind === "suppression"
        ? batch.payload.updates.map((update) => update.expected_keeper.id)
        : batch.payload.updates.map((update) => update.keeper_id);
      networkCalls += await assertExactKeeperReadback({ client, plan, ledger, keeperIds });
      networkCalls += await assertExactReplicationReadback({
        client,
        apiKey: credential.token,
        kind,
        batch,
      });
      state.reason = "mutation-and-exact-getByKeeper-readback-verified";
      state.verifiedAt = new Date().toISOString();
      state.resultDigestSha256 = digestValue(result);
      refreshLedgerSummary(ledger, plan);
      atomicWriteJson(ledgerPath, ledger);
      verified += 1;
    } catch (error) {
      state.status = "uncertain";
      state.reason = "mutation-or-readback-outcome-uncertain";
      state.errorClass = error instanceof Error ? error.name : "UnknownError";
      state.errorDigestSha256 = digestValue(error instanceof Error ? error.message : String(error));
      atomicWriteJson(ledgerPath, ledger);
      throw new Error(`${key}: uncertain production outcome; stopped without retry. Reconcile exact live state before recovery.`, { cause: error });
    }
  }
  return { mode: "write", phase, batches: selected.length, verified, networkCalls, ledgerPath };
}

async function main() {
  console.log(JSON.stringify(await runPinnedDuplicateSuppression(), null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
