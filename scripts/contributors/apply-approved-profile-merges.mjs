#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import { createDataClient } from "../lib/data-client.ts";
import { api } from "../../convex/_generated/api.js";
import {
  assertProductionWriteAllowed,
  createProductionWriteCommand,
  requireProductionWriteCredential,
} from "../lib/production-write-command.mjs";
import {
  APPROVED_MERGES,
  DEFAULT_LEDGER,
  DEFAULT_PLAN,
  DEFAULT_ROLLBACK_MANIFEST,
  MERGE_OPERATION,
  PRODUCTION_DEPLOYMENT,
  ROLLBACK_OPERATION,
  appendLedger,
  applyInput,
  assertExactReceipt,
  buildRollbackManifest,
  hasVerifiedReceipt,
  loadLedger,
  mergeOperationId,
  previewInput,
  writeJson,
} from "./approved-profile-merge-executor-lib.mjs";

const flag = (argv, name) => {
  const match = argv.find((value) => value.startsWith(`${name}=`));
  return match ? match.slice(name.length + 1) : null;
};

export function parseArgs(argv) {
  const only = flag(argv, "--only");
  if (only && !APPROVED_MERGES.some((pair) => pair.slug === only)) throw new Error("--only must be loka or phosform.");
  return {
    argv,
    actor: flag(argv, "--actor-email"),
    ledger: flag(argv, "--ledger") ?? DEFAULT_LEDGER,
    planOut: flag(argv, "--plan-out") ?? DEFAULT_PLAN,
    rollbackOut: flag(argv, "--rollback-out") ?? DEFAULT_ROLLBACK_MANIFEST,
    only,
    rollback: argv.includes("--rollback"),
    write: argv.includes("--write"),
  };
}

function assertExplicitTarget(command) {
  if (!command.targetUrl) throw new Error("An explicit production --target-url or TARGET_CONVEX_URL is required even for dry runs.");
  if (command.deploymentFingerprint !== PRODUCTION_DEPLOYMENT) throw new Error(`This executor is pinned to ${PRODUCTION_DEPLOYMENT}.`);
  if (command.expectedDeployment !== PRODUCTION_DEPLOYMENT) throw new Error(`--expected-deployment=${PRODUCTION_DEPLOYMENT} is required.`);
}

function ledgerEvent(pair, operationId, event, extra = {}) {
  return { event, operation_id: operationId, order: pair.order, source_key: pair.source_key, target_key: pair.target_key, ...extra, at: Date.now() };
}

export async function run(argv = process.argv.slice(2), adapters = {}) {
  const options = parseArgs(argv);
  const operation = options.rollback ? ROLLBACK_OPERATION : MERGE_OPERATION;
  const command = createProductionWriteCommand({ operation, argv });
  assertExplicitTarget(command);
  if (options.write) assertProductionWriteAllowed(command);
  if (!options.actor) throw new Error("--actor-email is required.");
  const apiKey = adapters.apiKey ?? requireProductionWriteCredential("replicationMaintenance").token;
  const client = adapters.client ?? createDataClient({ target: command.targetUrl }).client;
  const query = adapters.query ?? ((reference, args) => client.query(reference, args));
  const mutate = adapters.mutate ?? ((reference, args) => client.mutation(reference, args));
  let ledger = loadLedger(options.ledger);

  if (options.rollback) {
    const manifest = buildRollbackManifest(ledger);
    writeJson(options.rollbackOut, manifest);
    for (const item of manifest.operations) {
      const args = { apiKey, actor_email: options.actor, operation_id: item.operation_id, rollback_of: item.rollback_of };
      const dryRun = await mutate(api.contributorProfileMerges.rollback, { ...args, dry_run: true });
      if (!options.write) continue;
      appendLedger(options.ledger, { event: "profile-merge-rollback-dry-run-verified", ...item, result: dryRun, at: Date.now() });
      const result = await mutate(api.contributorProfileMerges.rollback, { ...args, dry_run: false });
      appendLedger(options.ledger, { event: "profile-merge-rollback-applied", ...item, result, at: Date.now() });
      const receipt = await query(api.contributorProfileMerges.receipt, { apiKey, actor_email: options.actor, operation_id: item.rollback_of });
      if (!receipt || receipt.operation.status !== "rolled-back" || !receipt.live_matches || receipt.checked_items !== receipt.operation.item_count) throw new Error(`Rollback readback failed for ${item.rollback_of}.`);
      appendLedger(options.ledger, { event: "profile-merge-rollback-readback-verified", ...item, checked_items: receipt.checked_items, at: Date.now() });
    }
    return { mode: options.write ? "rollback-write" : "rollback-dry-run", target: PRODUCTION_DEPLOYMENT, operations: manifest.operations.length };
  }

  const selected = options.only ? APPROVED_MERGES.filter((pair) => pair.slug === options.only) : APPROVED_MERGES;
  if (options.write && selected[0]?.slug === "phosform" && !hasVerifiedReceipt(ledger, mergeOperationId(APPROVED_MERGES[0]))) throw new Error("PHOSFORM is gated on an exact, ledgered LOKA canary receipt.");
  const plan = { artifactType: "approved-contributor-profile-merge-dry-run", schemaVersion: 1, target_deployment: PRODUCTION_DEPLOYMENT, mode: options.write ? "write-requested" : "dry-run", merges: [] };

  for (const pair of selected) {
    const operationId = mergeOperationId(pair);
    ledger = loadLedger(options.ledger);
    if (hasVerifiedReceipt(ledger, operationId)) {
      const receipt = assertExactReceipt(await query(api.contributorProfileMerges.receipt, { apiKey, actor_email: options.actor, operation_id: operationId }), { operationId });
      plan.merges.push({ ...pair, operation_id: operationId, status: "already-applied-readback-verified", item_count: receipt.operation.item_count, payload_digest: receipt.operation.payload_digest });
      continue;
    }

    const existingReceipt = await query(api.contributorProfileMerges.receipt, { apiKey, actor_email: options.actor, operation_id: operationId });
    if (existingReceipt) {
      const receipt = assertExactReceipt(existingReceipt, { operationId });
      appendLedger(options.ledger, ledgerEvent(pair, operationId, "profile-merge-readback-verified", { item_count: receipt.operation.item_count, payload_digest: receipt.operation.payload_digest, recovered_from_server_receipt: true }));
      plan.merges.push({ ...pair, operation_id: operationId, status: "recovered-applied-receipt", item_count: receipt.operation.item_count, payload_digest: receipt.operation.payload_digest });
      continue;
    }

    const preview = await query(api.contributorProfileMerges.preview, { apiKey, actor_email: options.actor, input: previewInput(pair) });
    const input = applyInput(pair, preview.state_digest);
    const dryRun = await mutate(api.contributorProfileMerges.apply, { apiKey, actor_email: options.actor, operation_id: operationId, dry_run: true, input });
    if (!dryRun.dry_run || dryRun.operation_id !== operationId || dryRun.state_digest === preview.state_digest) throw new Error(`Dry-run contract failed for ${pair.target_key}.`);
    const planned = { ...pair, operation_id: operationId, status: options.write ? "dry-run-verified" : "dry-run-only", input, preview, dry_run: dryRun };
    plan.merges.push(planned);
    writeJson(options.planOut, plan);
    if (!options.write) continue;

    appendLedger(options.ledger, ledgerEvent(pair, operationId, "profile-merge-dry-run-verified", { input, preview, result: dryRun }));
    const result = await mutate(api.contributorProfileMerges.apply, { apiKey, actor_email: options.actor, operation_id: operationId, dry_run: false, input });
    appendLedger(options.ledger, ledgerEvent(pair, operationId, "profile-merge-applied", { input, result }));
    const receipt = assertExactReceipt(await query(api.contributorProfileMerges.receipt, { apiKey, actor_email: options.actor, operation_id: operationId }), { operationId, expectedItemCount: result.item_count, expectedPayloadDigest: result.payload_digest });
    appendLedger(options.ledger, ledgerEvent(pair, operationId, "profile-merge-readback-verified", { item_count: receipt.operation.item_count, payload_digest: receipt.operation.payload_digest }));

    // This re-read is the hard canary gate before the loop can reach PHOSFORM.
    if (pair.slug === "loka") assertExactReceipt(await query(api.contributorProfileMerges.receipt, { apiKey, actor_email: options.actor, operation_id: operationId }), { operationId, expectedItemCount: result.item_count, expectedPayloadDigest: result.payload_digest });
  }

  writeJson(options.planOut, plan);
  writeJson(options.rollbackOut, buildRollbackManifest(loadLedger(options.ledger)));
  return { mode: options.write ? "write" : "dry-run", target: PRODUCTION_DEPLOYMENT, merges: plan.merges.map(({ target_key, operation_id, status }) => ({ target_key, operation_id, status })) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) run()
  .then((result) => console.log(JSON.stringify(result, null, 2)))
  .catch((error) => { console.error(error.message); process.exitCode = 1; });

