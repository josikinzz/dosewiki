#!/usr/bin/env node

/** Copy frozen local derivatives to the existing R2 bucket in resumable batches. */

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const OPERATION = "upload-local-r2-media";
const REMOTE_ROOT = "replications-r2:replications";
const SHA256 = /^[0-9a-f]{64}$/;

async function sha256FileStreaming(filename) {
  const hash = createHash("sha256");
  for await (const chunk of fs.createReadStream(filename)) hash.update(chunk);
  return hash.digest("hex");
}

function sha256File(filename) {
  return createHash("sha256").update(fs.readFileSync(filename)).digest("hex");
}

function flagValue(argv, name) {
  const inline = argv.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

function hasFlag(argv, name) {
  return argv.includes(name);
}

function writeJsonAtomic(filename, value) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const part = `${filename}.part`;
  fs.writeFileSync(part, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(part, filename);
}

function readJsonLines(filename) {
  if (!fs.existsSync(filename)) return [];
  return fs.readFileSync(filename, "utf8").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

function refreshSummary(ledger) {
  const batches = Object.values(ledger.batches);
  ledger.summary = {
    batches: batches.length,
    pendingBatches: batches.filter((batch) => batch.status === "pending").length,
    failedBatches: batches.filter((batch) => batch.status === "failed").length,
    verifiedBatches: batches.filter((batch) => batch.status === "verified").length,
    verifiedObjects: batches.filter((batch) => batch.status === "verified").reduce((sum, batch) => sum + batch.objectCount, 0),
    verifiedBytes: batches.filter((batch) => batch.status === "verified").reduce((sum, batch) => sum + batch.byteSize, 0),
  };
}

export function createUploadLedger(plan, { planPath, planSha256 }) {
  if (!plan.readyToUpload) throw new Error("Upload plan is not ready");
  if (plan.remoteRoot !== REMOTE_ROOT) throw new Error(`Unexpected remote root: ${plan.remoteRoot}`);
  if (!path.isAbsolute(plan.outputRoot ?? "")) throw new Error("Upload-plan outputRoot must be absolute");
  if (!path.isAbsolute(plan.uploadRoot ?? "")) throw new Error("Upload-plan uploadRoot must be absolute");
  if (!SHA256.test(planSha256 ?? "")) throw new Error("A valid upload-plan SHA-256 pin is required");
  const ledger = {
    schemaVersion: 1,
    artifactType: "replication-index-local-r2-upload-ledger",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    plan: { path: path.resolve(planPath), sha256: planSha256 },
    sourceRoot: plan.uploadRoot,
    remoteRoot: REMOTE_ROOT,
    batches: Object.fromEntries(plan.batches.map((batch) => [batch.id, {
      id: batch.id,
      objectCount: batch.objectCount,
      byteSize: batch.byteSize,
      filesFromPath: batch.filesFromPath,
      status: "pending",
      attempts: 0,
    }])),
    summary: {},
    safety: { copyOnly: true, delete: false, sourceWrites: 0, databaseWrites: 0 },
  };
  refreshSummary(ledger);
  return ledger;
}

export function markBatchVerified(ledger, plan, batchId, planSha256, verifiedAt = new Date().toISOString()) {
  const state = ledger.batches[batchId];
  if (!state) throw new Error(`Unknown ledger batch: ${batchId}`);
  if (state.status === "verified") return [];
  const batch = plan.batches.find((candidate) => candidate.id === batchId);
  if (!batch) throw new Error(`Unknown plan batch: ${batchId}`);
  const byKey = new Map(plan.objects.map((object) => [object.key, object]));
  const results = batch.keys.map((key) => {
    const object = byKey.get(key);
    if (!object) throw new Error(`Batch ${batchId} references unknown object ${key}`);
    return {
      key: object.key,
      sha256: object.sha256,
      size: object.byteSize,
      contentType: object.contentType,
      plan_sha256: planSha256,
      batch_id: batchId,
      status: "uploaded-or-confirmed",
      verified_at: verifiedAt,
    };
  });
  Object.assign(state, { status: "verified", verifiedAt, error: null });
  ledger.updatedAt = verifiedAt;
  refreshSummary(ledger);
  return results;
}

export async function validateBatchSources(plan, batch, { concurrency = 3 } = {}) {
  const byKey = new Map(plan.objects.map((object) => [object.key, object]));
  const filesFromKeys = fs.readFileSync(batch.filesFromPath, "utf8").split(/\r?\n/).filter(Boolean);
  if (JSON.stringify(filesFromKeys) !== JSON.stringify(batch.keys)) {
    throw new Error(`Files-from drift for ${batch.id}`);
  }
  let cursor = 0;
  let verifiedBytes = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, batch.keys.length) }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= batch.keys.length) return;
      const key = batch.keys[index];
      const object = byKey.get(key);
      if (!object) throw new Error(`Batch ${batch.id} references unknown object ${key}`);
      if (path.resolve(object.stagedPath) !== path.resolve(plan.uploadRoot, key)) {
        throw new Error(`Staged path drift for ${key}`);
      }
      const staged = fs.lstatSync(object.stagedPath);
      if (!staged.isSymbolicLink()) throw new Error(`Staged path is not a symlink for ${key}`);
      const target = path.resolve(path.dirname(object.stagedPath), fs.readlinkSync(object.stagedPath));
      if (target !== path.resolve(object.localPath)) throw new Error(`Staged symlink target drift for ${key}`);
      const stat = fs.statSync(object.localPath);
      if (!stat.isFile() || stat.size !== object.byteSize) throw new Error(`Pre-copy size mismatch for ${key}`);
      const actualSha256 = await sha256FileStreaming(object.localPath);
      if (actualSha256 !== object.sha256) throw new Error(`Pre-copy SHA-256 mismatch for ${key}`);
      verifiedBytes += object.byteSize;
    }
  }));
  return { verifiedObjects: batch.objectCount, verifiedBytes };
}

export function validateExistingResults(plan, ledger, records, planSha256) {
  const objects = new Map(plan.objects.map((object) => [object.key, object]));
  const batchByKey = new Map(plan.batches.flatMap((batch) => batch.keys.map((key) => [key, batch.id])));
  const results = new Map();
  for (const record of records) {
    if (record.plan_sha256 !== planSha256) throw new Error(`Result ${record.key} belongs to a different plan`);
    const object = objects.get(record.key);
    if (!object) throw new Error(`Result references an object outside the plan: ${record.key}`);
    if (record.sha256 !== object.sha256 || record.size !== object.byteSize || record.contentType !== object.contentType || record.batch_id !== batchByKey.get(record.key)) {
      throw new Error(`Result metadata drift for ${record.key}`);
    }
    if (results.has(record.key)) throw new Error(`Duplicate result record for ${record.key}`);
    results.set(record.key, record);
  }
  for (const batch of plan.batches) {
    if (ledger.batches[batch.id]?.status !== "verified") continue;
    for (const key of batch.keys) if (!results.has(key)) throw new Error(`Verified batch ${batch.id} is missing result ${key}`);
  }
  return results;
}

export function validatePublicCanaryReceipt(plan, records, planSha256) {
  const byKey = new Map(records.map((record) => [record.key, record]));
  const objects = new Map(plan.objects.map((object) => [object.key, object]));
  for (const key of plan.uploadCanary?.keys ?? []) {
    const object = objects.get(key);
    const record = byKey.get(key);
    if (!record) throw new Error(`Canary key is missing public verification: ${key}`);
    if (record.plan_sha256 !== planSha256 || record.sha256 !== object.sha256 || record.size !== object.byteSize || record.contentType !== object.contentType) {
      throw new Error(`Public canary receipt drift for ${key}`);
    }
    const headers = record.delivery_headers ?? {};
    if (headers.content_type !== object.contentType || !/(?:^|,)\s*no-store\s*(?:,|$)/i.test(headers.cache_control ?? "") || !/^inline(?:;|$)/i.test(headers.content_disposition ?? "") || headers.accept_ranges !== "bytes") {
      throw new Error(`Public canary delivery contract failed for ${key}`);
    }
  }
  return { verifiedCanaryObjects: plan.uploadCanary?.keys?.length ?? 0 };
}

export function rcloneCommands(plan, batch, { logPath }) {
  if (plan.remoteRoot !== REMOTE_ROOT) throw new Error(`Unexpected remote root: ${plan.remoteRoot}`);
  const common = [
    "--files-from", batch.filesFromPath,
    "--no-traverse",
    "--checkers", "6",
    "--retries", "8",
    "--low-level-retries", "20",
    "--log-file", logPath,
    "--log-level", "INFO",
    "--stats", "30s",
    "--stats-one-line",
  ];
  return {
    copy: [
      "copy", plan.uploadRoot, REMOTE_ROOT,
      ...common,
      "--copy-links",
      "--immutable",
      "--metadata",
      "--transfers", "3",
      "--s3-upload-cutoff", "100Mi",
      "--s3-chunk-size", "100Mi",
    ],
    check: [
      "check", plan.uploadRoot, REMOTE_ROOT,
      ...common,
      "--copy-links",
      "--download",
      "--one-way",
    ],
  };
}

function runRclone(args, label) {
  const result = spawnSync("rclone", args, { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${label} exited ${result.status}`);
}

async function main() {
  const argv = process.argv.slice(2);
  const planPath = flagValue(argv, "--plan");
  const expectedPlanSha = flagValue(argv, "--expected-plan-sha");
  if (!planPath || !expectedPlanSha) {
    throw new Error(`Usage: --plan <plan.json> --expected-plan-sha <sha256> [--write --confirm-write=${OPERATION}]`);
  }
  const actualPlanSha = sha256File(planPath);
  if (actualPlanSha !== expectedPlanSha) {
    throw new Error(`Upload-plan SHA mismatch: expected ${expectedPlanSha}, got ${actualPlanSha}`);
  }
  const plan = JSON.parse(fs.readFileSync(planPath, "utf8"));
  if (!plan.readyToUpload) throw new Error("Upload plan is not ready");
  if (plan.remoteRoot !== REMOTE_ROOT) throw new Error(`Unexpected remote root: ${plan.remoteRoot}`);
  const root = path.dirname(path.resolve(planPath));
  const ledgerPath = path.resolve(flagValue(argv, "--ledger") ?? path.join(root, "upload-ledger.json"));
  const resultsPath = path.resolve(flagValue(argv, "--results") ?? path.join(root, "copy-results.jsonl"));
  const logsRoot = path.resolve(flagValue(argv, "--logs") ?? path.join(root, "logs"));
  const limitBatches = Number(flagValue(argv, "--limit-batches") ?? Number.POSITIVE_INFINITY);
  const publicVerificationPath = flagValue(argv, "--public-verification-results");

  let ledger;
  if (fs.existsSync(ledgerPath)) {
    ledger = JSON.parse(fs.readFileSync(ledgerPath, "utf8"));
    if (ledger.plan?.sha256 !== actualPlanSha) throw new Error("Existing upload ledger belongs to a different plan");
  } else {
    ledger = createUploadLedger(plan, { planPath, planSha256: actualPlanSha });
    writeJsonAtomic(ledgerPath, ledger);
  }
  console.log(JSON.stringify({ plan: plan.summary, progress: ledger.summary, r2WritesAuthorized: hasFlag(argv, "--write") }, null, 2));
  if (!hasFlag(argv, "--write")) {
    console.log(`Dry run only. Re-run with --write --confirm-write=${OPERATION}.`);
    return;
  }
  if (flagValue(argv, "--confirm-write") !== OPERATION) {
    throw new Error(`Refusing R2 writes without --confirm-write=${OPERATION}`);
  }
  if (!Number.isInteger(limitBatches) || limitBatches < 1) throw new Error("--limit-batches must be a positive integer");

  fs.mkdirSync(logsRoot, { recursive: true });
  fs.mkdirSync(path.dirname(resultsPath), { recursive: true });
  const recordedKeys = validateExistingResults(plan, ledger, readJsonLines(resultsPath), actualPlanSha);
  const canaryBatch = plan.batches.find((batch) => batch.canary === true);
  if (!canaryBatch) throw new Error("Upload plan has no canary batch");
  const canaryPending = ledger.batches[canaryBatch.id]?.status !== "verified";
  if (canaryPending && limitBatches !== 1) {
    throw new Error("The first R2 write must use --limit-batches=1 for the canary only");
  }
  if (!canaryPending) {
    if (!publicVerificationPath) throw new Error("Remaining R2 batches require --public-verification-results from the public canary check");
    validatePublicCanaryReceipt(plan, readJsonLines(publicVerificationPath), actualPlanSha);
  }
  const eligible = canaryPending ? [canaryBatch] : plan.batches.filter((batch) => batch.id !== canaryBatch.id);
  const pending = eligible.filter((batch) => ledger.batches[batch.id]?.status !== "verified").slice(0, limitBatches);
  for (const batch of pending) {
    const state = ledger.batches[batch.id];
    const sourceVerification = await validateBatchSources(plan, batch);
    state.sourceVerification = { ...sourceVerification, verifiedAt: new Date().toISOString() };
    state.attempts += 1;
    state.status = "copying";
    state.startedAt = new Date().toISOString();
    state.error = null;
    ledger.updatedAt = state.startedAt;
    refreshSummary(ledger);
    writeJsonAtomic(ledgerPath, ledger);
    const logPath = path.join(logsRoot, `${batch.id}.log`);
    const commands = rcloneCommands(plan, batch, { logPath });
    console.log(`${batch.id}: copying ${batch.objectCount} objects (${batch.byteSize} bytes)`);
    try {
      runRclone(commands.copy, `${batch.id} copy`);
      state.status = "verifying";
      ledger.updatedAt = new Date().toISOString();
      refreshSummary(ledger);
      writeJsonAtomic(ledgerPath, ledger);
      runRclone(commands.check, `${batch.id} check`);
      const results = markBatchVerified(ledger, plan, batch.id, actualPlanSha);
      for (const result of results) {
        if (recordedKeys.has(result.key)) continue;
        fs.appendFileSync(resultsPath, `${JSON.stringify(result)}\n`);
        recordedKeys.set(result.key, result);
      }
      writeJsonAtomic(ledgerPath, ledger);
      console.log(`${batch.id}: verified`);
    } catch (error) {
      state.status = "failed";
      state.error = error.message;
      state.failedAt = new Date().toISOString();
      ledger.updatedAt = state.failedAt;
      refreshSummary(ledger);
      writeJsonAtomic(ledgerPath, ledger);
      throw error;
    }
  }
  console.log(JSON.stringify({ progress: ledger.summary, ledgerPath, resultsPath }, null, 2));
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
