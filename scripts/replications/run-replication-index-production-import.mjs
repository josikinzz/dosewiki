#!/usr/bin/env node

/** Guarded, resumable Convex import for the reviewed Replication Index plan. */

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api.js";
import { getFlagValue } from "../lib/data-ops-run-context.mjs";
import {
  assertProductionWriteAllowed,
  createProductionWriteCommand,
  printProductionWriteCommand,
  requireProductionWriteCredential,
} from "../lib/production-write-command.mjs";

export const OPERATION = "replication-index-production-import";
export const EXPECTED_DEPLOYMENT = "prod:glad-minnow-656";
export const EXPECTED_FINGERPRINT = "glad-minnow-656";
export const EXPECTED_TARGET = "https://glad-minnow-656.convex.cloud";
export const MAX_BATCH_SIZE = 25;

const SHA256 = /^[0-9a-f]{64}$/;
const COMMIT = /^[0-9a-f]{40}$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const R2_KEY = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9][A-Za-z0-9._/-]*$/;
const INSERT_FIELDS = new Set([
  "expected_absent", "slug", "title", "artist", "artist_url", "role", "type",
  "storage_id", "r2_key", "thumbnail_r2_key", "preview_r2_key", "motion_r2_key",
  "motion_poster_r2_key", "effect_slug", "thumbnail_storage_id", "url", "thumbnail_url",
  "width", "height", "format", "file_size", "duration", "has_audio", "effect_tags",
  "source_sha256", "taxonomy", "taxonomy_evidence", "rights_status", "license_name",
  "license_url", "credit_line", "source_url", "rightsholder", "permission_notes",
  "removal_contact",
]);
const R2_FIELDS = ["r2_key", "thumbnail_r2_key", "preview_r2_key", "motion_r2_key", "motion_poster_r2_key"];
const RIGHTS_FIELDS = ["rights_status", "license_name", "license_url", "credit_line", "source_url", "rightsholder", "permission_notes", "removal_contact"];
const TAXONOMY_FIELDS = new Set([
  "source_catalog_id", "taxonomy_record_key", "replication_status", "replication_status_confidence",
  "replication_status_review_required", "viewing_mode", "viewing_mode_tags", "viewing_mode_confidence",
  "viewing_mode_review_required", "title_drugs", "title_class_mentions", "drug_classes", "content_family",
  "content_tags", "content_family_confidence", "content_family_review_required", "taxonomy_review_required",
  "taxonomy_version", "taxonomy_source_digest", "taxonomy_updated_at",
]);
const EVIDENCE_FIELDS = new Set(["operation_id", "replication_status_rationale", "viewing_mode_rationale", "content_family_rationale"]);

const required = (condition, message) => { if (!condition) throw new Error(message); };
const readJson = (filename) => JSON.parse(readFileSync(filename, "utf8"));
const stable = (value) => Array.isArray(value)
  ? `[${value.map(stable).join(",")}]`
  : value && typeof value === "object"
    ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`
    : JSON.stringify(value);

export function digestValue(value) {
  return createHash("sha256").update(stable(value)).digest("hex");
}

function flag(argv, name, fallback) {
  return getFlagValue(argv, name) ?? fallback;
}

function normalizeArgv(argv) {
  const normalized = [];
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value.startsWith("--") && !value.includes("=") && argv[index + 1] && !argv[index + 1].startsWith("--")) {
      normalized.push(`${value}=${argv[index + 1]}`);
      index += 1;
    } else {
      normalized.push(value);
    }
  }
  return normalized;
}

function defaultArtifactsRoot() {
  return "/Users/josie/Documents/Dose Wiki Media Review/Data/Replication Index Campaign 2026-08-30";
}

function atomicJson(filename, value) {
  mkdirSync(path.dirname(filename), { recursive: true });
  const temporary = `${filename}.${process.pid}.part`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  renameSync(temporary, filename);
}

function validUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export function validateDesiredInsert(input) {
  required(input && typeof input === "object" && !Array.isArray(input), "desiredInsert must be an object.");
  for (const key of Object.keys(input)) required(INSERT_FIELDS.has(key), `desiredInsert has unsupported field: ${key}`);
  required(input.expected_absent === true, "desiredInsert expected_absent must be true.");
  required(SLUG.test(input.slug ?? ""), "desiredInsert slug must be kebab-case.");
  required(typeof input.title === "string" && input.title.trim(), "desiredInsert title is required.");
  required(typeof input.artist === "string" && input.artist.trim(), "desiredInsert artist is required.");
  required(input.role === "replication", "Production plan may only insert replication-role media.");
  required(["image", "video", "audio"].includes(input.type), "desiredInsert has an invalid media type.");
  required(typeof input.format === "string" && input.format === input.format.trim().toLowerCase() && !input.format.startsWith("."), "desiredInsert format must be lowercase without a dot.");
  required(SHA256.test(input.source_sha256 ?? ""), "desiredInsert requires a lowercase source_sha256.");
  required(typeof input.r2_key === "string" && R2_KEY.test(input.r2_key), "desiredInsert requires a valid canonical r2_key.");
  for (const key of R2_FIELDS) if (input[key] !== undefined) required(typeof input[key] === "string" && R2_KEY.test(input[key]), `desiredInsert has an invalid ${key}.`);
  required((input.motion_r2_key === undefined) === (input.motion_poster_r2_key === undefined), "GIF motion and poster keys must be a complete pair.");
  required(input.preview_r2_key === undefined || input.type === "video", "preview_r2_key is video-only.");
  required(input.motion_r2_key === undefined || (input.type === "image" && input.format === "gif"), "motion keys are GIF-only.");
  required(input.width === undefined || (Number.isInteger(input.width) && input.width > 0), "desiredInsert width must be a positive integer.");
  required(input.height === undefined || (Number.isInteger(input.height) && input.height > 0), "desiredInsert height must be a positive integer.");
  required((input.width === undefined) === (input.height === undefined), "desiredInsert width and height must be supplied together.");
  required(input.file_size === undefined || (Number.isInteger(input.file_size) && input.file_size > 0), "desiredInsert file_size must be a positive integer.");
  required(input.duration === undefined || (Number.isFinite(input.duration) && input.duration > 0), "desiredInsert duration must be positive.");
  required(input.type !== "image" || input.duration === undefined, "Image desiredInsert cannot have duration.");
  required(input.type === "video" || input.has_audio === undefined, "Only video desiredInsert may set has_audio.");
  required(input.taxonomy && typeof input.taxonomy === "object", "desiredInsert requires taxonomy.");
  for (const key of Object.keys(input.taxonomy)) required(TAXONOMY_FIELDS.has(key), `desiredInsert taxonomy has unsupported field: ${key}`);
  required(typeof input.taxonomy.taxonomy_record_key === "string" && input.taxonomy.taxonomy_record_key, "desiredInsert taxonomy_record_key is required.");
  required(input.taxonomy.replication_status === "replication", "desiredInsert taxonomy must remain a replication.");
  required(input.taxonomy.replication_status_review_required === false, "Replication-status review must be complete before import.");
  required(input.taxonomy.viewing_mode_review_required === false, "Viewing-mode review must be complete before import.");
  if (input.taxonomy.viewing_mode !== undefined) {
    const expectedViewingModeTags = input.taxonomy.viewing_mode === "mixed"
      ? ["closed-eye", "open-eye"]
      : input.taxonomy.viewing_mode === "uncertain"
        ? []
        : [input.taxonomy.viewing_mode];
    required(
      stable([...(input.taxonomy.viewing_mode_tags ?? [])].sort()) === stable(expectedViewingModeTags),
      `viewing_mode_tags do not match viewing_mode ${input.taxonomy.viewing_mode}.`,
    );
  }
  const expectedTaxonomyReviewRequired = Boolean(
    input.taxonomy.replication_status_review_required
      || input.taxonomy.viewing_mode_review_required
      || input.taxonomy.content_family_review_required,
  );
  required(
    input.taxonomy.taxonomy_review_required === expectedTaxonomyReviewRequired,
    "taxonomy_review_required must equal the component review flags.",
  );
  required(SHA256.test(input.taxonomy.taxonomy_source_digest ?? ""), "desiredInsert taxonomy_source_digest is invalid.");
  required(input.taxonomy_evidence && typeof input.taxonomy_evidence === "object", "desiredInsert requires taxonomy evidence.");
  for (const key of Object.keys(input.taxonomy_evidence)) required(EVIDENCE_FIELDS.has(key), `desiredInsert taxonomy evidence has unsupported field: ${key}`);
  for (const field of ["operation_id", "replication_status_rationale", "content_family_rationale"]) {
    required(typeof input.taxonomy_evidence[field] === "string" && input.taxonomy_evidence[field].trim(), `desiredInsert taxonomy evidence requires ${field}.`);
  }
  required(input.rights_status === "creator-retained", "Only reviewed creator-retained rights may be imported by this plan.");
  required(typeof input.credit_line === "string" && input.credit_line.trim(), "desiredInsert credit_line is required.");
  required(validUrl(input.source_url), "desiredInsert source_url must be an HTTP(S) URL.");
  required(typeof input.removal_contact === "string" && input.removal_contact.trim(), "desiredInsert removal_contact is required.");
  required(input.artist_url === undefined || validUrl(input.artist_url), "desiredInsert artist_url is invalid.");
  return input;
}

function validateArtifacts(plan, canary, template) {
  required(plan?.artifactType === "replication-index-production-import-plan" && plan.schemaVersion === 1, "Unsupported production plan.");
  const core = structuredClone(plan);
  const declaredDigest = core.planDigestSha256;
  delete core.planDigestSha256;
  required(SHA256.test(declaredDigest ?? "") && digestValue(core) === declaredDigest, "Plan digest drift detected.");
  required(plan.deployment === EXPECTED_DEPLOYMENT && plan.target === EXPECTED_TARGET, "Plan must target exact production glad-minnow-656.");
  required(COMMIT.test(plan.application?.commit ?? ""), "Plan application commit is invalid.");
  required(Array.isArray(plan.actions), "Plan actions are missing.");
  required(plan.actions.length === new Set(plan.actions.map((row) => row.sha256)).size, "Plan action SHAs are not unique.");
  required(canary?.artifactType === "replication-index-production-canary", "Unsupported canary artifact.");
  const canaryCore = structuredClone(canary);
  const canaryDigest = canaryCore.canaryDigestSha256;
  delete canaryCore.canaryDigestSha256;
  required(SHA256.test(canaryDigest ?? "") && digestValue(canaryCore) === canaryDigest, "Canary digest drift detected.");
  required(canary.planDigestSha256 === declaredDigest && canary.deployment === EXPECTED_DEPLOYMENT, "Canary lineage drift detected.");
  required(template?.artifactType === "replication-index-production-ledger-template", "Unsupported ledger template.");
  required(template.planDigestSha256 === declaredDigest && template.applicationCommit === plan.application.commit, "Ledger template lineage drift detected.");
  required(template.deployment === EXPECTED_DEPLOYMENT && template.target === EXPECTED_TARGET, "Ledger template target drift detected.");
  return declaredDigest;
}

function createRuntimeLedger(template, planPath, canaryDigest, now) {
  const items = Object.fromEntries(Object.entries(template.items ?? {}).map(([sha, item]) => [sha, {
    action: item.action,
    status: item.action === "create" && item.eligibleForWrite ? "pending" : "not-applicable",
    attempts: 0,
    productionId: null,
    startedAt: null,
    verifiedAt: null,
    error: null,
  }]));
  return {
    schemaVersion: 1,
    artifactType: "replication-index-production-import-ledger",
    operationId: template.operationId,
    deployment: EXPECTED_DEPLOYMENT,
    target: EXPECTED_TARGET,
    plan: { path: path.resolve(planPath), digestSha256: template.planDigestSha256, applicationCommit: template.applicationCommit, canaryDigestSha256: canaryDigest },
    createdAt: now,
    updatedAt: now,
    policy: { canaryFirst: true, maxBatchSize: MAX_BATCH_SIZE, retryUncertain: false, deletesAllowed: false, mediaDeletesAllowed: false },
    items,
  };
}

function validateLedger(ledger, planPath, plan, canary) {
  required(ledger?.artifactType === "replication-index-production-import-ledger", "Unsupported runtime ledger.");
  required(ledger.deployment === EXPECTED_DEPLOYMENT && ledger.target === EXPECTED_TARGET, "Runtime ledger target drift detected.");
  required(ledger.plan?.path === path.resolve(planPath), "Runtime ledger plan path drift detected.");
  required(ledger.plan?.digestSha256 === plan.planDigestSha256 && ledger.plan?.applicationCommit === plan.application.commit && ledger.plan?.canaryDigestSha256 === canary.canaryDigestSha256, "Runtime ledger lineage drift detected.");
  for (const state of Object.values(ledger.items ?? {})) required(!["uncertain", "applying", "verifying"].includes(state.status), `Ledger contains an uncertain outcome (${state.status}); manual reconciliation is required.`);
}

function selectActions(plan, canary, ledger, phase, batchSize) {
  const bySha = new Map(plan.actions.map((row) => [row.sha256, row]));
  const canaryShas = new Set(canary.items.map((item) => item.sha256));
  if (phase === "remaining") {
    for (const sha of canaryShas) required(ledger.items?.[sha]?.status === "verified", "Remaining batches are blocked until every canary row is verified.");
  }
  const shas = phase === "canary"
    ? [...canaryShas]
    : plan.actions.filter((row) => row.action === "create" && !canaryShas.has(row.sha256)).map((row) => row.sha256);
  const selected = [];
  for (const sha of shas) {
    const row = bySha.get(sha);
    required(row, `Selected SHA is absent from the plan: ${sha}`);
    required(row.action === "create", `Selected SHA ${sha} is not a create row (${row.action}).`);
    required(Array.isArray(row.blockers) && row.blockers.length === 0, `Selected create SHA ${sha} is blocked or held.`);
    required(row.desiredInsert?.source_sha256 === sha, `Selected SHA ${sha} desiredInsert identity drifted.`);
    validateDesiredInsert(row.desiredInsert);
    const state = ledger.items?.[sha];
    required(state, `Runtime ledger is missing selected SHA ${sha}.`);
    if (state.status === "verified") continue;
    required(state.status === "pending", `Selected SHA ${sha} is ${state.status}; automatic retry is forbidden.`);
    selected.push(row);
    if (selected.length >= batchSize) break;
  }
  return selected;
}

function assertReadBack(row, result, stored) {
  const expected = row.desiredInsert;
  required(stored && stored._id === result.id, `${row.sha256}: read-back ID mismatch.`);
  required(stored.slug === expected.slug && stored.source_sha256 === expected.source_sha256, `${row.sha256}: read-back source_sha256/slug mismatch.`);
  for (const field of R2_FIELDS) required(stored[field] === expected[field], `${row.sha256}: read-back ${field} drift.`);
  for (const field of RIGHTS_FIELDS) required(stored[field] === expected[field], `${row.sha256}: read-back ${field} drift.`);
  for (const [field, value] of Object.entries(expected.taxonomy)) {
    const storedValue = Array.isArray(value) && stored[field] === undefined ? [] : stored[field];
    required(stable(storedValue) === stable(value), `${row.sha256}: read-back taxonomy.${field} drift.`);
  }
  for (const field of ["title", "artist", "artist_url", "role", "type", "effect_slug", "width", "height", "format", "file_size", "duration", "has_audio", "effect_tags"]) {
    const storedValue = Array.isArray(expected[field]) && stored[field] === undefined ? [] : stored[field];
    required(stable(storedValue) === stable(expected[field]), `${row.sha256}: read-back ${field} drift.`);
  }
}

function safeErrorMessage(error, secrets = []) {
  let message = error instanceof Error ? error.message : String(error);
  for (const secret of secrets) {
    if (secret) message = message.split(secret).join("[redacted]");
  }
  return message.slice(0, 2000);
}

export async function runProductionImport({
  argv = process.argv.slice(2),
  env = process.env,
  gitCommit,
  clientFactory = (url) => new ConvexHttpClient(url),
  now = () => new Date().toISOString(),
  logger = console,
} = {}) {
  argv = normalizeArgv(argv);
  const root = defaultArtifactsRoot();
  const planPath = path.resolve(flag(argv, "--plan", path.join(root, "production-import-plan-2026-08-31.json")));
  const canaryPath = path.resolve(flag(argv, "--canary", path.join(root, "production-import-canary-2026-08-31.json")));
  const templatePath = path.resolve(flag(argv, "--ledger-template", path.join(root, "production-import-ledger-template-2026-08-31.json")));
  const ledgerPath = path.resolve(flag(argv, "--ledger", path.join(path.dirname(planPath), "production-import-ledger.json")));
  for (const filename of [planPath, canaryPath, templatePath]) required(existsSync(filename), `Required artifact is missing: ${filename}`);

  const plan = readJson(planPath);
  const canary = readJson(canaryPath);
  const template = readJson(templatePath);
  const planDigest = validateArtifacts(plan, canary, template);
  const command = createProductionWriteCommand({ operation: OPERATION, argv, env, startDir: path.dirname(fileURLToPath(import.meta.url)), loadsEnvLocal: false });
  printProductionWriteCommand(command, { logger });
  const phase = flag(argv, "--phase", "canary");
  required(["canary", "remaining"].includes(phase), "--phase must be canary or remaining.");
  const batchSize = Number(flag(argv, "--batch-size", phase === "canary" ? canary.items.length : 10));
  required(Number.isInteger(batchSize) && batchSize > 0 && batchSize <= MAX_BATCH_SIZE, `--batch-size must be between 1 and ${MAX_BATCH_SIZE}.`);
  const currentCommit = gitCommit ?? execFileSync("git", ["rev-parse", "HEAD"], { cwd: command.repoRoot, encoding: "utf8" }).trim();
  required(currentCommit === plan.application.commit, `Application commit mismatch: plan pins ${plan.application.commit}, current checkout is ${currentCommit}.`);

  let ledger = existsSync(ledgerPath) ? readJson(ledgerPath) : createRuntimeLedger(template, planPath, canary.canaryDigestSha256, now());
  validateLedger(ledger, planPath, plan, canary);
  const selected = selectActions(plan, canary, ledger, phase, batchSize);
  logger.log(JSON.stringify({ mode: command.dryRun ? "dry-run" : "write-requested", deployment: EXPECTED_FINGERPRINT, phase, planDigestSha256: planDigest, applicationCommit: currentCommit, selected: selected.length }, null, 2));
  if (command.dryRun) return { mode: "dry-run", selected: selected.length, networkCalls: 0, wrote: false };

  assertProductionWriteAllowed(command);
  required(command.targetUrl === EXPECTED_TARGET && command.deploymentFingerprint === EXPECTED_FINGERPRINT, `Write target must be exact production ${EXPECTED_FINGERPRINT}.`);
  required(plan.writeAuthorized === true && plan.dryRunOnly === false, "Plan has not been explicitly authorized for production writes.");
  required(canary.writeAuthorized === true, "Canary artifact has not been explicitly authorized for production writes.");
  const expectedDigest = flag(argv, "--expected-plan-digest");
  const expectedCommit = flag(argv, "--expected-application-commit");
  required(expectedDigest === planDigest, "Write requires the exact --expected-plan-digest pin.");
  required(expectedCommit === currentCommit, "Write requires the exact --expected-application-commit pin.");
  const apiKey = requireProductionWriteCredential("replicationMaintenance", { env }).token;
  const client = clientFactory(command.targetUrl);
  if (!existsSync(ledgerPath)) atomicJson(ledgerPath, ledger);

  let verified = 0;
  for (const row of selected) {
    const state = ledger.items[row.sha256];
    state.status = "applying";
    state.attempts += 1;
    state.startedAt = now();
    ledger.updatedAt = state.startedAt;
    atomicJson(ledgerPath, ledger);
    try {
      const result = await client.mutation(api.replications.insertMediaAsset, { apiKey, ...row.desiredInsert });
      required(result.slug === row.desiredInsert.slug && result.role === row.desiredInsert.role, `${row.sha256}: insert result drift.`);
      state.productionId = result.id;
      state.inserted = result.inserted;
      state.status = "verifying";
      ledger.updatedAt = now();
      atomicJson(ledgerPath, ledger);
      const stored = await client.query(api.replications.getBySlug, { slug: row.desiredInsert.slug });
      assertReadBack(row, result, stored);
      state.status = "verified";
      state.verifiedAt = now();
      state.error = null;
      ledger.updatedAt = state.verifiedAt;
      atomicJson(ledgerPath, ledger);
      verified += 1;
    } catch (error) {
      state.status = "uncertain";
      state.error = {
        code: "uncertain-outcome",
        message: "Mutation dispatch began but exact read-back was not verified; manual reconciliation is required.",
        diagnostic: safeErrorMessage(error, [apiKey]),
      };
      ledger.updatedAt = now();
      atomicJson(ledgerPath, ledger);
      throw new Error(`${row.sha256}: uncertain production outcome; stopped without retry.`);
    }
  }
  return { mode: "write", phase, selected: selected.length, verified, networkCalls: selected.length * 2, wrote: selected.length > 0 };
}

async function main() {
  await runProductionImport();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
