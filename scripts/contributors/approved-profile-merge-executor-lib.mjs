import { createHash } from "node:crypto";
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";

export const PRODUCTION_DEPLOYMENT = "glad-minnow-656";
export const PINNED_SNAPSHOT_DIGEST = "aea1bbeac1ce5a10e7e3a0981af17b40909c13ecf04fcf49299bbb32f66c2d8d";
export const PINNED_PROFILE_COUNT = 2_119;
export const MERGE_OPERATION = "apply-approved-contributor-profile-merges";
export const ROLLBACK_OPERATION = "rollback-approved-contributor-profile-merges";
export const DEFAULT_CAMPAIGN_DIR = "/Users/josie/Documents/Dose Wiki Media Review/Data/Replication Identity and Social Pass 2026-08-31";
export const DEFAULT_LEDGER = `${DEFAULT_CAMPAIGN_DIR}/approved-contributor-profile-merge-ledger.jsonl`;
export const DEFAULT_PLAN = `${DEFAULT_CAMPAIGN_DIR}/approved-contributor-profile-merge-dry-run.json`;
export const DEFAULT_ROLLBACK_MANIFEST = `${DEFAULT_CAMPAIGN_DIR}/approved-contributor-profile-merge-rollback-manifest.json`;

export const APPROVED_MERGES = Object.freeze([
  Object.freeze({
    order: 1,
    slug: "loka",
    source_profile_id: "kx72vtw19621c4kmbwjt0127558dhbvw",
    source_key: "WHERESSUEDE",
    target_profile_id: "kx77dw7zwgzk9p8byv1b75ny958c9adm",
    target_key: "LOKA",
    applied_at: 1_788_134_400_001,
  }),
  Object.freeze({
    order: 2,
    slug: "phosform",
    source_profile_id: "kx720hr6135j0rb6mdm85r3mc18dgza9",
    source_key: "WOOODFIELD",
    target_profile_id: "kx78gb99p7e7p80q92rrsy5bas8c975b",
    target_key: "PHOSFORM",
    applied_at: 1_788_134_400_002,
  }),
]);

export function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => [key, canonical(item)]));
  return value;
}

export function canonicalJson(value) { return JSON.stringify(canonical(value)); }
export function digest(value) { return createHash("sha256").update(canonicalJson(value)).digest("hex"); }

export function mergeOperationId(pair) {
  return `contributor-profile-merge:v1:${digest({
    source_profile_id: pair.source_profile_id,
    source_key: pair.source_key,
    target_profile_id: pair.target_profile_id,
    target_key: pair.target_key,
    pinned_snapshot_digest: PINNED_SNAPSHOT_DIGEST,
    pinned_snapshot_profile_count: PINNED_PROFILE_COUNT,
  }).slice(0, 32)}`;
}

export function rollbackOperationId(operationId) {
  return `contributor-profile-merge-rollback:v1:${digest({ rollback_of: operationId }).slice(0, 32)}`;
}

export function previewInput(pair) {
  return {
    source_profile_id: pair.source_profile_id,
    source_key: pair.source_key,
    target_profile_id: pair.target_profile_id,
    target_key: pair.target_key,
    pinned_snapshot_digest: PINNED_SNAPSHOT_DIGEST,
    pinned_snapshot_profile_count: PINNED_PROFILE_COUNT,
    expected_state_digest: "0".repeat(64),
    applied_at: pair.applied_at,
  };
}

export function applyInput(pair, stateDigest) {
  if (!/^[a-f0-9]{64}$/.test(stateDigest ?? "")) throw new Error(`Invalid preview state digest for ${pair.target_key}.`);
  return { ...previewInput(pair), expected_state_digest: stateDigest };
}

export function loadLedger(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8").split(/\r?\n/).filter(Boolean).map((line, index) => {
    try { return JSON.parse(line); }
    catch { throw new Error(`Invalid JSON in merge ledger ${path} at line ${index + 1}.`); }
  });
}

export function appendLedger(path, event) {
  appendFileSync(path, `${JSON.stringify(event)}\n`, { encoding: "utf8", flag: "a" });
}

export function hasVerifiedReceipt(ledger, operationId) {
  return ledger.some((event) => event.event === "profile-merge-readback-verified" && event.operation_id === operationId);
}

export function assertExactReceipt(receipt, { operationId, expectedItemCount, expectedPayloadDigest } = {}) {
  if (!receipt) throw new Error(`No authenticated receipt exists for ${operationId}.`);
  if (receipt.operation.operation_id !== operationId) throw new Error(`Receipt operation ID mismatch for ${operationId}.`);
  if (receipt.operation.status !== "applied") throw new Error(`Receipt for ${operationId} is not applied.`);
  if (!receipt.live_matches) throw new Error(`Receipt live-state readback failed for ${operationId}.`);
  if (receipt.checked_items !== receipt.operation.item_count) throw new Error(`Receipt item journal is incomplete for ${operationId}.`);
  if (expectedItemCount !== undefined && receipt.operation.item_count !== expectedItemCount) throw new Error(`Receipt item count mismatch for ${operationId}.`);
  if (expectedPayloadDigest !== undefined && receipt.operation.payload_digest !== expectedPayloadDigest) throw new Error(`Receipt payload digest mismatch for ${operationId}.`);
  return receipt;
}

export function completedAppliedOperations(ledger) {
  const rolledBack = new Set(ledger.filter((event) => event.event === "profile-merge-rollback-readback-verified").map((event) => event.rollback_of));
  const byId = new Map();
  for (const event of ledger) {
    if (event.event !== "profile-merge-readback-verified" || rolledBack.has(event.operation_id)) continue;
    byId.set(event.operation_id, event);
  }
  return [...byId.values()].sort((left, right) => left.order - right.order);
}

export function buildRollbackManifest(ledger) {
  const operations = completedAppliedOperations(ledger).reverse().map((event) => ({
    operation_id: rollbackOperationId(event.operation_id),
    rollback_of: event.operation_id,
    source_key: event.source_key,
    target_key: event.target_key,
    order: event.order,
  }));
  return {
    artifactType: "approved-contributor-profile-merge-rollback-manifest",
    schemaVersion: 1,
    target_deployment: PRODUCTION_DEPLOYMENT,
    operations,
    manifest_sha256: digest({ target_deployment: PRODUCTION_DEPLOYMENT, operations }),
  };
}

export function writeJson(path, value) { writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`); }

