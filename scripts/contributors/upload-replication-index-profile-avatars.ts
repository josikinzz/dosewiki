#!/usr/bin/env node
/**
 * Guarded two-stage uploader for the eight reviewed Replication Index profiles.
 *
 * Default mode is a zero-network dry run. Production uploads require a canary
 * command followed by a separate remaining-files command. Both commands write
 * a resumable, nonsecret ledger atomically after every state transition. The
 * contributor mutation is only ever called with `dryRun: true`; this script
 * cannot create or update a contributor profile.
 */
import { createHash } from "node:crypto";
import {
  existsSync,
  closeSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { ConvexHttpClient } from "convex/browser";

import { api } from "../../convex/_generated/api.js";
import type { Id } from "../../convex/_generated/dataModel.js";
import type { ReviewedProfileImportArgs } from "../../convex/lib/contributorProfileImports.js";
import {
  assertProductionWriteAllowed,
  createProductionWriteCommand,
  printProductionWriteCommand,
  requireProductionWriteCredential,
} from "../lib/production-write-command.mjs";

export const OPERATION = "upload-replication-index-profile-avatars";
export const DEPLOYMENT = "glad-minnow-656";
export const TARGET_URL = `https://${DEPLOYMENT}.convex.cloud`;
export const CANARY_KEY = "BRYANITCH";
export const EXPECTED_PLAN_PAYLOAD_SHA256 =
  "972df2793a476cc675791972d90c07a19736f909577d1442c7528fa81d687573";
export const EXPECTED_PROJECTION_SHA256 =
  "a3e501a7a9b938037cb4f04bc7b19fdcfb98aef236f0fd9814f6c299c5ab21cc";
export const EXPECTED_DEPLOYMENT_RECEIPT_SHA256 =
  "45e94cc9cf4ce1e53db88aa2975bb409b26c4f3369f62035bacdc84aaa7b5230";

const REPO_ROOT = path.resolve(import.meta.dirname, "../..");
const MEDIA_REVIEW_ROOT = path.resolve(REPO_ROOT, "../../Dose Wiki Media Review");
const CAMPAIGN_ROOT = path.join(
  MEDIA_REVIEW_ROOT,
  "Data/Replication Index Campaign 2026-08-30",
);

export const DEFAULT_PLAN_PATH = path.join(
  CAMPAIGN_ROOT,
  "profile-avatar-staging-2026-08-31/convex-storage-upload-plan.json",
);
export const DEFAULT_PROJECTION_PATH = path.join(
  REPO_ROOT,
  "lib/convex/fixtures/contributor-profile-import-projection-a3e501a7.json",
);
export const DEFAULT_DEPLOYMENT_RECEIPT_PATH = path.join(
  CAMPAIGN_ROOT,
  "convex-backend-deployment-2026-08-31.json",
);
export const DEFAULT_LEDGER_PATH = path.join(
  CAMPAIGN_ROOT,
  "profile-avatar-staging-2026-08-31/convex-storage-upload-ledger.json",
);

type JsonObject = Record<string, unknown>;

type UploadPlanRecord = {
  key: string;
  displayName: string;
  avatarDisposition: "convex-storage-upload-pending" | "ui-initials-no-file";
  localAsset: null | {
    path: string;
    sha256: string;
    byteSize: number;
    contentType: string;
  };
};

type UploadPlan = {
  schemaVersion: number;
  artifactType: string;
  campaignId: string;
  payloadSha256: string;
  counts: { profiles: number; uploadPending: number; initialsFallback: number };
  sources: { contributorProfileImportProjection: { sha256: string } };
  records: UploadPlanRecord[];
};

type ProjectionLink = { kind: string; url: string; notImportedReason?: string };
type CreateProjection = {
  operation: string;
  key: string;
  displayName: string;
  aliases: string[];
  role: string;
  links: ProjectionLink[];
  evidenceOnlyLinks: ProjectionLink[];
};
type ContributorProjection = {
  artifactType: string;
  campaignId: string;
  counts: { profileLinkLimit: number };
  createProfiles: CreateProjection[];
};

export type ValidatedUpload = {
  key: string;
  displayName: string;
  assetPath: string;
  sha256: string;
  byteSize: number;
  contentType: string;
};

export type ValidatedInputs = {
  campaignId: string;
  planSha256: string;
  planPayloadSha256: string;
  projectionSha256: string;
  deploymentReceiptSha256: string;
  uploads: ValidatedUpload[];
  projection: ContributorProjection;
};

export type UploadLedgerRow = ValidatedUpload & {
  phase: "canary" | "remaining";
  status: "pending" | "uploading" | "uploaded" | "uncertain";
  attempts: number;
  storageId: string | null;
  startedAt: string | null;
  uploadedAt: string | null;
  errorCode: string | null;
};

export type AvatarUploadLedger = {
  schemaVersion: 1;
  artifactType: "replication-index-profile-avatar-upload-ledger";
  campaignId: string;
  targetDeployment: typeof DEPLOYMENT;
  targetUrl: typeof TARGET_URL;
  planSha256: string;
  planPayloadSha256: string;
  projectionSha256: string;
  deploymentReceiptSha256: string;
  canaryKey: typeof CANARY_KEY;
  createdAt: string;
  updatedAt: string;
  uploads: UploadLedgerRow[];
  profileDryRuns: Array<{
    phase: "canary" | "remaining";
    at: string;
    payloadSha256: string;
    avatarStorageBindings: number;
    result: {
      created: number;
      updated: number;
      unchanged: number;
      skipped: number;
      blocked: number;
    };
  }>;
};

function sha256(bytes: string | Buffer) {
  return createHash("sha256").update(bytes).digest("hex");
}

function payloadDigest(document: JsonObject) {
  const { payloadSha256: _ignored, ...payload } = document;
  return sha256(`${JSON.stringify(payload)}\n`);
}

function mediaReviewRootForPlan(planPath: string) {
  const marker = `${path.sep}Data${path.sep}`;
  const index = path.resolve(planPath).indexOf(marker);
  if (index < 1) throw new Error("Avatar plan must live beneath a Data directory.");
  return path.resolve(planPath).slice(0, index);
}

function assertExactKeys(actual: string[], expected: string[], label: string) {
  const left = [...actual].sort();
  const right = [...expected].sort();
  if (JSON.stringify(left) !== JSON.stringify(right)) {
    throw new Error(`${label} changed: expected ${right.join(", ")}; got ${left.join(", ")}.`);
  }
}

export function validateInputs({
  planPath = DEFAULT_PLAN_PATH,
  projectionPath = DEFAULT_PROJECTION_PATH,
  deploymentReceiptPath = DEFAULT_DEPLOYMENT_RECEIPT_PATH,
}: {
  planPath?: string;
  projectionPath?: string;
  deploymentReceiptPath?: string;
} = {}): ValidatedInputs {
  const planBytes = readFileSync(planPath);
  const projectionBytes = readFileSync(projectionPath);
  const receiptBytes = readFileSync(deploymentReceiptPath);
  const plan = JSON.parse(planBytes.toString("utf8")) as UploadPlan;
  const projection = JSON.parse(projectionBytes.toString("utf8")) as ContributorProjection;
  const receipt = JSON.parse(receiptBytes.toString("utf8")) as JsonObject;

  if (plan.artifactType !== "replication-index-reviewed-profile-avatar-storage-plan") {
    throw new Error("Unexpected reviewed avatar upload plan artifact type.");
  }
  if (plan.payloadSha256 !== EXPECTED_PLAN_PAYLOAD_SHA256 || payloadDigest(plan as unknown as JsonObject) !== plan.payloadSha256) {
    throw new Error("Reviewed avatar upload plan payload digest drifted.");
  }
  const projectionSha256 = sha256(projectionBytes);
  if (
    projectionSha256 !== EXPECTED_PROJECTION_SHA256
    || plan.sources.contributorProfileImportProjection.sha256 !== projectionSha256
  ) {
    throw new Error("Contributor profile projection digest drifted.");
  }
  if (
    projection.artifactType !== "replication-index-contributor-profile-import-projection"
    || projection.campaignId !== plan.campaignId
  ) {
    throw new Error("Contributor projection is not bound to the reviewed avatar plan.");
  }
  if (
    plan.counts.profiles !== 8
    || plan.counts.uploadPending !== 4
    || plan.counts.initialsFallback !== 4
    || projection.createProfiles.length !== 8
    || projection.counts.profileLinkLimit !== 3
  ) {
    throw new Error("Expected exactly eight reviewed profiles, four uploads, and four initials fallbacks.");
  }
  assertExactKeys(
    plan.records.map((record) => record.key),
    projection.createProfiles.map((profile) => profile.key),
    "Reviewed profile scope",
  );
  if (projection.createProfiles.some((profile) => profile.operation !== "create-candidate")) {
    throw new Error("Contributor projection contains a non-create operation in its reviewed-new scope.");
  }
  for (const profile of projection.createProfiles) {
    if (profile.links.length > 3) throw new Error(`Profile ${profile.key} exceeds the three-link limit.`);
    if (profile.evidenceOnlyLinks.some((link) => !link.notImportedReason)) {
      throw new Error(`Profile ${profile.key} has an evidence-only link without a reason.`);
    }
  }

  const deployment = receipt.deployment as JsonObject | undefined;
  const result = receipt.deploymentResult as JsonObject | undefined;
  const verifiedFunctions = result?.verifiedLiveFunctions;
  if (
    sha256(receiptBytes) !== EXPECTED_DEPLOYMENT_RECEIPT_SHA256
    || deployment?.name !== `prod:${DEPLOYMENT}`
    || deployment?.url !== TARGET_URL
    || deployment?.applicationCommit !== "6970b83c"
    || !Array.isArray(verifiedFunctions)
    || !verifiedFunctions.includes("contributorProfiles.js:importReviewedProfilePlan")
  ) {
    throw new Error("Convex deployment receipt does not prove the reviewed profile import contract.");
  }

  const mediaRoot = mediaReviewRootForPlan(planPath);
  const uploads = plan.records
    .filter((record) => record.avatarDisposition === "convex-storage-upload-pending")
    .map((record) => {
      if (!record.localAsset) throw new Error(`Upload ${record.key} has no local asset.`);
      const assetPath = path.resolve(mediaRoot, record.localAsset.path);
      const bytes = readFileSync(assetPath);
      const actualSha256 = sha256(bytes);
      if (
        actualSha256 !== record.localAsset.sha256
        || bytes.byteLength !== record.localAsset.byteSize
        || path.basename(assetPath).split(".")[0] !== actualSha256
        || !["image/jpeg", "image/png"].includes(record.localAsset.contentType)
      ) {
        throw new Error(`Digest-bound avatar validation failed for ${record.key}.`);
      }
      return {
        key: record.key,
        displayName: record.displayName,
        assetPath,
        sha256: actualSha256,
        byteSize: bytes.byteLength,
        contentType: record.localAsset.contentType,
      };
    });
  if (uploads.length !== 4 || !uploads.some((row) => row.key === CANARY_KEY)) {
    throw new Error(`Expected four uploads including canary ${CANARY_KEY}.`);
  }

  return {
    campaignId: plan.campaignId,
    planSha256: sha256(planBytes),
    planPayloadSha256: plan.payloadSha256,
    projectionSha256,
    deploymentReceiptSha256: sha256(receiptBytes),
    uploads,
    projection,
  };
}

function normalizeLink(link: ProjectionLink) {
  const label = link.kind.trim().slice(0, 60);
  const url = new URL(link.url);
  if (!label || url.protocol !== "https:") throw new Error(`Invalid reviewed profile link: ${link.url}`);
  return { label, url: url.toString() };
}

export function buildEightProfilePayload(
  inputs: ValidatedInputs,
  storageIds: ReadonlyMap<string, string> = new Map(),
): Omit<ReviewedProfileImportArgs, "apiKey"> {
  const uploadKeys = new Set(inputs.uploads.map((upload) => upload.key));
  for (const [key, storageId] of storageIds) {
    if (!uploadKeys.has(key) || !storageId.trim()) {
      throw new Error(`Unexpected or empty avatar Storage binding for ${key}.`);
    }
  }
  return {
    operationId: inputs.campaignId,
    dryRun: true,
    entries: inputs.projection.createProfiles.map((profile) => ({
      outcome: "reviewed-new" as const,
      creatorName: profile.displayName,
      creatorKind: "person" as const,
      expectedAbsent: true as const,
      profile: {
        key: profile.key,
        displayName: profile.displayName,
        aliases: profile.aliases,
        avatarStorageId: storageIds.has(profile.key)
          ? (storageIds.get(profile.key)! as Id<"_storage">)
          : null,
        avatarR2Key: null,
        avatarUrl: null,
        bio: "",
        role: profile.role,
        links: profile.links.map(normalizeLink),
      },
    })),
  };
}

export function createLedger(inputs: ValidatedInputs, now = new Date().toISOString()): AvatarUploadLedger {
  return {
    schemaVersion: 1,
    artifactType: "replication-index-profile-avatar-upload-ledger",
    campaignId: inputs.campaignId,
    targetDeployment: DEPLOYMENT,
    targetUrl: TARGET_URL,
    planSha256: inputs.planSha256,
    planPayloadSha256: inputs.planPayloadSha256,
    projectionSha256: inputs.projectionSha256,
    deploymentReceiptSha256: inputs.deploymentReceiptSha256,
    canaryKey: CANARY_KEY,
    createdAt: now,
    updatedAt: now,
    uploads: inputs.uploads.map((upload) => ({
      ...upload,
      phase: upload.key === CANARY_KEY ? "canary" : "remaining",
      status: "pending",
      attempts: 0,
      storageId: null,
      startedAt: null,
      uploadedAt: null,
      errorCode: null,
    })),
    profileDryRuns: [],
  };
}

export function validateLedger(ledger: AvatarUploadLedger, inputs: ValidatedInputs) {
  if (
    ledger.artifactType !== "replication-index-profile-avatar-upload-ledger"
    || ledger.campaignId !== inputs.campaignId
    || ledger.targetDeployment !== DEPLOYMENT
    || ledger.targetUrl !== TARGET_URL
    || ledger.planSha256 !== inputs.planSha256
    || ledger.planPayloadSha256 !== inputs.planPayloadSha256
    || ledger.projectionSha256 !== inputs.projectionSha256
    || ledger.deploymentReceiptSha256 !== inputs.deploymentReceiptSha256
    || ledger.canaryKey !== CANARY_KEY
  ) {
    throw new Error("Avatar upload ledger is stale or targets the wrong campaign/deployment.");
  }
  assertExactKeys(
    ledger.uploads.map((row) => row.key),
    inputs.uploads.map((row) => row.key),
    "Avatar upload ledger",
  );
  const expected = new Map(inputs.uploads.map((row) => [row.key, row]));
  for (const row of ledger.uploads) {
    const source = expected.get(row.key)!;
    const expectedPhase = row.key === CANARY_KEY ? "canary" : "remaining";
    const statusIsValid = ["pending", "uploading", "uploaded", "uncertain"].includes(row.status);
    if (
      row.sha256 !== source.sha256
      || row.byteSize !== source.byteSize
      || row.contentType !== source.contentType
      || row.assetPath !== source.assetPath
      || row.phase !== expectedPhase
      || !statusIsValid
      || !Number.isInteger(row.attempts)
      || row.attempts < 0
      || (row.status === "pending" && row.attempts !== 0)
      || (row.status !== "pending" && row.attempts < 1)
      || (row.status === "uploaded" && !row.storageId)
      || (row.storageId && row.status !== "uploaded")
      || (row.status === "uncertain" && row.errorCode !== "upload-outcome-uncertain")
    ) {
      throw new Error(`Avatar upload ledger drifted for ${row.key}.`);
    }
  }
  const phases = ledger.profileDryRuns.map((run) => run.phase);
  if (new Set(phases).size !== phases.length) {
    throw new Error("Avatar upload ledger repeats a profile dry-run phase.");
  }
  for (const run of ledger.profileDryRuns) {
    if (!(["canary", "remaining"] as const).includes(run.phase)) {
      throw new Error("Avatar upload ledger has an invalid profile dry-run phase.");
    }
    const selectedRows = ledger.uploads.filter((row) =>
      run.phase === "canary" ? row.key === CANARY_KEY : true,
    );
    if (selectedRows.some((row) => row.status !== "uploaded" || !row.storageId)) {
      throw new Error(`Avatar upload ledger records ${run.phase} verification before its uploads.`);
    }
    const storageIds = new Map(selectedRows.map((row) => [row.key, row.storageId!]));
    const expectedPayload = buildEightProfilePayload(inputs, storageIds);
    const expectedPayloadSha256 = sha256(`${JSON.stringify(expectedPayload)}\n`);
    if (
      run.payloadSha256 !== expectedPayloadSha256
      || run.avatarStorageBindings !== storageIds.size
      || run.result.blocked !== 0
      || run.result.updated !== 0
      || run.result.created + run.result.unchanged !== 8
      || run.result.skipped !== 0
    ) {
      throw new Error(`Avatar upload ledger has an invalid ${run.phase} profile dry run.`);
    }
  }
  return ledger;
}

export function writeLedgerAtomic(ledgerPath: string, ledger: AvatarUploadLedger) {
  mkdirSync(path.dirname(ledgerPath), { recursive: true });
  const temporaryPath = `${ledgerPath}.tmp-${process.pid}`;
  writeFileSync(temporaryPath, `${JSON.stringify(ledger, null, 2)}\n`, { mode: 0o600 });
  renameSync(temporaryPath, ledgerPath);
}

export function acquireLedgerLock(
  ledgerPath: string,
  now = new Date().toISOString(),
) {
  mkdirSync(path.dirname(ledgerPath), { recursive: true });
  const lockPath = `${ledgerPath}.lock`;
  let descriptor: number;
  try {
    descriptor = openSync(lockPath, "wx", 0o600);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error(
        `Avatar upload ledger is locked at ${lockPath}; verify no uploader is running before removing a stale lock.`,
      );
    }
    throw error;
  }
  writeFileSync(descriptor, `${JSON.stringify({ pid: process.pid, acquiredAt: now })}\n`);
  let released = false;
  return {
    lockPath,
    release() {
      if (released) return;
      released = true;
      closeSync(descriptor);
      unlinkSync(lockPath);
    },
  };
}

export function readOrCreateLedger(ledgerPath: string, inputs: ValidatedInputs) {
  if (!existsSync(ledgerPath)) return createLedger(inputs);
  return validateLedger(
    JSON.parse(readFileSync(ledgerPath, "utf8")) as AvatarUploadLedger,
    inputs,
  );
}

type UploadDependencies = {
  generateUploadUrl: () => Promise<string>;
  upload: (url: string, contentType: string, bytes: Buffer) => Promise<{ storageId: string }>;
  dryRunProfiles: (
    payload: Omit<ReviewedProfileImportArgs, "apiKey">,
  ) => Promise<{
    created: number;
    updated: number;
    unchanged: number;
    skipped: number;
    blocked: number;
  }>;
  persist: (ledger: AvatarUploadLedger) => void;
  now?: () => string;
};

export async function runUploadPhase(
  phase: "canary" | "remaining",
  inputs: ValidatedInputs,
  ledger: AvatarUploadLedger,
  dependencies: UploadDependencies,
) {
  validateLedger(ledger, inputs);
  const now = dependencies.now ?? (() => new Date().toISOString());
  const canary = ledger.uploads.find((row) => row.key === CANARY_KEY)!;
  if (phase === "remaining") {
    if (canary.status !== "uploaded") throw new Error("Canary upload has not completed.");
    if (!ledger.profileDryRuns.some((run) => run.phase === "canary" && run.result.blocked === 0)) {
      throw new Error("Canary profile dry run has not passed.");
    }
  }
  const selected = ledger.uploads.filter((row) => row.phase === phase);
  for (const row of selected) {
    if (row.status === "uploaded") continue;
    if (row.status !== "pending") {
      throw new Error(`Upload ${row.key} is ${row.status}; manual reconciliation is required before retry.`);
    }
    const bytes = readFileSync(row.assetPath);
    if (sha256(bytes) !== row.sha256 || bytes.byteLength !== row.byteSize) {
      throw new Error(`Avatar bytes drifted before upload for ${row.key}.`);
    }
    row.status = "uploading";
    row.attempts += 1;
    row.startedAt = now();
    ledger.updatedAt = row.startedAt;
    dependencies.persist(ledger);
    try {
      const uploadUrl = await dependencies.generateUploadUrl();
      const parsedUrl = new URL(uploadUrl);
      if (parsedUrl.protocol !== "https:" || parsedUrl.hostname !== `${DEPLOYMENT}.convex.cloud`) {
        throw new Error("upload-url-target-mismatch");
      }
      const result = await dependencies.upload(uploadUrl, row.contentType, bytes);
      if (!result.storageId?.trim()) throw new Error("upload-response-missing-storage-id");
      row.status = "uploaded";
      row.storageId = result.storageId.trim();
      row.uploadedAt = now();
      row.errorCode = null;
    } catch {
      // The upload may have reached Convex before the response was lost. Never
      // auto-retry this state: doing so can create an untracked duplicate.
      row.status = "uncertain";
      row.storageId = null;
      row.errorCode = "upload-outcome-uncertain";
      ledger.updatedAt = now();
      dependencies.persist(ledger);
      throw new Error(`Upload outcome is uncertain for ${row.key}; reconcile it manually before retrying.`);
    }
    ledger.updatedAt = row.uploadedAt;
    dependencies.persist(ledger);
  }

  const storageIds = new Map(
    ledger.uploads
      .filter((row) => row.status === "uploaded" && row.storageId)
      .map((row) => [row.key, row.storageId!]),
  );
  const payload = buildEightProfilePayload(inputs, storageIds);
  const result = await dependencies.dryRunProfiles(payload);
  if (
    result.blocked !== 0
    || result.updated !== 0
    || result.created + result.unchanged !== 8
    || result.skipped !== 0
  ) {
    throw new Error("Eight-profile Convex dry run did not return the expected zero-block result.");
  }
  ledger.profileDryRuns = ledger.profileDryRuns.filter((run) => run.phase !== phase);
  ledger.profileDryRuns.push({
    phase,
    at: now(),
    payloadSha256: sha256(`${JSON.stringify(payload)}\n`),
    avatarStorageBindings: storageIds.size,
    result,
  });
  ledger.updatedAt = now();
  dependencies.persist(ledger);
  return { ledger, payload, result };
}

function flagValue(argv: string[], name: string) {
  return argv.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1) ?? null;
}

export async function main(argv = process.argv.slice(2)) {
  const planPath = path.resolve(flagValue(argv, "--plan") ?? DEFAULT_PLAN_PATH);
  const projectionPath = path.resolve(flagValue(argv, "--projection") ?? DEFAULT_PROJECTION_PATH);
  const deploymentReceiptPath = path.resolve(
    flagValue(argv, "--deployment-receipt") ?? DEFAULT_DEPLOYMENT_RECEIPT_PATH,
  );
  const ledgerPath = path.resolve(flagValue(argv, "--ledger") ?? DEFAULT_LEDGER_PATH);
  const phase = flagValue(argv, "--phase") ?? "plan";
  if (!["plan", "canary", "remaining"].includes(phase)) {
    throw new Error("--phase must be plan, canary, or remaining.");
  }
  const inputs = validateInputs({ planPath, projectionPath, deploymentReceiptPath });
  const prospectivePayload = buildEightProfilePayload(inputs);
  console.log(`Campaign: ${inputs.campaignId}`);
  console.log(`Pinned upload plan: ${inputs.planPayloadSha256}`);
  console.log(`Pinned contributor projection: ${inputs.projectionSha256}`);
  console.log(`Profiles: ${prospectivePayload.entries.length}; uploads: ${inputs.uploads.length}; canary: ${CANARY_KEY}`);
  for (const upload of inputs.uploads) {
    console.log(`${upload.key} ${upload.sha256} ${upload.byteSize} ${upload.contentType}`);
  }

  const command = createProductionWriteCommand({ operation: OPERATION, argv });
  printProductionWriteCommand(command);
  if (!command.writeRequested) {
    console.log("Dry run only: no upload URL generated, no bytes uploaded, no ledger written, no Convex mutation called.");
    return { mode: "dry-run" as const, payload: prospectivePayload };
  }
  if (phase === "plan") throw new Error("A write requires --phase=canary or --phase=remaining.");
  assertProductionWriteAllowed(command);
  if (command.targetUrl !== TARGET_URL || command.deploymentFingerprint !== DEPLOYMENT) {
    throw new Error(`This campaign is pinned to prod:${DEPLOYMENT}.`);
  }
  const token = requireProductionWriteCredential("profileMediaWrite").token;
  const client = new ConvexHttpClient(command.targetUrl);
  const lock = acquireLedgerLock(ledgerPath);
  try {
    const ledger = readOrCreateLedger(ledgerPath, inputs);
    const result = await runUploadPhase(phase as "canary" | "remaining", inputs, ledger, {
      generateUploadUrl: async () => await client.mutation(
        api.contributorProfiles.generateAvatarUploadUrl,
        { apiKey: token },
      ),
      upload: async (url, contentType, bytes) => {
        const uploadBody = Uint8Array.from(bytes).buffer;
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": contentType },
          body: uploadBody,
        });
        const responseBody = await response.json().catch(() => ({})) as { storageId?: unknown };
        if (!response.ok || typeof responseBody.storageId !== "string") {
          throw new Error("avatar-upload-failed");
        }
        return { storageId: responseBody.storageId };
      },
      dryRunProfiles: async (payload) => await client.mutation(
        api.contributorProfiles.importReviewedProfilePlan,
        { ...payload, apiKey: token },
      ),
      persist: (nextLedger) => writeLedgerAtomic(ledgerPath, nextLedger),
    });
    console.log(
      `${phase} complete: ${result.ledger.uploads.filter((row) => row.status === "uploaded").length}/4 uploads ledgered; `
        + `profile dry run created=${result.result.created} unchanged=${result.result.unchanged} blocked=${result.result.blocked}.`,
    );
    return result;
  } finally {
    lock.release();
  }
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
