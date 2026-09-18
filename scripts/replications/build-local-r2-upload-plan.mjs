#!/usr/bin/env node

/** Build a frozen, zero-write R2 upload plan from a completed derivative ledger. */

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SHA256 = /^[0-9a-f]{64}$/;
const EXPECTED_ROLE_COUNT = 14_674;
const EXPECTED_TECHNICAL_BLOCKS = Object.freeze([
  "03864c413cae6286dcd841306145f168489e90fbc9ab81306600672c946f136d:video_main",
  "03864c413cae6286dcd841306145f168489e90fbc9ab81306600672c946f136d:video_poster",
  "03864c413cae6286dcd841306145f168489e90fbc9ab81306600672c946f136d:video_preview",
  "835de6af638eb0eb4adf832f0f9cad36cf9a7932d07441742fc09c015edbf7ac:video_main",
  "835de6af638eb0eb4adf832f0f9cad36cf9a7932d07441742fc09c015edbf7ac:video_poster",
  "835de6af638eb0eb4adf832f0f9cad36cf9a7932d07441742fc09c015edbf7ac:video_preview",
]);
const CONTENT_TYPE_BY_EXTENSION = Object.freeze({
  gif: "image/gif",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  mp4: "video/mp4",
  png: "image/png",
  webp: "image/webp",
});

function sha256File(filename) {
  return createHash("sha256").update(fs.readFileSync(filename)).digest("hex");
}

async function sha256FileStreaming(filename) {
  const hash = createHash("sha256");
  for await (const chunk of fs.createReadStream(filename)) hash.update(chunk);
  return hash.digest("hex");
}

function flagValue(argv, name) {
  const inline = argv.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

function writeAtomic(filename, content) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const part = `${filename}.part`;
  fs.writeFileSync(part, content);
  fs.renameSync(part, filename);
}

function normalizeReadyItem(item, outputRoot) {
  const reused = item.status === "reused";
  const sha256 = reused ? item.sourceSha256 : item.outputSha256;
  const byteSize = reused ? item.sourceBefore?.byteSize : item.byteSize;
  const localPath = reused ? (item.outputPath ?? item.sourcePath) : item.outputPath;
  if (!SHA256.test(sha256 ?? "")) throw new Error(`Invalid output SHA-256 for ${item.role}`);
  const extension = String(item.extension ?? "").toLowerCase();
  const contentType = CONTENT_TYPE_BY_EXTENSION[extension];
  if (!contentType) throw new Error(`Unsupported derivative extension for ${item.role}: ${extension}`);
  const expectedKey = `media/sha256/${sha256.slice(0, 2)}/${sha256}.${extension}`;
  if (item.r2Key !== expectedKey) throw new Error(`Non-canonical R2 key for ${item.role}: ${item.r2Key}`);
  if (!path.isAbsolute(localPath ?? "")) throw new Error(`Output path is not absolute for ${item.role}`);
  if (reused && item.sourcePath && path.resolve(localPath) !== path.resolve(item.sourcePath)) {
    throw new Error(`Reused output path differs from immutable source path for ${item.role}`);
  }
  const expectedPath = reused ? path.resolve(localPath) : path.resolve(outputRoot, expectedKey);
  if (!reused && path.resolve(localPath) !== expectedPath) {
    throw new Error(`Output path does not match canonical R2 key for ${item.role}`);
  }
  const stat = fs.statSync(expectedPath);
  if (!stat.isFile()) throw new Error(`Derivative is not a file: ${expectedPath}`);
  if (stat.size !== byteSize) {
    throw new Error(`Derivative size mismatch for ${item.role}: expected ${byteSize}, got ${stat.size}`);
  }
  return { expectedKey, expectedPath, contentType, extension, sha256, byteSize };
}

export function buildLocalR2UploadPlan(ledger, {
  ledgerPath,
  ledgerSha256,
  batchSize = 250,
  expectedRoleCount = EXPECTED_ROLE_COUNT,
  expectedTechnicalBlocks = EXPECTED_TECHNICAL_BLOCKS,
  requiredCanaryCoverage = null,
} = {}) {
  if (!ledger || typeof ledger !== "object" || !ledger.items || typeof ledger.items !== "object") {
    throw new Error("Derivative ledger must contain an items object");
  }
  if (!path.isAbsolute(ledger.outputRoot ?? "")) throw new Error("Derivative ledger outputRoot must be absolute");
  if (!SHA256.test(ledgerSha256 ?? "")) throw new Error("A valid derivative-ledger SHA-256 pin is required");
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 1000) {
    throw new Error("batchSize must be an integer from 1 through 1000");
  }

  const statuses = {};
  const blocked = [];
  const byKey = new Map();
  let uploadRoles = 0;
  for (const item of Object.values(ledger.items)) {
    statuses[item.status] = (statuses[item.status] ?? 0) + 1;
    if (item.status === "blocked") {
      blocked.push({
        sourceSha256: item.sourceSha256,
        role: item.role,
        reason: item.reason ?? null,
        publicationBlockers: item.publicationBlockers ?? [],
      });
      continue;
    }
    if (item.status !== "completed" && item.status !== "reused") continue;
    uploadRoles += 1;
    const { expectedKey, expectedPath, contentType, extension, sha256, byteSize } = normalizeReadyItem(item, ledger.outputRoot);
    const coveredRole = { sourceSha256: item.sourceSha256, role: item.role, status: item.status };
    const prior = byKey.get(expectedKey);
    if (prior) {
      if (prior.sha256 !== sha256 || prior.byteSize !== byteSize) {
        throw new Error(`Conflicting metadata for R2 key ${expectedKey}`);
      }
      prior.coveredRoles.push(coveredRole);
      continue;
    }
    byKey.set(expectedKey, {
      key: expectedKey,
      sha256,
      byteSize,
      contentType,
      extension,
      localPath: expectedPath,
      coveredRoles: [coveredRole],
    });
  }

  const objects = [...byKey.values()].sort((left, right) => left.key.localeCompare(right.key));
  const requiredCoverage = requiredCanaryCoverage ?? [
    ...[...new Set(objects.map((object) => object.extension))].sort().map((extension) => `type:${extension}`),
    "status:completed",
    "status:reused",
  ];
  const coverageFor = (object) => new Set([
    `type:${object.extension}`,
    ...object.coveredRoles.map((role) => `status:${role.status}`),
  ]);
  const uncovered = new Set(requiredCoverage);
  const canaryObjects = [];
  while (uncovered.size) {
    const scored = objects
      .filter((object) => !canaryObjects.includes(object))
      .map((object) => ({ object, covers: [...coverageFor(object)].filter((key) => uncovered.has(key)) }))
      .sort((left, right) => right.covers.length - left.covers.length || left.object.key.localeCompare(right.object.key));
    if (!scored[0]?.covers.length) break;
    canaryObjects.push(scored[0].object);
    for (const key of scored[0].covers) uncovered.delete(key);
  }
  const canaryKeys = new Set(canaryObjects.map((object) => object.key));
  const batches = canaryObjects.length ? [{
    id: "batch-0001-canary",
    objectCount: canaryObjects.length,
    byteSize: canaryObjects.reduce((sum, object) => sum + object.byteSize, 0),
    keys: canaryObjects.map((object) => object.key),
    canary: true,
  }] : [];
  const remainingObjects = objects.filter((object) => !canaryKeys.has(object.key));
  for (let offset = 0; offset < remainingObjects.length; offset += batchSize) {
    const members = remainingObjects.slice(offset, offset + batchSize);
    batches.push({
      id: `batch-${String(batches.length + 1).padStart(4, "0")}`,
      objectCount: members.length,
      byteSize: members.reduce((sum, object) => sum + object.byteSize, 0),
      keys: members.map((object) => object.key),
    });
  }
  const plannedRoles = statuses.planned ?? 0;
  const invalidStatuses = Object.keys(statuses).filter(
    (status) => !["blocked", "completed", "planned", "reused"].includes(status),
  );
  const blockedSignatures = blocked.map((item) => `${item.sourceSha256}:${item.role}`).sort();
  const expectedBlockSignatures = [...expectedTechnicalBlocks].sort();
  const closureIssues = [];
  if (Object.keys(ledger.items).length !== expectedRoleCount) closureIssues.push(`expected-${expectedRoleCount}-roles`);
  if (JSON.stringify(blockedSignatures) !== JSON.stringify(expectedBlockSignatures)) closureIssues.push("technical-block-set-mismatch");
  if (blocked.some((item) => item.reason !== "technical publication block: technical-decode-failure" || JSON.stringify(item.publicationBlockers) !== JSON.stringify(["technical-decode-failure"]))) {
    closureIssues.push("technical-block-reason-mismatch");
  }
  if (plannedRoles) closureIssues.push("planned-roles-remain");
  if (invalidStatuses.length) closureIssues.push("invalid-statuses-present");
  if (uncovered.size) closureIssues.push("upload-canary-coverage-incomplete");
  return {
    schemaVersion: 1,
    artifactType: "replication-index-local-r2-upload-plan",
    generatedAt: new Date().toISOString(),
    derivativeLedger: { path: path.resolve(ledgerPath), sha256: ledgerSha256 },
    outputRoot: ledger.outputRoot,
    remoteRoot: "replications-r2:replications",
    readyToUpload: closureIssues.length === 0,
    summary: {
      roles: Object.keys(ledger.items).length,
      uploadRoles,
      uniqueObjects: objects.length,
      byteSize: objects.reduce((sum, object) => sum + object.byteSize, 0),
      blockedRoles: blocked.length,
      plannedRoles,
      statuses,
      invalidStatuses,
      batchSize,
      batches: batches.length,
      closureIssues,
    },
    objects,
    batches,
    blocked,
    uploadCanary: {
      requiredCoverage: [...requiredCoverage],
      covered: requiredCoverage.filter((key) => !uncovered.has(key)),
      missing: [...uncovered].sort(),
      complete: uncovered.size === 0,
      keys: canaryObjects.map((object) => object.key),
    },
    policy: {
      copyOnly: true,
      delete: false,
      immutable: true,
      fullDownloadVerificationRequired: true,
      publicDeliveryVerificationRequired: true,
    },
    productionWrites: 0,
  };
}

export async function verifyLocalObjects(plan, { concurrency = 3 } = {}) {
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 16) {
    throw new Error("verification concurrency must be an integer from 1 through 16");
  }
  let cursor = 0;
  let verifiedBytes = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, plan.objects.length) }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= plan.objects.length) return;
      const object = plan.objects[index];
      const stat = fs.statSync(object.localPath);
      if (!stat.isFile() || stat.size !== object.byteSize) {
        throw new Error(`Local object size mismatch for ${object.key}`);
      }
      const actualSha256 = await sha256FileStreaming(object.localPath);
      if (actualSha256 !== object.sha256) {
        throw new Error(`Local object SHA-256 mismatch for ${object.key}`);
      }
      verifiedBytes += object.byteSize;
    }
  }));
  plan.localVerification = {
    valid: true,
    verifiedAt: new Date().toISOString(),
    verifiedObjects: plan.objects.length,
    verifiedBytes,
    sourceWrites: 0,
  };
  return plan.localVerification;
}

export function writeUploadPlan(plan, { destination }) {
  if (plan.localVerification?.valid !== true || plan.localVerification.verifiedObjects !== plan.objects.length) {
    throw new Error("Refusing to stage an upload plan before full local SHA-256 verification");
  }
  const root = path.resolve(destination);
  const batchesRoot = path.join(root, "batches");
  const stagingRoot = path.join(root, "staging");
  fs.mkdirSync(batchesRoot, { recursive: true });
  for (const object of plan.objects) {
    const stagedPath = path.join(stagingRoot, object.key);
    fs.mkdirSync(path.dirname(stagedPath), { recursive: true });
    let stat = null;
    try { stat = fs.lstatSync(stagedPath); } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    if (stat) {
      if (!stat.isSymbolicLink() || path.resolve(path.dirname(stagedPath), fs.readlinkSync(stagedPath)) !== path.resolve(object.localPath)) {
        throw new Error(`Staging collision for ${object.key}`);
      }
    } else {
      fs.symlinkSync(object.localPath, stagedPath);
    }
    object.stagedPath = stagedPath;
  }
  const manifestPath = path.join(root, "objects.jsonl");
  writeAtomic(manifestPath, `${plan.objects.map((object) => JSON.stringify(object)).join("\n")}\n`);
  const batchFiles = plan.batches.map((batch) => {
    const filename = path.join(batchesRoot, `${batch.id}.txt`);
    writeAtomic(filename, `${batch.keys.join("\n")}\n`);
    return filename;
  });
  const persisted = {
    ...plan,
    uploadRoot: stagingRoot,
    objectManifestPath: manifestPath,
    batches: plan.batches.map((batch, index) => ({ ...batch, filesFromPath: batchFiles[index] })),
  };
  const planPath = path.join(root, "plan.json");
  writeAtomic(planPath, `${JSON.stringify(persisted, null, 2)}\n`);
  return { planPath, manifestPath, batchFiles };
}

async function main() {
  const argv = process.argv.slice(2);
  const ledgerPath = flagValue(argv, "--ledger");
  const expectedSha = flagValue(argv, "--expected-ledger-sha");
  const destination = flagValue(argv, "--destination");
  const batchSize = Number(flagValue(argv, "--batch-size") ?? 250);
  if (!ledgerPath || !expectedSha || !destination) {
    throw new Error("Usage: --ledger <retry4.json> --expected-ledger-sha <sha256> --destination <directory> [--batch-size 250]");
  }
  const actualSha = sha256File(ledgerPath);
  if (actualSha !== expectedSha) throw new Error(`Derivative-ledger SHA mismatch: expected ${expectedSha}, got ${actualSha}`);
  const ledger = JSON.parse(fs.readFileSync(ledgerPath, "utf8"));
  const plan = buildLocalR2UploadPlan(ledger, {
    ledgerPath,
    ledgerSha256: actualSha,
    batchSize,
  });
  if (!plan.readyToUpload) {
    throw new Error(`Derivative ledger is incomplete: ${plan.summary.plannedRoles} planned roles remain`);
  }
  await verifyLocalObjects(plan);
  const written = writeUploadPlan(plan, { destination });
  console.log(JSON.stringify({ ...plan.summary, planPath: written.planPath, productionWrites: 0 }, null, 2));
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
