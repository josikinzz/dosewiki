#!/usr/bin/env bun

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile as execFileCallback, spawn } from "node:child_process";
import { promisify } from "node:util";
import { loadEnvFiles } from "../lib/data-ops-run-context.mjs";
import {
  CACHE_CONTROL,
  CONTENT_DISPOSITION,
  CONTENT_TYPE,
  DEFAULT_CDN_BASE,
  OPERATION,
  buildPlan,
  digestStream,
  hasCompletedCanary,
  installCandidateManifest,
  parseFlagValue,
  parseFlagValues,
  processObjects,
  readJsonLines,
  selectCanaryObjects,
  writeCandidateManifest,
} from "./socialCardR2Pipeline.mjs";

const DEFAULT_INPUT_MANIFEST = "src/data/entitySocialCardManifest.generated.json";
const DEFAULT_ASSETS_ROOT = "public/images/social";
const DEFAULT_TARGET_MANIFEST = "src/data/entitySocialCardManifest.generated.json";
const DEFAULT_LEDGER = "runs/social-card-r2-promotion/publisher-ledger.jsonl";
const DEFAULT_VERIFICATION_LEDGER = "runs/social-card-r2-promotion/verification-ledger.jsonl";
const execFile = promisify(execFileCallback);

function usage() {
  return `Usage:
  bun scripts/build/publishSocialCardsToR2.mjs \\
    --input-manifest=<manifest.json> --assets-root=<assets-dir> \\
    --candidate-manifest=<candidate.json> --ledger=<publisher.jsonl>

Default mode is local dry-run: it hashes every source, prints the immutable plan,
and optionally writes only the separate candidate manifest.

Credentialed read-only preflight:
  ... --preflight-r2 [--rclone-remote=replications-r2:replications --bucket-label=replications]

Limit a preflight or canary apply without creating a selector file:
  ... --canary-selector=replications:some-slug --canary-selector=contributors:some-profile

Canary apply (manifest remains untouched):
  ... --canary=<selectors.json> --apply \\
      --confirm-operation=${OPERATION} --confirm-plan=<dry-run-plan-digest> \\
      --confirm-target=<endpoint-host-or-rclone-remote> --confirm-bucket=<bucket>

Full resumable apply (requires completed canary in the same ledger):
  ... --resume --apply \\
      --confirm-operation=${OPERATION} --confirm-plan=<dry-run-plan-digest> \\
      --confirm-target=<endpoint-host-or-rclone-remote> --confirm-bucket=<bucket>

Install an object-verified candidate locally and preserve the prior manifest.
Deploy afterward, then run the full verifier to gate completion or rollback:
  ... --install-candidate --candidate-manifest=<candidate.json> \\
      --target-manifest=<target.json> --rollback-manifest=<rollback.json> \\
      --verification-ledger=<verification.jsonl> --apply \\
      --confirm-operation=${OPERATION} --confirm-plan=<dry-run-plan-digest> \\
      --confirm-target=<endpoint-host-or-rclone-remote> --confirm-bucket=<bucket>`;
}

export function requireApplyConfirmation(argv, targetIdentity, bucketIdentity, planDigest) {
  if (!argv.includes("--apply")) throw new Error("Mutation requires explicit --apply");
  const operation = parseFlagValue(argv, "--confirm-operation");
  if (operation !== OPERATION) throw new Error(`Refusing apply without --confirm-operation=${OPERATION}`);
  const confirmedPlan = parseFlagValue(argv, "--confirm-plan");
  if (confirmedPlan !== planDigest) throw new Error(`Refusing apply: --confirm-plan must exactly equal ${planDigest}`);
  const target = parseFlagValue(argv, "--confirm-target");
  if (target !== targetIdentity) throw new Error(`Refusing apply: --confirm-target must exactly equal ${targetIdentity}`);
  const bucket = parseFlagValue(argv, "--confirm-bucket");
  if (bucket !== bucketIdentity) throw new Error(`Refusing apply: --confirm-bucket must exactly equal ${bucketIdentity}`);
}

function loadR2Config() {
  const config = {
    accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
    endpoint: process.env.CLOUDFLARE_R2_S3_ENDPOINT,
    bucket: process.env.CLOUDFLARE_R2_BUCKET,
  };
  for (const [name, value] of Object.entries(config)) {
    if (!value) throw new Error(`Missing R2 configuration: ${name}`);
  }
  return config;
}

export function createBunR2Storage(config) {
  if (!globalThis.Bun?.S3Client) throw new Error("Credentialed R2 phases must run with Bun");
  const client = new Bun.S3Client(config);
  return {
    async exists(key) {
      return client.file(key).exists();
    },
    async digest(key) {
      return digestStream(client.file(key).stream());
    },
    async write(object) {
      await client.file(object.key).write(Bun.file(object.filename), {
        type: CONTENT_TYPE,
        cacheControl: CACHE_CONTROL,
        contentDisposition: CONTENT_DISPOSITION,
        retry: 8,
      });
    },
  };
}

export function rcloneObject(remote, key) {
  const match = /^([A-Za-z0-9._-]+):(.*)$/.exec(remote);
  if (!match) throw new Error(`Invalid --rclone-remote: ${remote}`);
  const remotePath = match[2].replace(/^\/+|\/+$/g, "");
  if (!remotePath) {
    throw new Error(`--rclone-remote must include the bucket/path suffix and may not target the account root: ${remote}`);
  }
  const segments = remotePath.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error(`Unsafe --rclone-remote path: ${remote}`);
  }
  return `${match[1]}:${segments.join("/")}/${key}`;
}

export function parseRcloneObjectStat(stdout, key) {
  let record;
  try {
    record = JSON.parse(stdout);
  } catch (error) {
    throw new Error(`rclone returned invalid JSON for ${key}: ${error.message}`);
  }
  if (record === null) return false;
  if (!record || record.IsDir === true || !Number.isSafeInteger(record.Size) || record.Size < 0) {
    throw new Error(`rclone returned invalid object metadata for ${key}`);
  }
  return true;
}

export function createRcloneStorage(remote) {
  return {
    async exists(key) {
      try {
        const { stdout } = await execFile("rclone", ["lsjson", rcloneObject(remote, key), "--stat", "--files-only"], { maxBuffer: 1024 * 1024 });
        return parseRcloneObjectStat(stdout, key);
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
      child.stderr.on("data", (chunk) => {
        if (stderr.length < 16_384) stderr += chunk;
      });
      const exitPromise = new Promise((resolve, reject) => {
        child.once("error", reject);
        child.once("close", resolve);
      });
      const result = await digestStream(child.stdout);
      const exitCode = await exitPromise;
      if (exitCode !== 0) throw new Error(`rclone digest read failed for ${key}: ${stderr.trim()}`);
      return result;
    },
    async write(object) {
      await execFile("rclone", ["copyto", object.filename, rcloneObject(remote, object.key), "--immutable"], { maxBuffer: 4 * 1024 * 1024 });
    },
  };
}

async function loadCanarySelectors(argv) {
  const selectors = parseFlagValues(argv, "--canary-selector");
  const canaryFile = parseFlagValue(argv, "--canary");
  if (canaryFile) selectors.push(...JSON.parse(await readFile(path.resolve(canaryFile), "utf8")));
  return selectors;
}

export async function main(argv = process.argv.slice(2)) {
  if (argv.includes("--help")) {
    console.log(usage());
    return;
  }
  loadEnvFiles({ rootDir: process.cwd(), env: process.env });
  const inputManifest = path.resolve(parseFlagValue(argv, "--input-manifest", DEFAULT_INPUT_MANIFEST));
  const assetsRoot = path.resolve(parseFlagValue(argv, "--assets-root", DEFAULT_ASSETS_ROOT));
  const candidateManifest = parseFlagValue(argv, "--candidate-manifest");
  const ledgerPath = path.resolve(parseFlagValue(argv, "--ledger", DEFAULT_LEDGER));
  const concurrency = Number(parseFlagValue(argv, "--concurrency", "4"));
  const cdnBase = parseFlagValue(argv, "--delivery-base", process.env.SOCIAL_CARD_CDN_BASE ?? DEFAULT_CDN_BASE);
  const plan = await buildPlan({ manifestPath: inputManifest, assetsRoot, cdnBase, concurrency: Math.min(concurrency, 32) });
  console.log(`[social-cards:r2] Plan ${plan.planDigest}`);
  console.log(`[social-cards:r2] ${plan.logicalCards.length} logical cards -> ${plan.objects.length} immutable objects (${(plan.totalBytes / 1024 / 1024).toFixed(1)} MiB).`);
  console.log(`[social-cards:r2] Input ${plan.inputManifestSha256}; target ${plan.cdnBase}/media/sha256/.`);

  if (candidateManifest) {
    await writeCandidateManifest(path.resolve(candidateManifest), plan);
    console.log(`[social-cards:r2] Candidate manifest written: ${path.resolve(candidateManifest)}`);
  }

  const preflight = argv.includes("--preflight-r2");
  const apply = argv.includes("--apply");
  const install = argv.includes("--install-candidate");
  if (!preflight && !apply && !install) {
    console.log("[social-cards:r2] Dry run complete: no network access, R2 writes, or installed-manifest changes.");
    return { plan, mode: "dry-run" };
  }

  const rcloneRemote = parseFlagValue(argv, "--rclone-remote");
  let storage;
  let targetIdentity;
  let bucketIdentity;
  if (rcloneRemote) {
    rcloneObject(rcloneRemote, "probe");
    bucketIdentity = parseFlagValue(argv, "--bucket-label");
    if (!bucketIdentity) throw new Error("--rclone-remote requires an explicit non-secret --bucket-label");
    targetIdentity = rcloneRemote;
    storage = createRcloneStorage(rcloneRemote);
  } else {
    const config = loadR2Config();
    targetIdentity = new URL(config.endpoint).host;
    bucketIdentity = config.bucket;
    storage = createBunR2Storage(config);
  }
  if (apply || install) requireApplyConfirmation(argv, targetIdentity, bucketIdentity, plan.planDigest);

  if (preflight && !apply && !install) {
    const selectors = await loadCanarySelectors(argv);
    const objects = selectors.length ? selectCanaryObjects(plan, selectors) : plan.objects;
    const summary = await processObjects({ plan, objects, storage, ledgerPath, mode: "preflight", concurrency, resume: true });
    console.log(`[social-cards:r2] Read-only preflight: ${objects.length} classified; ${summary.reused} exact reuse, ${summary.absent} absent, ${summary.resumed} resumed, zero writes.`);
    return { plan, mode: "preflight", summary };
  }

  if (install) {
    if (!candidateManifest) throw new Error("--install-candidate requires --candidate-manifest");
    const targetPath = path.resolve(parseFlagValue(argv, "--target-manifest", DEFAULT_TARGET_MANIFEST));
    const rollbackValue = parseFlagValue(argv, "--rollback-manifest");
    if (!rollbackValue) throw new Error("--install-candidate requires --rollback-manifest");
    const verificationLedgerPath = path.resolve(parseFlagValue(argv, "--verification-ledger", DEFAULT_VERIFICATION_LEDGER));
    await installCandidateManifest({
      plan,
      candidatePath: path.resolve(candidateManifest),
      targetPath,
      rollbackPath: path.resolve(rollbackValue),
      publisherLedgerPath: ledgerPath,
      verificationLedgerPath,
    });
    console.log(`[social-cards:r2] Installed verified candidate; rollback snapshot: ${path.resolve(rollbackValue)}`);
    return { plan, mode: "install" };
  }

  const selectors = await loadCanarySelectors(argv);
  if (selectors.length) {
    const objects = selectCanaryObjects(plan, selectors);
    const summary = await processObjects({ plan, objects, storage, ledgerPath, mode: "canary-apply", concurrency, resume: true });
    console.log(`[social-cards:r2] Canary complete: ${objects.length} objects (${summary.uploaded} uploaded, ${summary.reused} reused, ${summary.resumed} resumed).`);
    return { plan, mode: "canary", summary };
  }

  if (!argv.includes("--resume")) throw new Error("Full apply requires explicit --resume after a completed canary");
  const records = await readJsonLines(ledgerPath);
  if (!hasCompletedCanary(records, plan.planDigest)) throw new Error("Full apply refused: this exact plan has no completed canary in the ledger");
  const summary = await processObjects({ plan, objects: plan.objects, storage, ledgerPath, mode: "full-apply", concurrency, resume: true });
  console.log(`[social-cards:r2] Object publication complete: ${summary.uploaded} uploaded, ${summary.reused} reused, ${summary.resumed} resumed.`);
  console.log("[social-cards:r2] Candidate remains separate; run exhaustive delivery verification before installation.");
  return { plan, mode: "full", summary };
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((error) => {
    console.error(error);
    console.error(usage());
    process.exit(1);
  });
}
