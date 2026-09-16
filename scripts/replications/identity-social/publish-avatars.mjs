#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { appendFile, mkdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { execFile as execFileCallback, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

export const OPERATION = "publish-approved-avatars";
export const DEFAULT_REMOTE = "replications-r2:replications";
export const DEFAULT_BUCKET = "replications";
export const DEFAULT_CDN_BASE = "https://dosewiki-media.gremblinzuwu.workers.dev";
export const DEFAULT_REVIEW = "/Users/josie/Documents/Dose Wiki Media Review/Data/Replication Identity and Social Pass 2026-08-31/review-results/avatar-research/avatar-candidate-second-review.json";
export const DEFAULT_PROJECTION = "/Users/josie/Documents/Dose Wiki Media Review/Data/Replication Identity and Social Pass 2026-08-31/identity-social-production-projection.json";
export const DEFAULT_CAMPAIGN_ROOT = "/Users/josie/Documents/Dose Wiki Media Review";
export const DEFAULT_LEDGER = "runs/identity-social/avatar-publisher-ledger.jsonl";
export const CONTENT_TYPE = "image/webp";
export const VERIFIER = "dosewiki-admin/avatar-r2-byte-verifier-v1";
export const KEY_PATTERN = /^media\/sha256\/([0-9a-f]{2})\/([0-9a-f]{64})\.webp$/;
const SHA_PATTERN = /^[0-9a-f]{64}$/;
const execFile = promisify(execFileCallback);

export function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

export function canonicalJson(value) {
  return JSON.stringify(stable(value));
}

export function sha256Bytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function digestFile(filename) {
  const hash = createHash("sha256");
  let byteSize = 0;
  for await (const chunk of createReadStream(filename)) {
    hash.update(chunk);
    byteSize += chunk.length;
  }
  return { sha256: hash.digest("hex"), byteSize };
}

export async function digestStream(stream) {
  const hash = createHash("sha256");
  let byteSize = 0;
  for await (const chunk of stream) {
    const bytes = Buffer.from(chunk);
    hash.update(bytes);
    byteSize += bytes.length;
  }
  return { sha256: hash.digest("hex"), byteSize };
}

export function canonicalKey(sha256) {
  if (!SHA_PATTERN.test(sha256)) throw new Error(`Invalid SHA-256: ${sha256}`);
  return `media/sha256/${sha256.slice(0, 2)}/${sha256}.webp`;
}

export function rcloneObject(remote, key) {
  const match = /^([A-Za-z0-9._-]+):(.*)$/.exec(remote);
  if (!match) throw new Error(`Invalid R2 target: ${remote}`);
  const suffix = match[2].replace(/^\/+|\/+$/g, "");
  if (!suffix) throw new Error("R2 target must include an explicit bucket/path, not an account root");
  const segments = suffix.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error(`Unsafe R2 target path: ${remote}`);
  }
  if (!KEY_PATTERN.test(key)) throw new Error(`Unsafe avatar object key: ${key}`);
  return `${match[1]}:${segments.join("/")}/${key}`;
}

export function parseFlagValue(argv, flag, fallback) {
  let result = fallback;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === flag) result = argv[index + 1];
    else if (argv[index].startsWith(`${flag}=`)) result = argv[index].slice(flag.length + 1);
  }
  return result;
}

export function parseFlagValues(argv, flag) {
  const values = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === flag && argv[index + 1] !== undefined) values.push(argv[index + 1]);
    else if (argv[index].startsWith(`${flag}=`)) values.push(argv[index].slice(flag.length + 1));
  }
  return values;
}

export async function buildPlan({ reviewPath, projectionPath, campaignRoot, cdnBase = DEFAULT_CDN_BASE }) {
  const [reviewText, projectionText] = await Promise.all([
    readFile(reviewPath, "utf8"),
    readFile(projectionPath, "utf8"),
  ]);
  const review = JSON.parse(reviewText);
  const projection = JSON.parse(projectionText);
  if (!SHA_PATTERN.test(projection.projectionSha256 ?? "")) throw new Error("Projection has no valid projectionSha256");
  const approvals = (review.records ?? []).filter((record) => record.decision === "approve");
  if (review.counts?.approved !== 7 || approvals.length !== 7) throw new Error("Authoritative avatar review must contain exactly seven approvals");
  if (review.validation?.productionWrites !== 0) throw new Error("Avatar review does not attest zero production writes");
  const avatarOperations = new Map(
    (projection.operations ?? [])
      .filter((operation) => operation.kind === "profile-avatar")
      .map((operation) => [operation.target?.profileKey, operation]),
  );
  if (avatarOperations.size !== 7) throw new Error("Projection must contain exactly seven profile-avatar operations");
  const normalizedCdnBase = cdnBase.replace(/\/+$/, "");
  const objects = [];
  const seenProfiles = new Set();
  for (const approval of approvals.sort((left, right) => left.profileKey.localeCompare(right.profileKey))) {
    if (seenProfiles.has(approval.profileKey)) throw new Error(`Duplicate approved profile: ${approval.profileKey}`);
    seenProfiles.add(approval.profileKey);
    const staged = approval.stagedAsset;
    if (!staged || staged.derivativeFormat !== CONTENT_TYPE) throw new Error(`${approval.profileKey}: approved derivative is not WebP`);
    if (!SHA_PATTERN.test(staged.derivativeSha256 ?? "")) throw new Error(`${approval.profileKey}: invalid reviewed derivative SHA-256`);
    const filename = path.resolve(campaignRoot, staged.derivativePath);
    const root = `${path.resolve(campaignRoot)}${path.sep}`;
    if (!filename.startsWith(root)) throw new Error(`${approval.profileKey}: derivative escapes campaign root`);
    const metadata = await stat(filename);
    if (!metadata.isFile()) throw new Error(`${approval.profileKey}: derivative is not a file`);
    const actual = await digestFile(filename);
    if (actual.sha256 !== staged.derivativeSha256 || actual.byteSize !== staged.derivativeBytes) {
      throw new Error(`${approval.profileKey}: staged derivative bytes do not match review authority`);
    }
    const operation = avatarOperations.get(approval.profileKey);
    if (!operation) throw new Error(`${approval.profileKey}: no matching projection operation`);
    if (operation.after?.derivativeSha256 !== actual.sha256 || operation.after?.derivativeByteSize !== actual.byteSize) {
      throw new Error(`${approval.profileKey}: projection and approved derivative disagree`);
    }
    const key = canonicalKey(actual.sha256);
    objects.push({
      profileKey: approval.profileKey,
      operationId: operation.operationId,
      filename,
      key,
      publicUrl: `${normalizedCdnBase}/${key}`,
      sha256: actual.sha256,
      byteSize: actual.byteSize,
      contentType: CONTENT_TYPE,
    });
  }
  const planMaterial = {
    operation: OPERATION,
    projectionSha256: projection.projectionSha256,
    reviewSha256: sha256Bytes(reviewText),
    cdnBase: normalizedCdnBase,
    objects: objects.map(({ profileKey, operationId, key, publicUrl, sha256, byteSize }) => ({ profileKey, operationId, key, publicUrl, sha256, byteSize })),
  };
  return {
    ...planMaterial,
    planDigest: sha256Bytes(canonicalJson(planMaterial)),
    projectionPath: path.resolve(projectionPath),
    reviewPath: path.resolve(reviewPath),
    objects,
    totalBytes: objects.reduce((sum, object) => sum + object.byteSize, 0),
  };
}

export function requireWriteConfirmation(argv, plan, target, bucket) {
  if (!argv.includes("--write")) throw new Error("Mutation requires explicit --write");
  if (parseFlagValue(argv, "--confirm-operation") !== OPERATION) {
    throw new Error(`Write requires --confirm-operation=${OPERATION}`);
  }
  if (parseFlagValue(argv, "--confirm-projection") !== plan.projectionSha256) {
    throw new Error(`Write requires --confirm-projection=${plan.projectionSha256}`);
  }
  if (parseFlagValue(argv, "--confirm-plan") !== plan.planDigest) {
    throw new Error(`Write requires --confirm-plan=${plan.planDigest}`);
  }
  if (parseFlagValue(argv, "--confirm-target") !== target) {
    throw new Error(`Write requires --confirm-target=${target}`);
  }
  if (parseFlagValue(argv, "--confirm-bucket") !== bucket) {
    throw new Error(`Write requires --confirm-bucket=${bucket}`);
  }
}

export async function readLedger(filename) {
  try {
    return (await readFile(filename, "utf8")).split(/\r?\n/).filter(Boolean).map((line, index) => {
      try { return JSON.parse(line); }
      catch (error) { throw new Error(`Invalid JSONL ${filename}:${index + 1}: ${error.message}`); }
    });
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

export function createLedgerWriter(filename, now = () => Date.now()) {
  let chain = Promise.resolve();
  return async (record) => {
    chain = chain.then(async () => {
      await mkdir(path.dirname(path.resolve(filename)), { recursive: true });
      await appendFile(filename, `${JSON.stringify({ ...record, timestamp: now() })}\n`, { flag: "a" });
    });
    return chain;
  };
}

export function latestVerified(records, planDigest) {
  const found = new Map();
  for (const record of records) {
    if (record.planDigest === planDigest && record.type === "object" && ["remote-verified", "uploaded-verified"].includes(record.status)) {
      found.set(record.key, record);
    }
  }
  return found;
}

export function hasCanaryCompletion(records, planDigest) {
  return records.some((record) => record.type === "canary-complete" && record.planDigest === planDigest);
}

export function assertRemoteDigest(object, actual, label = "R2") {
  if (actual.sha256 !== object.sha256 || actual.byteSize !== object.byteSize) {
    throw new Error(`IMMUTABLE COLLISION at ${object.key}: ${label} has ${actual.byteSize}/${actual.sha256}, expected ${object.byteSize}/${object.sha256}`);
  }
}

export function parseRcloneStat(stdout, key) {
  let result;
  try { result = JSON.parse(stdout); }
  catch (error) { throw new Error(`Invalid rclone stat JSON for ${key}: ${error.message}`); }
  if (result === null) return false;
  if (!result || result.IsDir || !Number.isSafeInteger(result.Size) || result.Size < 0) throw new Error(`Invalid rclone stat for ${key}`);
  return true;
}

export function createRcloneStorage(remote) {
  return {
    async exists(key) {
      try {
        const { stdout } = await execFile("rclone", ["lsjson", rcloneObject(remote, key), "--stat", "--files-only"], { maxBuffer: 1024 * 1024 });
        return parseRcloneStat(stdout, key);
      } catch (error) {
        const diagnostic = `${error?.stderr ?? ""}\n${error?.message ?? ""}`;
        if (/not found|does not exist|doesn't exist|object not found|directory not found|statuscode:\s*404/i.test(diagnostic)) return false;
        throw new Error(`rclone existence check failed for ${key}: ${diagnostic.trim()}`);
      }
    },
    async digest(key) {
      const child = spawn("rclone", ["cat", rcloneObject(remote, key)], { stdio: ["ignore", "pipe", "pipe"] });
      let stderr = "";
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk) => { if (stderr.length < 16_384) stderr += chunk; });
      const exited = new Promise((resolve, reject) => { child.once("error", reject); child.once("close", resolve); });
      const digest = await digestStream(child.stdout);
      const code = await exited;
      if (code !== 0) throw new Error(`rclone byte read failed for ${key}: ${stderr.trim()}`);
      return digest;
    },
    async write(object) {
      await execFile("rclone", [
        "copyto", object.filename, rcloneObject(remote, object.key), "--immutable",
        "--header-upload", `Content-Type: ${CONTENT_TYPE}`,
        "--header-upload", "Cache-Control: public, max-age=31536000, immutable",
      ], { maxBuffer: 4 * 1024 * 1024 });
    },
  };
}

export function makeDeliveryReceipt({ object, httpStatus, verifiedAt, verifier = VERIFIER }) {
  const body = {
    url: object.publicUrl,
    content_sha256: object.sha256,
    byte_size: object.byteSize,
    http_status: httpStatus,
    verified_at: verifiedAt,
    verifier,
  };
  return { ...body, receipt_digest: sha256Bytes(canonicalJson(body)) };
}

export async function verifyDelivery(object, { fetchImpl = fetch, now = () => Date.now(), verifier = VERIFIER } = {}) {
  const separator = object.publicUrl.includes("?") ? "&" : "?";
  const response = await fetchImpl(`${object.publicUrl}${separator}avatar-integrity=${object.sha256}`, { cache: "no-store" });
  const bytes = Buffer.from(await response.arrayBuffer());
  const actual = { sha256: sha256Bytes(bytes), byteSize: bytes.length };
  assertRemoteDigest(object, actual, "public CDN readback");
  if (!response.ok) throw new Error(`Public delivery returned HTTP ${response.status} for ${object.publicUrl}`);
  return makeDeliveryReceipt({ object, httpStatus: response.status, verifiedAt: now(), verifier });
}

export async function processObjects({ plan, objects, storage, ledgerPath, mode, fetchImpl = fetch, resume = true }) {
  if (!["preflight", "canary", "full"].includes(mode)) throw new Error(`Unsupported phase: ${mode}`);
  const records = await readLedger(ledgerPath);
  const prior = resume ? latestVerified(records, plan.planDigest) : new Map();
  const append = createLedgerWriter(ledgerPath);
  await append({ type: "run-start", operation: OPERATION, mode, planDigest: plan.planDigest, projectionSha256: plan.projectionSha256, objectCount: objects.length });
  const summary = { verified: 0, absent: 0, uploaded: 0, reused: 0, resumed: 0, receipts: 0 };
  for (const object of objects) {
    const previous = prior.get(object.key);
    if (previous?.sha256 === object.sha256 && previous?.byteSize === object.byteSize && previous?.deliveryReceipt) {
      summary.verified += 1; summary.resumed += 1; summary.receipts += 1;
      continue;
    }
    const exists = await storage.exists(object.key);
    if (!exists) {
      if (mode === "preflight") {
        await append({ type: "object", status: "absent", planDigest: plan.planDigest, profileKey: object.profileKey, key: object.key, sha256: object.sha256, byteSize: object.byteSize });
        summary.absent += 1;
        continue;
      }
      await storage.write(object);
      summary.uploaded += 1;
    }
    const actual = await storage.digest(object.key);
    try { assertRemoteDigest(object, actual, exists ? "existing R2 object" : "post-upload R2 readback"); }
    catch (error) {
      await append({ type: "object", status: "collision", planDigest: plan.planDigest, profileKey: object.profileKey, key: object.key, sha256: object.sha256, byteSize: object.byteSize, actual });
      throw error;
    }
    const deliveryReceipt = await verifyDelivery(object, { fetchImpl });
    await append({
      type: "object", status: exists ? "remote-verified" : "uploaded-verified", planDigest: plan.planDigest,
      profileKey: object.profileKey, operationId: object.operationId, key: object.key, publicUrl: object.publicUrl,
      sha256: object.sha256, byteSize: object.byteSize, deliveryReceipt,
    });
    summary.verified += 1; summary.receipts += 1;
    if (exists) summary.reused += 1;
  }
  if (mode === "canary" && summary.verified === objects.length) {
    await append({ type: "canary-complete", operation: OPERATION, planDigest: plan.planDigest, projectionSha256: plan.projectionSha256, objectCount: objects.length, summary });
  }
  if (mode === "full" && summary.verified === plan.objects.length) {
    await append({ type: "full-complete", operation: OPERATION, planDigest: plan.planDigest, projectionSha256: plan.projectionSha256, objectCount: plan.objects.length, summary });
  }
  return summary;
}

export function selectCanaries(plan, profiles) {
  if (!profiles.length) throw new Error("Canary write requires at least one explicit --canary-profile");
  const wanted = new Set(profiles);
  const objects = plan.objects.filter((object) => wanted.has(object.profileKey));
  if (objects.length !== wanted.size) throw new Error(`Unknown or duplicate canary profile(s): ${profiles.join(", ")}`);
  return objects;
}

function usage() {
  return `Usage: node scripts/replications/identity-social/publish-avatars.mjs [options]\n\nDefault: local dry run (seven files are hashed; no network or writes).\nRead-only: --preflight-r2\nCanary write: --write --phase=canary --canary-profile=PROFILE plus every --confirm-* flag\nFull write: --write --phase=full --resume plus every --confirm-* flag (requires completed canary)\n\nRequired write confirmations:\n  --confirm-operation=${OPERATION}\n  --confirm-projection=<projectionSha256>\n  --confirm-plan=<planDigest>\n  --confirm-target=${DEFAULT_REMOTE}\n  --confirm-bucket=${DEFAULT_BUCKET}\n\nImmutable objects are never deleted. Rollback reverses later metadata/manifest references only.`;
}

export async function main(argv = process.argv.slice(2), dependencies = {}) {
  if (argv.includes("--help")) { console.log(usage()); return; }
  const reviewPath = path.resolve(parseFlagValue(argv, "--review", DEFAULT_REVIEW));
  const projectionPath = path.resolve(parseFlagValue(argv, "--projection", DEFAULT_PROJECTION));
  const campaignRoot = path.resolve(parseFlagValue(argv, "--campaign-root", DEFAULT_CAMPAIGN_ROOT));
  const ledgerPath = path.resolve(parseFlagValue(argv, "--ledger", DEFAULT_LEDGER));
  const target = parseFlagValue(argv, "--target", DEFAULT_REMOTE);
  const bucket = parseFlagValue(argv, "--bucket", DEFAULT_BUCKET);
  const cdnBase = parseFlagValue(argv, "--cdn-base", DEFAULT_CDN_BASE);
  if (target !== DEFAULT_REMOTE) throw new Error(`This publisher is scoped to --target=${DEFAULT_REMOTE}`);
  if (bucket !== DEFAULT_BUCKET) throw new Error(`This publisher is scoped to --bucket=${DEFAULT_BUCKET}`);
  rcloneObject(target, canonicalKey("0".repeat(64)));
  const plan = await buildPlan({ reviewPath, projectionPath, campaignRoot, cdnBase });
  console.log(`[avatars:r2] Projection ${plan.projectionSha256}`);
  console.log(`[avatars:r2] Plan ${plan.planDigest}`);
  console.log(`[avatars:r2] ${plan.objects.length} approved WebP objects, ${plan.totalBytes} bytes -> ${target}/media/sha256/.`);
  const write = argv.includes("--write");
  const preflight = argv.includes("--preflight-r2");
  if (!write && !preflight) {
    console.log("[avatars:r2] Dry run complete: no network, R2, ledger, manifest, metadata, or Postgres writes.");
    return { mode: "dry-run", plan };
  }
  if (preflight && write) throw new Error("Choose either read-only --preflight-r2 or --write, not both");
  const storage = dependencies.storage ?? createRcloneStorage(target);
  if (preflight) {
    const summary = await processObjects({ plan, objects: plan.objects, storage, ledgerPath, mode: "preflight", fetchImpl: dependencies.fetchImpl });
    console.log(`[avatars:r2] Read-only preflight: ${summary.reused} exact remote objects, ${summary.absent} absent, ${summary.receipts} delivery receipts, zero writes.`);
    return { mode: "preflight", plan, summary };
  }
  requireWriteConfirmation(argv, plan, target, bucket);
  const phase = parseFlagValue(argv, "--phase");
  if (phase === "canary") {
    const objects = selectCanaries(plan, parseFlagValues(argv, "--canary-profile"));
    const summary = await processObjects({ plan, objects, storage, ledgerPath, mode: "canary", fetchImpl: dependencies.fetchImpl });
    console.log(`[avatars:r2] Canary verified: ${summary.verified}/${objects.length}; immutable objects remain in place on rollback.`);
    return { mode: "canary", plan, summary };
  }
  if (phase !== "full") throw new Error("Write requires --phase=canary or --phase=full");
  if (!argv.includes("--resume")) throw new Error("Full write requires explicit --resume");
  if (!hasCanaryCompletion(await readLedger(ledgerPath), plan.planDigest)) throw new Error("Full write refused: this exact plan has no completed canary in the ledger");
  const summary = await processObjects({ plan, objects: plan.objects, storage, ledgerPath, mode: "full", fetchImpl: dependencies.fetchImpl });
  console.log(`[avatars:r2] Full object publication verified: ${summary.verified}/${plan.objects.length}. No metadata or manifest was changed.`);
  return { mode: "full", plan, summary };
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) main().catch((error) => { console.error(error); console.error(usage()); process.exitCode = 1; });
