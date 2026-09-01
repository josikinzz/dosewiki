#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { canonicalJson, digest, verifyBaseProjection } from "./executor-lib.mjs";

const CAMPAIGN = "/Users/josie/Documents/Dose Wiki Media Review/Data/Replication Identity and Social Pass 2026-08-31";
export const DEFAULTS = {
  projection: `${CAMPAIGN}/identity-social-production-projection.json`,
  avatars: `${CAMPAIGN}/avatar-production-publish-ledger-0f70de.jsonl`,
  social: `${CAMPAIGN}/social-cards/r2-production-publish-ledger.jsonl`,
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

async function digestResponse(response, url) {
  required(response.ok, `CDN returned HTTP ${response.status} for ${url}`);
  required(response.body, `CDN returned no body for ${url}`);
  const hash = createHash("sha256"); let size = 0;
  for await (const chunk of response.body) { const bytes = Buffer.from(chunk); hash.update(bytes); size += bytes.length; }
  return { sha256: hash.digest("hex"), size, status: response.status };
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

export async function buildDeliveryReceipts({ projection, avatarRecords, socialRecords, candidate, fetchImpl = fetch, concurrency = 12 }) {
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
    const key = new URL(url).pathname.slice(1); add(operation, social.get(key), url);
  }
  required(jobs.size === 9178, `Expected 9,178 total unique CDN objects, got ${jobs.size}`);
  await mapConcurrent([...jobs.values()], concurrency, async (job) => {
    const actual = await digestResponse(await fetchImpl(job.url, { headers: { Accept: "*/*", "Cache-Control": "no-cache" } }), job.url);
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
  const result = await buildDeliveryReceipts({ projection: await readJson(options.projection), avatarRecords: await readJsonl(options.avatars), socialRecords: await readJsonl(options.social), candidate: await readJson(options.candidate), fetchImpl: adapters.fetchImpl ?? fetch, concurrency: options.concurrency });
  const bytes = `${JSON.stringify(result, null, 2)}\n`;
  if (options.check) {
    required(await readFile(options.output, "utf8") === bytes, `Receipt artifact drift: ${options.output}`);
  } else await writeFile(options.output, bytes);
  return result.counts;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) run().then((counts) => console.log(JSON.stringify(counts, null, 2))).catch((error) => { console.error(error.message); process.exitCode = 1; });
