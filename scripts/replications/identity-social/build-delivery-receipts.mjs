#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { digest, verifyBaseProjection } from "./executor-lib.mjs";

const CAMPAIGN = "/Users/josie/Documents/Dose Wiki Media Review/Data/Replication Identity and Social Pass 2026-08-31";
export const DEFAULTS = {
  projection: `${CAMPAIGN}/identity-social-production-projection.json`,
  avatars: `${CAMPAIGN}/avatar-production-publish-ledger-0f70de.jsonl`,
  social: `${CAMPAIGN}/social-cards/r2-production-publish-ledger.jsonl`,
  objectVerification: `${CAMPAIGN}/social-cards/social-card-object-delivery-verification.jsonl`,
  candidate: `${CAMPAIGN}/social-cards/r2-social-card-candidate-manifest.json`,
  output: `${CAMPAIGN}/identity-social-delivery-receipts.json`,
};
export const VERIFIER = "dosewiki-admin/identity-social-full-byte-verifier-v1";
const GOOD = new Set(["verified-reuse", "uploaded-verified", "remote-verified"]);
const SHA = /^[0-9a-f]{64}$/;
const KEY = /^media\/sha256\/([0-9a-f]{2})\/([0-9a-f]{64})\.(?:jpg|jpeg|png|webp)$/;

const required = (condition, message) => { if (!condition) throw new Error(message); };
const readJson = async (filename) => JSON.parse(await readFile(filename, "utf8"));
const readJsonl = async (filename) => (await readFile(filename, "utf8")).split(/\r?\n/).filter(Boolean).map((line, index) => {
  try { return JSON.parse(line); } catch (error) { throw new Error(`Invalid JSONL ${filename}:${index + 1}: ${error.message}`); }
});
const flag = (argv, name) => argv.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1);

export function parseArgs(argv) {
  return {
    projection: flag(argv, "--projection") ?? DEFAULTS.projection,
    avatars: flag(argv, "--avatar-ledger") ?? DEFAULTS.avatars,
    social: flag(argv, "--social-ledger") ?? DEFAULTS.social,
    objectVerification: flag(argv, "--object-verification-ledger") ?? DEFAULTS.objectVerification,
    candidate: flag(argv, "--candidate-manifest") ?? DEFAULTS.candidate,
    output: flag(argv, "--output") ?? DEFAULTS.output,
    concurrency: Number(flag(argv, "--concurrency") ?? 12),
    check: argv.includes("--check"),
  };
}

function timestamp(record) {
  if (Number.isFinite(record.timestamp)) return record.timestamp;
  const value = Date.parse(record.recordedAt);
  required(Number.isFinite(value), `Ledger record lacks a valid timestamp for ${record.key ?? record.type}`);
  return value;
}

export function indexVerifiedLedger(records, { planDigest, expectedObjects, completionType, label }) {
  const relevant = records.filter((row) => row.planDigest === planDigest);
  const completion = relevant.findLast((row) => row.type === completionType && row.objectCount === expectedObjects);
  required(completion, `${label} ledger has no ${completionType} for ${expectedObjects} objects and plan ${planDigest}`);
  const blocking = relevant.find((row) => row.type === "object" && ["collision", "post-write-mismatch"].includes(row.status));
  required(!blocking, `${label} ${blocking?.key} has blocking status ${blocking?.status}`);
  const byKey = new Map();
  for (const row of relevant) {
    if (row.type !== "object") continue;
    if (["collision", "post-write-mismatch", "absent"].includes(row.status)) byKey.set(row.key, row);
    else if (GOOD.has(row.status)) byKey.set(row.key, row);
  }
  required(byKey.size === expectedObjects, `${label} ledger covers ${byKey.size}/${expectedObjects} objects`);
  for (const [key, row] of byKey) {
    required(GOOD.has(row.status), `${label} ${key} has blocking status ${row.status}`);
    required(KEY.test(key) && KEY.exec(key)[2] === row.sha256, `${label} has invalid key/hash binding for ${key}`);
    const size = row.byteSize ?? row.size;
    required(SHA.test(row.sha256) && Number.isInteger(size) && size > 0, `${label} has invalid hash/size for ${key}`);
  }
  return byKey;
}

export function indexObjectVerification(records, { planDigest, expectedObjects, expectedTotalBytes }) {
  const completions = records.filter((row) => row.type === "object-verification-complete" && row.planDigest === planDigest && row.objectCount === expectedObjects && row.exhaustive === true);
  required(completions.length === 1, `Object verification requires exactly one complete marker; found ${completions.length}`);
  const completion = completions[0];
  required(Number.isInteger(completion.totalBytes) && completion.totalBytes === expectedTotalBytes, `Object verification total bytes mismatch: ${completion.totalBytes} != ${expectedTotalBytes}`);
  required(typeof completion.runId === "string" && completion.runId.length > 0, "Object verification completion has no run ID");
  const byKey = new Map(); let totalBytes = 0;
  for (const row of records) {
    if (row.type !== "object-verified" || row.planDigest !== planDigest || row.runId !== completion.runId) continue;
    required(!byKey.has(row.key), `Duplicate object-verification record for ${row.key}`);
    required(KEY.test(row.key) && KEY.exec(row.key)[2] === row.sha256, `Object verification has invalid key/hash binding for ${row.key}`);
    required(SHA.test(row.sha256) && Number.isInteger(row.size) && row.size > 0, `Object verification has invalid hash/size for ${row.key}`);
    byKey.set(row.key, row); totalBytes += row.size;
  }
  required(byKey.size === expectedObjects, `Object verification covers ${byKey.size}/${expectedObjects} objects`);
  required(totalBytes === completion.totalBytes, `Object verification record bytes mismatch: ${totalBytes} != ${completion.totalBytes}`);
  return { byKey, completion };
}

async function digestResponse(response, url) {
  required(response.ok, `CDN returned HTTP ${response.status} for ${url}`);
  required(response.body, `CDN returned no body for ${url}`);
  const hash = createHash("sha256"); let size = 0;
  for await (const chunk of response.body) { const bytes = Buffer.from(chunk); hash.update(bytes); size += bytes.length; }
  return { sha256: hash.digest("hex"), size, status: response.status };
}

async function fetchAvatarWithRetry(fetchImpl, url, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const response = await fetchImpl(url, { headers: { Accept: "*/*", "Cache-Control": "no-cache" } });
    if (response.status < 500 || response.status > 599 || attempt === 3) return response;
    await sleep(250 * attempt);
  }
}

async function mapConcurrent(items, concurrency, worker) {
  required(Number.isInteger(concurrency) && concurrency >= 1 && concurrency <= 64, "Concurrency must be from 1 to 64");
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) { const index = cursor++; await worker(items[index], index); }
  }));
}

function receipt(operation, ledger, url, httpStatus) {
  const sha256 = operation.after.derivativeSha256 ?? operation.after.sha256;
  const size = operation.after.derivativeByteSize ?? operation.after.byteSize;
  const verifiedAt = timestamp(ledger);
  const core = { url, content_sha256: sha256, byte_size: size, http_status: httpStatus, verified_at: verifiedAt, verifier: VERIFIER };
  return {
    operation_id: operation.operationId,
    projection_sha256: operation.projectionSha256,
    kind: operation.kind,
    entity: operation.target,
    r2_key: ledger.key,
    sha256,
    byte_size: size,
    publication_status: ledger.status === "remote-verified" ? "verified-reuse" : ledger.status,
    source_ledger_status: ledger.status,
    publication_recorded_at: verifiedAt,
    binding_mode: operation.kind === "profile-avatar" ? "verify-only-existing-object" : "verified-publication",
    receipt: { ...core, receipt_digest: digest(core) },
  };
}

export async function buildDeliveryReceipts({ projection, avatarRecords, socialRecords, objectVerificationRecords, candidate, fetchImpl = fetch, sleep, concurrency = 12 }) {
  verifyBaseProjection(projection, projection.projectionSha256);
  const avatarOps = projection.operations.filter((row) => row.kind === "profile-avatar");
  const socialOps = projection.operations.filter((row) => row.kind === "social-asset");
  required(avatarOps.length === 7, `Expected 7 avatar operations, got ${avatarOps.length}`);
  required(socialOps.length === 9172, `Expected 9,172 social operations, got ${socialOps.length}`);
  required(candidate.promotion?.logicalCardCount === 9172 && candidate.promotion?.uniqueObjectCount === 9171, "Candidate manifest coverage is not 9,172 logical/9,171 unique");
  const avatarCompletion = avatarRecords.findLast((row) => row.type === "full-complete");
  const avatarPlan = avatarCompletion?.planDigest;
  required(avatarPlan, "Avatar ledger has no completed full run");
  required(avatarCompletion.projectionSha256 === projection.projectionSha256, "Avatar verify-only ledger targets a different base projection");
  const avatars = indexVerifiedLedger(avatarRecords, { planDigest: avatarPlan, expectedObjects: 7, completionType: "full-complete", label: "Avatar" });
  const socialPlan = candidate.promotion.planDigest;
  const social = indexVerifiedLedger(socialRecords, { planDigest: socialPlan, expectedObjects: 9171, completionType: "full-complete", label: "Social-card" });
  const socialTotalBytes = [...social.values()].reduce((total, row) => total + row.size, 0);
  const objectVerification = indexObjectVerification(objectVerificationRecords, { planDigest: socialPlan, expectedObjects: 9171, expectedTotalBytes: socialTotalBytes });
  const jobs = new Map();
  const add = (operation, row, url) => {
    const sha = operation.after.derivativeSha256 ?? operation.after.sha256;
    const size = operation.after.derivativeByteSize ?? operation.after.byteSize;
    required(row && row.sha256 === sha && (row.byteSize ?? row.size) === size, `Ledger mismatch for ${operation.operationId}`);
    required(url === row.publicUrl || new URL(url).pathname === `/${row.key}`, `CDN/key mismatch for ${operation.operationId}`);
    const prior = jobs.get(row.key);
    if (prior) required(prior.url === url && prior.sha256 === sha && prior.size === size, `Logical collision for ${row.key}`);
    else jobs.set(row.key, { url, sha256: sha, size, row, httpStatus: null });
  };
  for (const operation of avatarOps) {
    const row = [...avatars.values()].find((item) => item.profileKey === operation.target.profileKey);
    required(row, `Missing avatar ledger binding for ${operation.target.profileKey}`);
    add(operation, row, row.publicUrl ?? row.deliveryReceipt?.url);
  }
  for (const operation of socialOps) {
    const url = candidate.cards?.[operation.target.entityType]?.[operation.target.entityKey];
    required(typeof url === "string", `Missing candidate URL for ${operation.target.entityType}/${operation.target.entityKey}`);
    const key = new URL(url).pathname.slice(1);
    const published = social.get(key); const verified = objectVerification.byKey.get(key);
    required(published && verified && published.sha256 === verified.sha256 && published.size === verified.size, `Publication/object-verification mismatch for ${key}`);
    add(operation, { ...published, recordedAt: verified.recordedAt, objectVerificationRunId: verified.runId }, url);
  }
  required(jobs.size === 9178, `Expected 9,178 total unique CDN objects, got ${jobs.size}`);
  const avatarJobs = [...jobs.values()].filter((job) => job.row.profileKey);
  required(avatarJobs.length === 7, `Expected seven avatar verification jobs, got ${avatarJobs.length}`);
  for (const job of jobs.values()) if (!job.row.profileKey) job.httpStatus = 200;
  await mapConcurrent(avatarJobs, concurrency, async (job) => {
    const actual = await digestResponse(await fetchAvatarWithRetry(fetchImpl, job.url, sleep), job.url);
    required(actual.sha256 === job.sha256 && actual.size === job.size, `CDN collision at ${job.url}: got ${actual.size}/${actual.sha256}, expected ${job.size}/${job.sha256}`);
    job.httpStatus = actual.status;
  });
  const receipts = {};
  for (const operation of [...avatarOps, ...socialOps]) {
    const sha = operation.after.derivativeSha256 ?? operation.after.sha256;
    const url = operation.kind === "profile-avatar"
      ? [...avatars.values()].find((item) => item.profileKey === operation.target.profileKey).publicUrl
      : candidate.cards[operation.target.entityType][operation.target.entityKey];
    const job = jobs.get(new URL(url).pathname.slice(1));
    const bound = receipt({ ...operation, projectionSha256: projection.projectionSha256 }, job.row, url, job.httpStatus);
    required(!receipts[operation.operationId], `Duplicate operation ID ${operation.operationId}`);
    receipts[operation.operationId] = bound;
    required(bound.sha256 === sha, `Receipt hash drift for ${operation.operationId}`);
  }
  const core = {
    artifactType: "identity-social-production-delivery-receipt-sidecar",
    schemaVersion: 2,
    baseProjectionSha256: projection.projectionSha256,
    baseProjectionOperationCount: projection.operations.length,
    verifier: VERIFIER,
    counts: { avatars: 7, socialLogical: 9172, socialUnique: 9171, uniqueCdnObjects: 9178, uploaded: Object.values(receipts).filter((x) => x.publication_status === "uploaded-verified").length, reused: Object.values(receipts).filter((x) => x.publication_status === "verified-reuse").length },
    receipts,
  };
  return { ...core, receiptSidecarSha256: digest(core) };
}

export async function run(argv = process.argv.slice(2), adapters = {}) {
  const options = parseArgs(argv);
  const result = await buildDeliveryReceipts({ projection: await readJson(options.projection), avatarRecords: await readJsonl(options.avatars), socialRecords: await readJsonl(options.social), objectVerificationRecords: await readJsonl(options.objectVerification), candidate: await readJson(options.candidate), fetchImpl: adapters.fetchImpl ?? fetch, sleep: adapters.sleep, concurrency: options.concurrency });
  const bytes = `${JSON.stringify(result, null, 2)}\n`;
  if (options.check) {
    required(await readFile(options.output, "utf8") === bytes, `Receipt artifact drift: ${options.output}`);
  } else await writeFile(options.output, bytes);
  return result.counts;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) run().then((counts) => console.log(JSON.stringify(counts, null, 2))).catch((error) => { console.error(error.message); process.exitCode = 1; });
