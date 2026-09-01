#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../convex/_generated/api.js";
import { createProductionWriteCommand, assertProductionWriteAllowed, requireProductionWriteCredential } from "../../lib/production-write-command.mjs";
import { appendLedger, assertPreviewMatches, batchesAfterCanaries, buildExecutionPlan, indexProfiles, loadLedger, pendingBatches, PRODUCTION_DEPLOYMENT, rollbackManifest, selectCanaries, validatePinnedProfileSnapshot, verifyDeliveryReceiptSidecar } from "./executor-lib.mjs";

const CAMPAIGN = "/Users/josie/Documents/Dose Wiki Media Review/Data/Replication Identity and Social Pass 2026-08-31";
const flag = (argv, name) => { const x = argv.find((v) => v.startsWith(`${name}=`)); return x ? x.slice(name.length + 1) : null; };
export function parseArgs(argv) {
  return {
    projection: flag(argv, "--projection") ?? `${CAMPAIGN}/identity-social-production-projection.json`,
    profiles: flag(argv, "--profiles"),
    receipts: flag(argv, "--delivery-receipts"), ledger: flag(argv, "--ledger") ?? `${CAMPAIGN}/identity-social-production-ledger.jsonl`,
    receiptSidecarDigest: flag(argv, "--receipt-sidecar-digest"),
    attributionDates: flag(argv, "--attribution-dates"), creatorProof: flag(argv, "--creator-proof"), replicationIds: flag(argv, "--replication-ids"),
    planOut: flag(argv, "--plan-out") ?? `${CAMPAIGN}/identity-social-executor-dry-run.json`,
    rollbackOut: flag(argv, "--rollback-out") ?? `${CAMPAIGN}/identity-social-rollback-manifest.json`,
    expectedDigest: flag(argv, "--projection-digest"), actor: flag(argv, "--actor-email"), phase: flag(argv, "--phase"), rollback: argv.includes("--rollback"), argv,
  };
}
const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));
export async function run(argv = process.argv.slice(2), adapters = {}) {
  const options = parseArgs(argv); const projection = readJson(options.projection);
  if (!options.expectedDigest) throw new Error("--projection-digest=<sha256> is required in dry-run and write modes.");
  if (!options.profiles) throw new Error("--profiles=<immutable-2119-profile-snapshot.json> is required; the stale 160-profile snapshot is prohibited.");
  const profileRows = validatePinnedProfileSnapshot(readJson(options.profiles));
  if (Boolean(options.receipts) !== Boolean(options.receiptSidecarDigest)) throw new Error("--delivery-receipts and --receipt-sidecar-digest must be supplied together.");
  const verifiedSidecar = options.receipts ? verifyDeliveryReceiptSidecar(projection, readJson(options.receipts), options.receiptSidecarDigest) : { receipts: {}, receiptSidecarSha256: null };
  const plan = buildExecutionPlan(projection, { profiles: indexProfiles(profileRows), receipts: verifiedSidecar.receipts, receiptSidecarDigest: verifiedSidecar.receiptSidecarSha256, attributionDates: options.attributionDates ? readJson(options.attributionDates) : {}, creatorProof: options.creatorProof ? readJson(options.creatorProof) : {}, replicationIds: options.replicationIds ? readJson(options.replicationIds) : {}, expectedProjectionDigest: options.expectedDigest });
  const ledger = loadLedger(options.ledger); const canaries = selectCanaries(plan.batches); const fullBatches = batchesAfterCanaries(plan.batches, canaries); const pending = pendingBatches(plan.batches, ledger);
  const summary = { mode: argv.includes("--write") ? "write-requested" : "dry-run", target: PRODUCTION_DEPLOYMENT, projection_digest: plan.projection_digest, receipt_sidecar_digest: plan.receipt_sidecar_digest ?? null, projected_operations: projection.operations.length, actionable: plan.entries.length, explicit_no_writes: plan.noWrites.length, batches: plan.batches.length, pending_batches: pending.length, canaries: canaries.map((x) => ({ operation_id: x.operation_id, kind: x.kind, records: x.entries.length })), no_write_reasons: Object.groupBy ? Object.fromEntries(Object.entries(Object.groupBy(plan.noWrites, (x) => x.reason)).map(([k,v])=>[k,v.length])) : plan.noWrites.reduce((a,x)=>(a[x.reason]=(a[x.reason]??0)+1,a),{}) };
  writeFileSync(options.planOut, `${JSON.stringify({ ...summary, no_writes: plan.noWrites }, null, 2)}\n`);
  if (!argv.includes("--write")) return summary;

  const command = createProductionWriteCommand({ operation: "apply-identity-social-projection", argv });
  assertProductionWriteAllowed(command);
  if (command.deploymentFingerprint !== PRODUCTION_DEPLOYMENT) throw new Error(`Writes are restricted to ${PRODUCTION_DEPLOYMENT}.`);
  if (!options.actor) throw new Error("--actor-email is required for writes.");
  if (!options.rollback && !["canary", "full"].includes(options.phase)) throw new Error("Write mode requires --phase=canary or --phase=full.");
  const apiKey = requireProductionWriteCredential("replicationMaintenance").token;
  const client = adapters.client ?? new ConvexHttpClient(command.targetUrl);
  const query = adapters.query ?? ((ref, args) => client.query(ref, args));
  const mutate = adapters.mutate ?? ((ref, args) => client.mutation(ref, args));
  const verified = new Set(loadLedger(options.ledger).filter((x) => x.event === "batch-readback-verified").map((x) => x.operation_id));
  if (options.phase === "full") for (const batch of canaries) if (!verified.has(batch.operation_id)) throw new Error(`Full rollout requires verified canary ${batch.operation_id}.`);
  const work = options.rollback ? [] : pendingBatches(options.phase === "canary" ? canaries : fullBatches, loadLedger(options.ledger));
  for (const batch of work) {
    for (const entry of batch.entries) {
      if (batch.kind === "profile-binding") {
        const preflight = await query(api.replicationIdentitySocial.preflightProfileBindingAuthenticated, { apiKey, actor_email: options.actor, entry });
        if (!preflight.matches) throw new Error(`Profile binding preflight failed: ${preflight.error ?? "unknown reason"}`);
      } else {
        const journalOnly = (entry.kind === "attribution" && ["preserve-poster-as-creator", "preserve-poster-as-creator-no-write", "blocked-preserve-poster-no-verified-chronology"].includes(entry.projection.action))
          || (entry.kind === "alias" && ["preserve-existing-alias", "blocked-pending-owner-review", "blocked-merge-required-collision"].includes(entry.projection.action));
        if (!journalOnly) assertPreviewMatches(entry, await query(api.replicationIdentitySocial.previewCanonicalBeforeAuthenticated, { apiKey, actor_email: options.actor, entry }));
        const preflight = await query(api.replicationIdentitySocial.preflightBatchEntryAuthenticated, { apiKey, actor_email: options.actor, entry });
        if (!preflight.matches) throw new Error(`Identity/social batch preflight failed: ${preflight.error ?? "unknown reason"}`);
      }
    }
    const result = batch.kind === "profile-binding"
      ? await mutate(api.replicationIdentitySocial.applyProfileBindingBatch, { apiKey, actor_email: options.actor, operation_id: batch.operation_id, dry_run: false, entries: batch.entries })
      : await mutate(api.replicationIdentitySocial.applyBatch, { apiKey, actor_email: options.actor, operation_id: batch.operation_id, kind: batch.kind, dry_run: false, entries: batch.entries });
    appendLedger(options.ledger, { event: "batch-applied", operation_id: batch.operation_id, kind: batch.kind, result, at: Date.now() });
    const receipt = await query(api.replicationIdentitySocial.getOperationReceiptAuthenticated, { apiKey, actor_email: options.actor, operation_id: batch.operation_id });
    if (!receipt || receipt.item_count !== batch.entries.length || receipt.payload_digest !== result.payload_digest) throw new Error(`Readback failed for ${batch.operation_id}.`);
    appendLedger(options.ledger, { event: "batch-readback-verified", operation_id: batch.operation_id, records: receipt.item_count, at: Date.now() });
  }
  const completed = loadLedger(options.ledger).filter((x) => x.event === "batch-readback-verified").map((x) => ({ operation_id: x.operation_id }));
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
