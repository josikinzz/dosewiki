#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { requireCampaignTarget } from "../lib/postgres-target.mjs";
import { createDataClient } from "../../lib/data-client.ts";
import { api } from "../../../lib/postgres/runtime/api.ts"
import { createProductionWriteCommand, requireProductionWriteCredential } from "../../lib/production-write-command.mjs";
import { APPROVED_MERGES, assertExactReceipt, completedAppliedOperations, loadLedger as loadMergeLedger, mergeOperationId } from "../../contributors/approved-profile-merge-executor-lib.mjs";
import { buildExecutionPlan, indexProfiles, loadLedger, validatePinnedProfileSnapshot, verifyDeliveryReceiptSidecar } from "./executor-lib.mjs";
import { activeLedgerOperations, digest, sealReport, validateCompletionEvidence } from "./completion-validator-lib.mjs";
import { assertJosieCorrectionLiveState, JOSIE_PROFILE_ID, JOSIE_REPLACEMENT_AVATAR, JOSIE_RESTORED_AVATAR } from "./josie-profile-correction-lib.mjs";

const CAMPAIGN = "/Users/josie/Documents/Dose Wiki Media Review/Data/Replication Identity and Social Pass 2026-08-31";
const flag = (argv, name) => { const item = argv.find((value) => value.startsWith(`${name}=`)); return item ? item.slice(name.length + 1) : null; };
const flags = (argv, name) => argv.filter((value) => value.startsWith(`${name}=`)).map((value) => value.slice(name.length + 1));
const json = (filename) => JSON.parse(readFileSync(filename, "utf8"));
const sha256File = (filename) => createHash("sha256").update(readFileSync(filename)).digest("hex");

export function parseArgs(argv) {
  return {
    projection: flag(argv, "--projection") ?? `${CAMPAIGN}/identity-social-production-projection.json`,
    profiles: flag(argv, "--profiles") ?? `${CAMPAIGN}/full-production-contributor-profiles-snapshot.json`,
    receipts: flag(argv, "--delivery-receipts") ?? `${CAMPAIGN}/identity-social-delivery-receipts.json`,
    replicationIds: flag(argv, "--replication-ids") ?? `${CAMPAIGN}/full-production-replication-id-map.json`,
    ledger: flag(argv, "--ledger") ?? `${CAMPAIGN}/identity-social-production-ledger.jsonl`,
    profileMergeLedger: flag(argv, "--profile-merge-ledger") ?? `${CAMPAIGN}/approved-contributor-profile-merge-ledger.jsonl`,
    profileCurationLedger: flag(argv, "--profile-curation-ledger") ?? `${CAMPAIGN}/josie-profile-correction-ledger.jsonl`,
    output: flag(argv, "--output") ?? `${CAMPAIGN}/identity-social-production-completion-report.json`,
    actor: flag(argv, "--actor-email"),
    allowedLegacyItemIds: flags(argv, "--allow-legacy-profile-item"),
    maxAttempts: Number(flag(argv, "--max-attempts") ?? 4),
    argv,
  };
}

function sealSupersessionProof(core) {
  const evidenceDigest = digest(core);
  return { ...core, proof_id: `supplemental-supersession:${evidenceDigest.slice(0, 24)}`, evidence_digest: evidenceDigest };
}

export async function collectSupplementalSupersessions({ plan, options, query }) {
  const proofs = [];
  const mergeLedger = loadMergeLedger(options.profileMergeLedger);
  const completedMerges = new Map(completedAppliedOperations(mergeLedger).map((event) => [event.operation_id, event]));
  for (const pair of APPROVED_MERGES) {
    const operationId = mergeOperationId(pair);
    const verifiedEvent = completedMerges.get(operationId);
    if (!verifiedEvent) continue;
    const appliedEvent = mergeLedger.find((event) => event.event === "profile-merge-applied" && event.operation_id === operationId);
    if (!appliedEvent || !Number.isFinite(appliedEvent.at)) throw new Error(`Verified profile merge ${operationId} has no timestamped apply event.`);
    const receipt = assertExactReceipt(await query(api.contributorProfileMerges.receipt, {
      operation_id: operationId,
    }), {
      operationId,
      expectedItemCount: appliedEvent.result?.item_count,
      expectedPayloadDigest: appliedEvent.result?.payload_digest,
    });
    const candidates = plan.entries.filter((entry) => entry.kind === "alias"
      && entry.value?.profile_id === pair.target_profile_id
      && String(entry.value?.normalized_alias ?? "").toLocaleLowerCase("en-US") === pair.source_key.toLocaleLowerCase("en-US"));
    if (candidates.length !== 1) throw new Error(`Profile merge ${operationId} must bind exactly one immutable alias item, found ${candidates.length}.`);
    const evidence = {
      source_profile_id: pair.source_profile_id,
      source_key: pair.source_key,
      target_profile_id: pair.target_profile_id,
      target_key: pair.target_key,
      receipt_payload_digest: receipt.operation.payload_digest,
      receipt_item_count: receipt.operation.item_count,
    };
    proofs.push(sealSupersessionProof({
      proof_kind: "authenticated-profile-merge",
      operation_id: operationId,
      superseded_item_operation_ids: [candidates[0].item_operation_id],
      live_matches: true,
      applied_at: appliedEvent.at,
      evidence,
    }));
  }

  const curationLedger = loadLedger(options.profileCurationLedger);
  const finalReadback = [...curationLedger].reverse().find((event) => event.event === "final-readback-verified");
  const prepared = [...curationLedger].reverse().find((event) => event.event === "correction-prepared" && event.correction?.profileId === JOSIE_PROFILE_ID);
  if (finalReadback && prepared) {
    const avatarApplied = curationLedger.find((event) => event.event === "avatar-applied" && event.result?.operation_id === prepared.correction.avatar.operationId);
    const avatarVerified = curationLedger.find((event) => event.event === "avatar-readback-verified" && event.receipt?.operation_id === prepared.correction.avatar.operationId);
    const linksApplied = curationLedger.find((event) => event.event === "profile-links-applied" && event.result?.operationId === prepared.correction.profile.operationId);
    if (!avatarApplied || !avatarVerified || !linksApplied || !Number.isFinite(finalReadback.at)) throw new Error("Josie final readback lacks its complete append-only apply and authenticated receipt chain.");
    const avatarReceipt = await query(api.replicationIdentitySocial.getOperationCompletionReceiptAuthenticated, {
      operation_id: prepared.correction.avatar.operationId,
    });
    if (!avatarReceipt?.all_live_match || avatarReceipt.payload_digest !== avatarApplied.result.payload_digest
      || avatarReceipt.items_digest !== avatarVerified.receipt.items_digest) throw new Error("Josie authenticated avatar correction receipt is incomplete or drifted.");
    const liveCuration = await query(api.replicationIdentitySocial.getProfileCurationReadbackAuthenticated, {
      profile_id: JOSIE_PROFILE_ID,
      history_digests: [JOSIE_REPLACEMENT_AVATAR.sha256, JOSIE_RESTORED_AVATAR.sha256],
    });
    assertJosieCorrectionLiveState(liveCuration, prepared.correction);
    const candidates = plan.entries.filter((entry) => entry.kind === "avatar"
      && entry.value?.profile_id === JOSIE_PROFILE_ID
      && entry.value?.media_digest === JOSIE_REPLACEMENT_AVATAR.sha256);
    if (candidates.length !== 1) throw new Error(`Josie curation must supersede exactly one immutable avatar item, found ${candidates.length}.`);
    const evidence = {
      profile_id: JOSIE_PROFILE_ID,
      superseded_media_digest: JOSIE_REPLACEMENT_AVATAR.sha256,
      current_media_digest: JOSIE_RESTORED_AVATAR.sha256,
      avatar_operation_id: prepared.correction.avatar.operationId,
      profile_operation_id: prepared.correction.profile.operationId,
      current_links: liveCuration.profile.links,
    };
    proofs.push(sealSupersessionProof({
      proof_kind: "authenticated-profile-curation",
      operation_id: prepared.correction.profile.operationId,
      superseded_item_operation_ids: [candidates[0].item_operation_id],
      live_matches: true,
      applied_at: finalReadback.at,
      evidence,
    }));
  }
  return proofs;
}

function transient(error) {
  const code = String(error?.code ?? error?.cause?.code ?? "").toUpperCase();
  const message = String(error?.message ?? error ?? "").toLowerCase();
  return ["ECONNRESET", "ECONNREFUSED", "EPIPE", "ETIMEDOUT", "UND_ERR_SOCKET", "UND_ERR_CONNECT_TIMEOUT"].includes(code)
    || /http\/2|goaway|connection (?:closed|reset)|fetch failed|network error|socket hang up|terminated/.test(message);
}

async function withRetry(action, recreate, attempts, label) {
  let last;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try { return await action(); } catch (error) {
      if (!transient(error)) throw error;
      last = error; recreate();
    }
  }
  throw new Error(`${label} unavailable after ${attempts} attempts: ${last?.message ?? last}`);
}

export async function run(argv = process.argv.slice(2), adapters = {}) {
  const options = parseArgs(argv);
  if (!options.actor) throw new Error("--actor-email is required for authenticated read-only validation.");
  if (!Number.isInteger(options.maxAttempts) || options.maxAttempts < 1 || options.maxAttempts > 10) throw new Error("--max-attempts must be 1 through 10.");
  const command = createProductionWriteCommand({ operation: "validate-identity-social-production", argv: options.argv });
  requireCampaignTarget(command);
  const projection = json(options.projection);
  const profileRows = validatePinnedProfileSnapshot(json(options.profiles));
  const sidecarDocument = json(options.receipts);
  const verifiedSidecar = verifyDeliveryReceiptSidecar(projection, sidecarDocument, sidecarDocument.receiptSidecarSha256);
  const plan = buildExecutionPlan(projection, {
    profiles: indexProfiles(profileRows), receipts: verifiedSidecar.receipts,
    receiptSidecarDigest: verifiedSidecar.receiptSidecarSha256,
    replicationIds: json(options.replicationIds), expectedProjectionDigest: projection.projectionSha256,
  });
  const ledger = loadLedger(options.ledger);
  const { active } = activeLedgerOperations(ledger);
  const apiKey = adapters.apiKey ?? requireProductionWriteCredential("replicationMaintenance").token;
  let client = adapters.client ?? createDataClient({ target: command.targetUrl }).client;
  const recreate = () => { client = adapters.createClient ? adapters.createClient(command.targetUrl) : createDataClient({ target: command.targetUrl }).client; };
  const queryRef = (queryReference, args) => adapters.query
    ? adapters.query(queryReference, { apiKey, actor_email: options.actor, ...args })
    : client.query(queryReference, { apiKey, actor_email: options.actor, ...args });
  const query = (args) => queryRef(api.replicationIdentitySocial.getOperationCompletionReceiptAuthenticated, args);
  const completionReceipts = [];
  for (const [index, operation] of active.entries()) {
    const receipt = await withRetry(
      () => query({ operation_id: operation.operation_id }),
      recreate, options.maxAttempts, `Completion receipt ${operation.operation_id}`,
    );
    if (!receipt) throw new Error(`Production operation ${operation.operation_id} is absent.`);
    completionReceipts.push(receipt);
    if (!adapters.quiet && (index + 1) % 25 === 0) console.error(`Validated ${index + 1}/${active.length} operation receipts.`);
  }
  const supplementalQuery = (queryReference, args) => withRetry(
    () => queryRef(queryReference, args), recreate, options.maxAttempts, "Supplemental authenticated completion evidence",
  );
  const supplementalSupersessions = await collectSupplementalSupersessions({ plan, options, query: supplementalQuery });
  const report = sealReport(validateCompletionEvidence({
    projection, plan, ledger, receipts: completionReceipts, ledgerSha256: sha256File(options.ledger),
    allowedLegacyItemIds: options.allowedLegacyItemIds,
    supplementalSupersessions,
    supplementalLedgerSha256: {
      profileMerge: sha256File(options.profileMergeLedger),
      profileCuration: sha256File(options.profileCurationLedger),
    },
  }));
  writeFileSync(options.output, `${JSON.stringify(report, null, 2)}\n`);
  if (!report.complete) throw new Error(`Completion validation failed; inspect ${options.output}.`);
  return report;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) run()
  .then((report) => console.log(JSON.stringify({ complete: report.complete, reportSha256: report.reportSha256, output: parseArgs(process.argv.slice(2)).output }, null, 2)))
  .catch((error) => { console.error(error.message); process.exitCode = 1; });
