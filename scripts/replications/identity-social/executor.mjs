#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { requireCampaignTarget } from "../lib/postgres-target.mjs";
import { createDataClient } from "../../lib/data-client.ts";
import { api } from "../../../lib/postgres/runtime/api.ts"
import { createProductionWriteCommand, assertProductionWriteAllowed, requireProductionWriteCredential } from "../../lib/production-write-command.mjs";
import { appendLedger, assertPreviewMatches, batchesAfterCanaries, buildExecutionPlan, completedBatchesForRollback, indexProfiles, loadLedger, pendingBatches, PRODUCTION_DEPLOYMENT, rollbackManifest, selectCanaries, validatePinnedProfileSnapshot, verifyDeliveryReceiptSidecar } from "./executor-lib.mjs";

const CAMPAIGN = "/Users/josie/Documents/Dose Wiki Media Review/Data/Replication Identity and Social Pass 2026-08-31";
const OPERATION_KINDS = new Set(["profile-binding", "attribution", "alias", "avatar", "verification", "social-asset"]);
const flag = (argv, name) => { const x = argv.find((v) => v.startsWith(`${name}=`)); return x ? x.slice(name.length + 1) : null; };
export function parseArgs(argv) {
  const operationKind = flag(argv, "--operation-kind");
  const maxClientAttempts = Number(flag(argv, "--max-client-attempts") ?? 4);
  if (operationKind && !OPERATION_KINDS.has(operationKind)) throw new Error(`Unsupported --operation-kind=${operationKind}.`);
  if (!Number.isInteger(maxClientAttempts) || maxClientAttempts < 1 || maxClientAttempts > 10) throw new Error("--max-client-attempts must be an integer from 1 through 10.");
  return {
    projection: flag(argv, "--projection") ?? `${CAMPAIGN}/identity-social-production-projection.json`,
    profiles: flag(argv, "--profiles"),
    receipts: flag(argv, "--delivery-receipts"), ledger: flag(argv, "--ledger") ?? `${CAMPAIGN}/identity-social-production-ledger.jsonl`,
    receiptSidecarDigest: flag(argv, "--receipt-sidecar-digest"),
    attributionDates: flag(argv, "--attribution-dates"), creatorProof: flag(argv, "--creator-proof"), replicationIds: flag(argv, "--replication-ids"),
    planOut: flag(argv, "--plan-out") ?? `${CAMPAIGN}/identity-social-executor-dry-run.json`,
    rollbackOut: flag(argv, "--rollback-out") ?? `${CAMPAIGN}/identity-social-rollback-manifest.json`,
    expectedDigest: flag(argv, "--projection-digest"), actor: flag(argv, "--actor-email"), phase: flag(argv, "--phase"), operationKind,
    onlyOperationId: flag(argv, "--only-operation-id"), maxClientAttempts,
    reconcileAppliedProfileBindings: argv.includes("--reconcile-applied-profile-bindings"), rollback: argv.includes("--rollback"), argv,
  };
}
const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));

export function isTransientDataTransportError(error) {
  const code = String(error?.code ?? error?.cause?.code ?? "").toUpperCase();
  const message = String(error?.message ?? error ?? "").toLowerCase();
  return ["ECONNRESET", "ECONNREFUSED", "EPIPE", "ETIMEDOUT", "UND_ERR_SOCKET", "UND_ERR_CONNECT_TIMEOUT"].includes(code)
    || /http\/2|goaway|connection (?:closed|reset)|fetch failed|network error|socket hang up|terminated/.test(message);
}

export async function runBatchWithTransportRecovery({ batch, mutateBatch, readReceipt, recreateClient, maxAttempts = 4 }) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const result = await mutateBatch();
      return { result, receipt: null, recovered: false, attempts: attempt };
    } catch (error) {
      if (!isTransientDataTransportError(error)) throw error;
      lastError = error;
      recreateClient();
      try {
        const receipt = await readReceipt();
        if (receipt) {
          if (receipt.item_count !== batch.entries.length) throw new Error(`Recovered receipt item count mismatch for ${batch.operation_id}.`);
          return { result: { payload_digest: receipt.payload_digest, recovered_after_transport_error: true }, receipt, recovered: true, attempts: attempt };
        }
      } catch (receiptError) {
        if (!isTransientDataTransportError(receiptError)) throw receiptError;
        lastError = receiptError;
        recreateClient();
      }
    }
  }
  throw new Error(`Postgres transport remained unavailable after ${maxAttempts} attempts for ${batch.operation_id}: ${lastError?.message ?? lastError}`);
}

export async function runQueryWithTransportRecovery({ query, recreateClient, maxAttempts = 4, label = "Postgres query" }) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await query();
    } catch (error) {
      if (!isTransientDataTransportError(error)) throw error;
      lastError = error;
      recreateClient();
    }
  }
  throw new Error(`${label} remained unavailable after ${maxAttempts} attempts: ${lastError?.message ?? lastError}`);
}

export async function run(argv = process.argv.slice(2), adapters = {}) {
  const options = parseArgs(argv); const projection = readJson(options.projection);
  if (!options.expectedDigest) throw new Error("--projection-digest=<sha256> is required in dry-run and write modes.");
  if (!options.profiles) throw new Error("--profiles=<immutable-2119-profile-snapshot.json> is required; the stale 160-profile snapshot is prohibited.");
  const profileRows = validatePinnedProfileSnapshot(readJson(options.profiles));
  if (Boolean(options.receipts) !== Boolean(options.receiptSidecarDigest)) throw new Error("--delivery-receipts and --receipt-sidecar-digest must be supplied together.");
  const verifiedSidecar = options.receipts ? verifyDeliveryReceiptSidecar(projection, readJson(options.receipts), options.receiptSidecarDigest) : { receipts: {}, receiptSidecarSha256: null };
  const plan = buildExecutionPlan(projection, { profiles: indexProfiles(profileRows), receipts: verifiedSidecar.receipts, receiptSidecarDigest: verifiedSidecar.receiptSidecarSha256, attributionDates: options.attributionDates ? readJson(options.attributionDates) : {}, creatorProof: options.creatorProof ? readJson(options.creatorProof) : {}, replicationIds: options.replicationIds ? readJson(options.replicationIds) : {}, expectedProjectionDigest: options.expectedDigest });
  const ledger = loadLedger(options.ledger); const canaries = selectCanaries(plan.batches); const fullBatches = batchesAfterCanaries(plan.batches, canaries); const selectedPhaseBatches = options.phase === "canary" ? canaries : options.phase === "full" ? fullBatches : plan.batches; const kindSelectedBatches = options.operationKind ? selectedPhaseBatches.filter((batch) => batch.kind === options.operationKind) : selectedPhaseBatches; const selectedBatches = options.onlyOperationId ? kindSelectedBatches.filter((batch) => batch.operation_id === options.onlyOperationId) : kindSelectedBatches; if (options.onlyOperationId && selectedBatches.length !== 1) throw new Error(`--only-operation-id did not select exactly one batch: ${options.onlyOperationId}`); const pending = pendingBatches(selectedBatches, ledger);
  const summary = { mode: argv.includes("--write") ? "write-requested" : "dry-run", target: PRODUCTION_DEPLOYMENT, projection_digest: plan.projection_digest, receipt_sidecar_digest: plan.receipt_sidecar_digest ?? null, projected_operations: projection.operations.length, actionable: plan.entries.length, explicit_no_writes: plan.noWrites.length, batches: plan.batches.length, operation_kind: options.operationKind ?? null, selected_batches: selectedBatches.length, pending_batches: pending.length, canaries: canaries.map((x) => ({ operation_id: x.operation_id, kind: x.kind, records: x.entries.length })), no_write_reasons: Object.groupBy ? Object.fromEntries(Object.entries(Object.groupBy(plan.noWrites, (x) => x.reason)).map(([k,v])=>[k,v.length])) : plan.noWrites.reduce((a,x)=>(a[x.reason]=(a[x.reason]??0)+1,a),{}) };
  writeFileSync(options.planOut, `${JSON.stringify({ ...summary, no_writes: plan.noWrites }, null, 2)}\n`);
  if (!argv.includes("--write")) return summary;

  const command = createProductionWriteCommand({ operation: "apply-identity-social-projection", argv });
  assertProductionWriteAllowed(command);
  requireCampaignTarget(command);
  if (!options.actor) throw new Error("--actor-email is required for writes.");
  if (!options.rollback && !["canary", "full"].includes(options.phase)) throw new Error("Write mode requires --phase=canary or --phase=full.");
  const apiKey = requireProductionWriteCredential("replicationMaintenance").token;
  let client = adapters.client ?? createDataClient({ target: command.targetUrl }).client;
  const recreateClient = () => { client = adapters.createClient ? adapters.createClient(command.targetUrl) : createDataClient({ target: command.targetUrl }).client; };
  const query = (ref, args) => adapters.query ? adapters.query(ref, args) : client.query(ref, args);
  const mutate = (ref, args) => adapters.mutate ? adapters.mutate(ref, args) : client.mutation(ref, args);
  const verified = new Set(loadLedger(options.ledger).filter((x) => x.event === "batch-readback-verified").map((x) => x.operation_id));
  if (options.phase === "full") for (const batch of canaries) if (!verified.has(batch.operation_id)) throw new Error(`Full rollout requires verified canary ${batch.operation_id}.`);
  const work = options.rollback ? [] : pendingBatches(selectedBatches, loadLedger(options.ledger));
  for (const batch of work) {
    let reconcileAppliedProfileBinding = false;
    for (const entry of batch.entries) {
      if (batch.kind === "profile-binding") {
        const preflight = await runQueryWithTransportRecovery({ query: () => query(api.replicationIdentitySocial.preflightProfileBindingAuthenticated, { apiKey, actor_email: options.actor, entry }), recreateClient, maxAttempts: options.maxClientAttempts, label: "Profile binding preflight" });
        if (!preflight.matches) {
          if (!options.reconcileAppliedProfileBindings) throw new Error(`Profile binding preflight failed: ${preflight.error ?? "unknown reason"}`);
          reconcileAppliedProfileBinding = true;
        }
      } else {
        const journalOnly = (entry.kind === "attribution" && ["preserve-poster-as-creator", "preserve-poster-as-creator-no-write", "blocked-preserve-poster-no-verified-chronology"].includes(entry.projection.action))
          || (entry.kind === "alias" && ["preserve-existing-alias", "blocked-pending-owner-review", "blocked-merge-required-collision"].includes(entry.projection.action));
        if (!journalOnly) assertPreviewMatches(entry, await runQueryWithTransportRecovery({ query: () => query(api.replicationIdentitySocial.previewCanonicalBeforeAuthenticated, { apiKey, actor_email: options.actor, entry }), recreateClient, maxAttempts: options.maxClientAttempts, label: "Canonical preview" }));
        const preflight = await runQueryWithTransportRecovery({ query: () => query(api.replicationIdentitySocial.preflightBatchEntryAuthenticated, { apiKey, actor_email: options.actor, entry }), recreateClient, maxAttempts: options.maxClientAttempts, label: "Identity/social preflight" });
        if (!preflight.matches) throw new Error(`Identity/social batch preflight failed: ${preflight.error ?? "unknown reason"}`);
      }
    }
    const mutation = () => batch.kind === "profile-binding"
      ? mutate(reconcileAppliedProfileBinding ? api.replicationIdentitySocial.reconcileAppliedProfileBindingBatch : api.replicationIdentitySocial.applyProfileBindingBatch, { apiKey, actor_email: options.actor, operation_id: batch.operation_id, dry_run: false, entries: batch.entries })
      : mutate(api.replicationIdentitySocial.applyBatch, { apiKey, actor_email: options.actor, operation_id: batch.operation_id, kind: batch.kind, dry_run: false, entries: batch.entries });
    const receiptQuery = () => runQueryWithTransportRecovery({ query: () => query(api.replicationIdentitySocial.getOperationReceiptAuthenticated, { apiKey, actor_email: options.actor, operation_id: batch.operation_id }), recreateClient, maxAttempts: options.maxClientAttempts, label: `Operation receipt ${batch.operation_id}` });
    const recovered = await runBatchWithTransportRecovery({ batch, mutateBatch: mutation, readReceipt: receiptQuery, recreateClient, maxAttempts: options.maxClientAttempts });
    const result = recovered.result;
    appendLedger(options.ledger, { event: "batch-applied", operation_id: batch.operation_id, kind: batch.kind, ...(reconcileAppliedProfileBinding ? { reconciliation: "already-applied-profile-bindings" } : {}), result, at: Date.now() });
    const receipt = recovered.receipt ?? await receiptQuery();
    if (!receipt || receipt.item_count !== batch.entries.length || receipt.payload_digest !== result.payload_digest) throw new Error(`Readback failed for ${batch.operation_id}.`);
    appendLedger(options.ledger, { event: "batch-readback-verified", operation_id: batch.operation_id, records: receipt.item_count, at: Date.now() });
  }
  const completed = completedBatchesForRollback(loadLedger(options.ledger));
  const rollbacks = rollbackManifest(completed); writeFileSync(options.rollbackOut, `${JSON.stringify({ target: PRODUCTION_DEPLOYMENT, projection_digest: plan.projection_digest, operations: rollbacks }, null, 2)}\n`);
  if (options.rollback) {
    for (const item of rollbacks) {
      const originalKind = loadLedger(options.ledger).find((event) => event.event === "batch-applied" && event.operation_id === item.rollback_of)?.kind;
      await mutate(originalKind === "profile-binding" ? api.replicationIdentitySocial.rollbackProfileBindingOperation : api.replicationIdentitySocial.rollbackOperation, { apiKey, actor_email: options.actor, ...item, dry_run: false });
      appendLedger(options.ledger, { event: "rollback-applied", ...item, at: Date.now() });
    }
  }
  return summary;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) run().then((x) => console.log(JSON.stringify(x, null, 2))).catch((error) => { console.error(error.message); process.exitCode = 1; });
