#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api.js";
import {
  assertProductionWriteAllowed,
  createProductionWriteCommand,
  printProductionWriteCommand,
  requireProductionWriteCredential,
} from "../lib/production-write-command.mjs";

const OPERATION = "apply-live-taxonomy-cas-repair";
const EXACT_TARGET = "https://glad-minnow-656.convex.cloud";
const EXACT_DEPLOYMENT = "glad-minnow-656";
const DEFAULT_PLAN_PATH =
  "/Users/josie/Documents/Dose Wiki Media Review/Data/Replication Index Campaign 2026-08-30/live-taxonomy-cas-repair-plan-superseding-2026-08-31.json";
const PLAN_FILE_SHA256 = "825edc0a3e888e0e97cd355911c0b4c71a28f07a3bf7036fec4ac3ba5a4975bf";
const DECLARED_PLAN_SHA256 = "221f9c32abcbb6bf9785fd9582b274d037178c3cb840992a58e553838db80cfa";

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, stable(nested)]),
    );
  }
  return value;
}

export function digestValue(value) {
  const bytes = typeof value === "string" || Buffer.isBuffer(value)
    ? value
    : JSON.stringify(stable(value));
  return createHash("sha256").update(bytes).digest("hex");
}

function flagValue(argv, name) {
  const prefix = `${name}=`;
  const equalsEntry = argv.find((entry) => entry.startsWith(prefix));
  if (equalsEntry) return equalsEntry.slice(prefix.length);
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] ?? null : null;
}

function normalizeSharedCommandArgv(argv) {
  const valueFlags = new Set([
    "--target-url",
    "--confirm-write",
    "--expected-deployment",
  ]);
  const normalized = [];
  for (let index = 0; index < argv.length; index += 1) {
    const entry = argv[index];
    if (valueFlags.has(entry) && argv[index + 1] && !argv[index + 1].startsWith("--")) {
      normalized.push(`${entry}=${argv[index + 1]}`);
      index += 1;
    } else {
      normalized.push(entry);
    }
  }
  return normalized;
}

function required(condition, message) {
  if (!condition) throw new Error(message);
}

function assertString(value, label) {
  required(typeof value === "string" && value.length > 0, `${label} must be a nonempty string.`);
}

function validateExpected(repair) {
  const identity = repair.expected?.identity;
  const value = repair.expected?.value;
  required(identity && value, `${repair.productionId}: expected identity/value are required.`);
  for (const field of ["_id", "slug", "title", "artist", "type"]) {
    assertString(identity[field], `${repair.productionId}: expected.identity.${field}`);
  }
  required(identity._id === repair.productionId, `${repair.productionId}: identity ID drift.`);
  required(identity.storage_id === null || typeof identity.storage_id === "string", `${repair.productionId}: invalid storage_id.`);
  required(identity.r2_key === null || typeof identity.r2_key === "string", `${repair.productionId}: invalid r2_key.`);
  required(/^[a-f0-9]{64}$/.test(repair.expected.liveRowSha256 ?? ""), `${repair.productionId}: invalid live row hash.`);
  required(value.effect_slug === null || typeof value.effect_slug === "string", `${repair.productionId}: invalid current owner.`);
  required(Array.isArray(value.effect_tags), `${repair.productionId}: current effect_tags must be an array.`);
  required(value.replication_status === "replication", `${repair.productionId}: only replication rows are eligible.`);
  for (const field of ["taxonomy_record_key", "taxonomy_source_digest"]) {
    required(value[field] === null || typeof value[field] === "string", `${repair.productionId}: invalid ${field}.`);
  }
  for (const field of ["taxonomy_version", "taxonomy_updated_at"]) {
    required(value[field] === null || typeof value[field] === "number", `${repair.productionId}: invalid ${field}.`);
  }
  required(
    JSON.stringify(repair.rollback?.value) === JSON.stringify(value),
    `${repair.productionId}: rollback must preserve the exact expected current value.`,
  );
}

function currentIdentity(row) {
  return {
    _id: row._id,
    slug: row.slug,
    title: row.title,
    artist: row.artist,
    type: row.type,
    storage_id: row.storage_id ?? null,
    r2_key: row.r2_key ?? null,
  };
}

function currentValue(row) {
  return {
    effect_slug: row.effect_slug ?? null,
    effect_tags: row.effect_tags ?? [],
    replication_status: row.replication_status ?? null,
    taxonomy_record_key: row.taxonomy_record_key ?? null,
    taxonomy_source_digest: row.taxonomy_source_digest ?? null,
    taxonomy_version: row.taxonomy_version ?? null,
    taxonomy_updated_at: row.taxonomy_updated_at ?? null,
  };
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function atomicWriteJson(filePath, value) {
  const temporaryPath = `${filePath}.tmp-${process.pid}`;
  writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  renameSync(temporaryPath, filePath);
}

function newLedger({ planPath, plan, resolved }) {
  const canaryId = resolved[0].productionId;
  return {
    schemaVersion: 1,
    artifactType: "replication-index-live-taxonomy-cas-repair-ledger",
    target: EXACT_TARGET,
    deployment: EXACT_DEPLOYMENT,
    planPath,
    planFileSha256: PLAN_FILE_SHA256,
    declaredPlanSha256: plan.planSha256,
    canaryProductionId: canaryId,
    items: Object.fromEntries(resolved.map((repair) => [repair.productionId, {
      phase: repair.productionId === canaryId ? "canary" : "remaining",
      status: "pending",
      expectedLiveRowSha256: repair.expected.liveRowSha256,
      intended: repair.intended.value,
    }])),
  };
}

function loadLedger({ ledgerPath, planPath, plan, resolved, expectedPlanFileSha256 }) {
  if (!existsSync(ledgerPath)) {
    const ledger = newLedger({ planPath, plan, resolved });
    ledger.planFileSha256 = expectedPlanFileSha256;
    return ledger;
  }
  const ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
  required(ledger.artifactType === "replication-index-live-taxonomy-cas-repair-ledger", "Existing ledger has the wrong artifact type.");
  required(ledger.target === EXACT_TARGET && ledger.deployment === EXACT_DEPLOYMENT, "Existing ledger target drifted.");
  required(path.resolve(ledger.planPath) === planPath, "Existing ledger belongs to another plan path.");
  required(ledger.planFileSha256 === expectedPlanFileSha256, "Existing ledger plan file digest drifted.");
  required(ledger.declaredPlanSha256 === plan.planSha256, "Existing ledger declared plan digest drifted.");
  const expectedIds = resolved.map((repair) => repair.productionId).sort();
  required(sameJson(Object.keys(ledger.items ?? {}).sort(), expectedIds), "Existing ledger row coverage drifted.");
  for (const repair of resolved) {
    const item = ledger.items[repair.productionId];
    required(item.expectedLiveRowSha256 === repair.expected.liveRowSha256, `${repair.productionId}: ledger CAS hash drifted.`);
    required(sameJson(item.intended, repair.intended.value), `${repair.productionId}: ledger intended value drifted.`);
  }
  return ledger;
}

function assertLivePrecondition(row, repair) {
  required(row, `${repair.productionId}: live row is missing.`);
  required(digestValue(row) === repair.expected.liveRowSha256, `${repair.productionId}: full live row SHA-256 drifted.`);
  required(sameJson(currentIdentity(row), repair.expected.identity), `${repair.productionId}: live identity drifted.`);
  required(sameJson(currentValue(row), repair.expected.value), `${repair.productionId}: live current value drifted.`);
}

function assertReadback(row, repair) {
  required(row, `${repair.productionId}: readback row is missing.`);
  required(sameJson(currentIdentity(row), repair.expected.identity), `${repair.productionId}: identity changed during write.`);
  const value = currentValue(row);
  required(value.effect_slug === repair.intended.value.effect_slug, `${repair.productionId}: owner readback mismatch.`);
  required(sameJson(value.effect_tags, repair.intended.value.effect_tags), `${repair.productionId}: tag readback mismatch.`);
  for (const field of [
    "replication_status",
    "taxonomy_record_key",
    "taxonomy_source_digest",
    "taxonomy_version",
    "taxonomy_updated_at",
  ]) {
    required(value[field] === repair.expected.value[field], `${repair.productionId}: ${field} changed during write.`);
  }
}

export function validatePinnedPlan(plan) {
  required(plan?.schemaVersion === 2, "Expected superseding CAS plan schema version 2.");
  required(plan.artifactType === "replication-index-live-taxonomy-cas-repair-plan", "Unexpected CAS plan artifact type.");
  required(plan.status === "superseding-plan-only", "CAS plan must be superseding-plan-only.");
  required(plan.target?.url === EXACT_TARGET, `CAS plan target must be ${EXACT_TARGET}.`);
  required(plan.target?.deployment === EXACT_DEPLOYMENT, `CAS plan deployment must be ${EXACT_DEPLOYMENT}.`);
  const core = { ...plan };
  delete core.planSha256;
  required(plan.planSha256 === digestValue(core), "CAS plan declared planSha256 does not match its content.");
  required(plan.counts?.liveOwningEffectGaps === 13, "CAS plan must cover exactly 13 live gaps.");
  required(plan.counts?.resolvedLiveRepairs === 10, "CAS plan must contain exactly 10 resolved live repairs.");
  required(plan.counts?.blockedLiveRepairs === 3, "CAS plan must contain exactly 3 blocked live repairs.");
  required(plan.counts?.resolvedLocalRepairs === 1, "CAS plan must preserve the one local-only repair.");
  for (const field of [
    "productionWrites",
    "convexMutations",
    "uploads",
    "deletions",
    "sourceMediaModifications",
  ]) {
    required(plan.safety?.[field] === 0, `CAS plan safety.${field} must be zero.`);
  }
  for (const [field, value] of Object.entries(plan.safety ?? {})) {
    if (typeof value === "number") required(value === 0, `CAS plan safety.${field} must be zero.`);
  }
  required(Array.isArray(plan.liveRepairs) && plan.liveRepairs.length === 13, "CAS plan must have 13 live repair records.");
  required(new Set(plan.liveRepairs.map((repair) => repair.productionId)).size === 13, "CAS plan has duplicate production IDs.");

  const resolved = [];
  const blocked = [];
  for (const repair of plan.liveRepairs) {
    validateExpected(repair);
    if (repair.status === "resolved-plan-only") {
      required(repair.action === "compare-and-set-effect-owner", `${repair.productionId}: resolved action is not CAS.`);
      assertString(repair.intended?.value?.effect_slug, `${repair.productionId}: intended effect owner`);
      required(Array.isArray(repair.intended.value.effect_tags), `${repair.productionId}: intended tags must be an array.`);
      required(new Set(repair.intended.value.effect_tags).size === repair.intended.value.effect_tags.length, `${repair.productionId}: intended tags are duplicated.`);
      resolved.push(repair);
    } else if (repair.status === "blocked") {
      required(repair.action === "no-write" && repair.intended === null, `${repair.productionId}: blocked row is writable.`);
      blocked.push(repair);
    } else {
      throw new Error(`${repair.productionId}: unsupported live repair status ${String(repair.status)}.`);
    }
  }
  required(resolved.length === 10 && blocked.length === 3, "CAS plan resolved/blocked record totals drifted.");
  resolved.sort((left, right) => left.productionId.localeCompare(right.productionId));
  blocked.sort((left, right) => left.productionId.localeCompare(right.productionId));
  return { resolved, blocked };
}

export async function runLiveTaxonomyCasRepair({
  argv = process.argv.slice(2),
  env = process.env,
  expectedPlanPath = DEFAULT_PLAN_PATH,
  expectedPlanFileSha256 = PLAN_FILE_SHA256,
  expectedDeclaredPlanSha256 = DECLARED_PLAN_SHA256,
  clientFactory = (url) => new ConvexHttpClient(url),
  logger = console,
} = {}) {
  const planPath = path.resolve(flagValue(argv, "--plan") ?? DEFAULT_PLAN_PATH);
  required(planPath === path.resolve(expectedPlanPath), `Executor is pinned to exact plan path ${path.resolve(expectedPlanPath)}.`);
  const planBytes = readFileSync(planPath);
  required(digestValue(planBytes) === expectedPlanFileSha256, "Pinned CAS plan file SHA-256 mismatch.");
  const plan = JSON.parse(planBytes.toString("utf8"));
  required(plan.planSha256 === expectedDeclaredPlanSha256, "Pinned CAS plan declared digest mismatch.");
  const { resolved, blocked } = validatePinnedPlan(plan);
  const phase = flagValue(argv, "--phase") ?? "canary";
  required(phase === "canary" || phase === "remaining", "--phase must be canary or remaining.");
  const selected = phase === "canary" ? resolved.slice(0, 1) : resolved.slice(1);

  const command = createProductionWriteCommand({
    operation: OPERATION,
    argv: normalizeSharedCommandArgv(argv),
    env,
    loadsEnvLocal: false,
  });
  printProductionWriteCommand(command, { logger });
  logger.log(`Pinned plan: ${planPath}`);
  logger.log(`Plan file SHA-256: ${expectedPlanFileSha256}`);
  logger.log(`Declared plan SHA-256: ${expectedDeclaredPlanSha256}`);
  logger.log(`Phase: ${phase}; selected ${selected.length}; blocked no-write ${blocked.length}`);

  if (command.dryRun) {
    return {
      mode: "dry-run",
      phase,
      selected: selected.length,
      selectedProductionIds: selected.map((repair) => repair.productionId),
      resolved: resolved.length,
      blocked: blocked.length,
      networkCalls: 0,
    };
  }
  assertProductionWriteAllowed(command);
  required(command.targetUrl === EXACT_TARGET, `Write target must be exactly ${EXACT_TARGET}.`);
  required(command.deploymentFingerprint === EXACT_DEPLOYMENT, `Write deployment must be exactly ${EXACT_DEPLOYMENT}.`);
  const credential = requireProductionWriteCredential("replicationMaintenance", { env });
  required(credential.source === "scoped", "Write requires the scoped replicationMaintenance credential; legacy admin key fallback is disabled.");
  required(typeof clientFactory === "function", "Write-mode client adapter is not configured.");

  const ledgerPath = path.resolve(
    flagValue(argv, "--ledger")
      ?? path.join(path.dirname(planPath), "live-taxonomy-cas-repair-ledger.json"),
  );
  const ledger = loadLedger({
    ledgerPath,
    planPath,
    plan,
    resolved,
    expectedPlanFileSha256,
  });
  const uncertain = Object.entries(ledger.items)
    .filter(([, item]) => item.status === "uncertain")
    .map(([productionId]) => productionId);
  required(uncertain.length === 0, `Ledger contains uncertain outcomes and cannot auto-retry: ${uncertain.join(", ")}.`);

  const canaryId = resolved[0].productionId;
  if (phase === "remaining") {
    required(ledger.items[canaryId].status === "verified", "Remaining phase requires a separately verified canary ledger entry.");
  }
  atomicWriteJson(ledgerPath, ledger);
  const client = clientFactory(command.targetUrl);
  let verified = 0;
  let networkCalls = 0;

  for (const repair of selected) {
    const ledgerItem = ledger.items[repair.productionId];
    if (ledgerItem.status === "verified") continue;
    required(ledgerItem.status === "pending", `${repair.productionId}: ledger status ${ledgerItem.status} is not resumable.`);

    const before = await client.query(api.replications.getStoredForTaxonomyCas, {
      apiKey: credential.token,
      id: repair.productionId,
    });
    networkCalls += 1;
    assertLivePrecondition(before, repair);

    ledgerItem.status = "uncertain";
    ledgerItem.reason = "mutation-dispatched-outcome-pending";
    ledgerItem.dispatchedAt = new Date().toISOString();
    atomicWriteJson(ledgerPath, ledger);
    try {
      const mutationResult = await client.mutation(
        api.replications.compareAndSetEffectTaxonomy,
        {
          apiKey: credential.token,
          id: repair.productionId,
          expected: {
            identity: repair.expected.identity,
            value: repair.expected.value,
          },
          intended: repair.intended.value,
        },
      );
      networkCalls += 1;
      required(
        mutationResult?.success === true
          && mutationResult.id === repair.productionId
          && mutationResult.slug === repair.expected.identity.slug
          && mutationResult.effect_slug === repair.intended.value.effect_slug
          && sameJson(mutationResult.effect_tags, repair.intended.value.effect_tags),
        `${repair.productionId}: mutation response mismatch.`,
      );

      const after = await client.query(api.replications.getStoredForTaxonomyCas, {
        apiKey: credential.token,
        id: repair.productionId,
      });
      networkCalls += 1;
      assertReadback(after, repair);
      ledgerItem.status = "verified";
      ledgerItem.reason = "exact-readback-verified";
      ledgerItem.verifiedAt = new Date().toISOString();
      ledgerItem.readback = {
        identity: currentIdentity(after),
        value: currentValue(after),
      };
      atomicWriteJson(ledgerPath, ledger);
      verified += 1;
    } catch (error) {
      ledgerItem.status = "uncertain";
      ledgerItem.reason = "mutation-or-readback-outcome-uncertain";
      const errorText = error instanceof Error ? error.message : String(error);
      ledgerItem.errorClass = error instanceof Error ? error.name : "UnknownError";
      ledgerItem.errorDigestSha256 = digestValue(errorText);
      atomicWriteJson(ledgerPath, ledger);
      throw new Error(
        `${repair.productionId}: uncertain write outcome; stopped without retry. Inspect live state and ledger before any recovery.`,
        { cause: error },
      );
    }
  }

  return {
    mode: "write",
    phase,
    selected: selected.length,
    selectedProductionIds: selected.map((repair) => repair.productionId),
    resolved: resolved.length,
    blocked: blocked.length,
    verified,
    networkCalls,
    ledgerPath,
  };
}

async function main() {
  const result = await runLiveTaxonomyCasRepair();
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
