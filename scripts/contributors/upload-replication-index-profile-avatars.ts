#!/usr/bin/env node
/**
 * Guarded publisher for reviewed Replication Index contributor profiles.
 *
 * Default mode is a zero-network dry run. Production uploads require a canary
 * command followed by a separate remaining-files command. Both commands write
 * a resumable, nonsecret ledger atomically after every state transition. A
 * third, separately confirmed profiles phase may call the contributor import
 * mutation once, then requires an exact eight-profile readback before the
 * ledger can become verified. Two further phases dry-run and write the four
 * exact-ID existing-profile CAS updates, followed by a read-only 160-profile
 * production snapshot for downstream planning.
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
export const APPLICATION_CONTRACT = {
  deployedCommit: "6970b83c",
  mutation: "contributorProfiles.importReviewedProfilePlan",
  readbackQuery: "contributorProfiles.getForBulkImport",
  expectedProfiles: 8,
  expectedAbsent: true,
} as const;
export const APPLICATION_CONTRACT_SHA256 = sha256(
  `${JSON.stringify(APPLICATION_CONTRACT)}\n`,
);
export const EXISTING_PROFILE_APPLICATION_CONTRACT = {
  deployedCommit: "6970b83c",
  mutation: "contributorProfiles.importReviewedProfilePlan",
  readbackQuery: "contributorProfiles.getForBulkImport",
  expectedProfiles: 4,
  expectedUpdates: 3,
  expectedUnchanged: 1,
  maxLinks: 3,
} as const;
export const EXISTING_PROFILE_APPLICATION_CONTRACT_SHA256 = sha256(
  `${JSON.stringify(EXISTING_PROFILE_APPLICATION_CONTRACT)}\n`,
);

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
export const DEFAULT_PROFILE_SNAPSHOT_PATH = path.join(
  CAMPAIGN_ROOT,
  "contributor-profiles-post-existing-rollout-snapshot.json",
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
type StoredLink = { label: string; url: string };
type CreateProjection = {
  operation: string;
  key: string;
  displayName: string;
  aliases: string[];
  role: string;
  links: ProjectionLink[];
  evidenceOnlyLinks: ProjectionLink[];
};
type ExistingProjection = {
  operation: "update-existing-links" | "reuse-existing";
  profileId: string;
  key: string;
  displayName: string;
  avatarUrl?: string | null;
  existingLinks: StoredLink[];
  addLinks: ProjectionLink[];
  evidenceOnlyLinks: ProjectionLink[];
};
type ContributorProjection = {
  artifactType: string;
  campaignId: string;
  counts: { profileLinkLimit: number };
  existingProfiles: ExistingProjection[];
  createProfiles: CreateProjection[];
};
type LiveContributorProfileSnapshot = {
  _id: Id<"contributorProfiles">;
  key: string;
  displayName: string;
  aliases: string[];
  avatarStorageId?: Id<"_storage">;
  avatarR2Key?: string;
  avatarUrl?: string;
  bio: string;
  role?: string;
  links: StoredLink[];
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
  applicationContractSha256: string;
  uploads: ValidatedUpload[];
  projection: ContributorProjection;
};

type ImportResultRow = {
  creatorName: string;
  key: string | null;
  profileId: string | null;
  action: "would-update" | "updated" | "would-create" | "created" | "unchanged" | "skipped" | "blocked";
  blockReason?: "official-link-limit" | "avatar-unverified" | "avatar-r2-verification-unavailable";
};

export type ProfileImportResult = {
  operationId: string;
  dryRun: boolean;
  created: number;
  updated: number;
  unchanged: number;
  skipped: number;
  blocked: number;
  rows: ImportResultRow[];
};

export type ProfileReadbackRow = {
  _id: string;
  key: string;
  displayName: string;
  aliases?: string[];
  avatarStorageId?: string;
  avatarR2Key?: string;
  avatarUrl?: string;
  bio?: string;
  role?: string;
  links?: Array<{ label: string; url: string }>;
};

export type VerifiedProfileReadbackRow = {
  profileId: string;
  key: string;
  displayName: string;
  aliases: string[];
  avatarStorageId: string | null;
  avatarR2Key: string | null;
  avatarUrl: string | null;
  bio: string;
  role: string | null;
  links: Array<{ label: string; url: string }>;
};

export type ProfileWriteState = {
  status: "pending" | "uncertain" | "verified";
  attempts: number;
  expectedAbsent: true;
  payloadSha256: string | null;
  requestedAt: string | null;
  verifiedAt: string | null;
  result: ProfileImportResult | null;
  readback: VerifiedProfileReadbackRow[] | null;
  errorCode: string | null;
};

export type ExistingProfileDryRun = {
  at: string;
  applicationContractSha256: string;
  payloadSha256: string;
  payload: Omit<ReviewedProfileImportArgs, "apiKey">;
  result: ProfileImportResult;
};

export type ExistingProfileWriteState = {
  status: "pending" | "uncertain" | "verified";
  attempts: number;
  applicationContractSha256: string;
  payloadSha256: string | null;
  requestedAt: string | null;
  verifiedAt: string | null;
  result: ProfileImportResult | null;
  readback: VerifiedProfileReadbackRow[] | null;
  errorCode: string | null;
};

export type ContributorProfileSnapshot = {
  schemaVersion: 1;
  artifactType: "replication-index-contributor-profile-production-snapshot";
  campaignId: string;
  capturedAt: string;
  targetDeployment: typeof DEPLOYMENT;
  targetUrl: typeof TARGET_URL;
  projectionSha256: string;
  deployedCommit: typeof APPLICATION_CONTRACT.deployedCommit;
  applicationContractSha256: string;
  profileCount: 160;
  profiles: VerifiedProfileReadbackRow[];
  payloadSha256: string;
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
  applicationContractSha256: string;
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
  profileWrite: ProfileWriteState;
  existingProfileDryRun?: ExistingProfileDryRun | null;
  existingProfileWrite?: ExistingProfileWriteState;
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
    || projection.existingProfiles.length !== 4
    || projection.counts.profileLinkLimit !== 3
  ) {
    throw new Error("Expected exactly eight reviewed creates, four existing profiles, four uploads, and four initials fallbacks.");
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
  if (
    new Set(projection.existingProfiles.map((profile) => profile.profileId)).size !== 4
    || new Set(projection.existingProfiles.map((profile) => profile.key)).size !== 4
    || projection.existingProfiles.reduce((count, profile) => count + profile.addLinks.length, 0) !== 5
  ) {
    throw new Error("Existing contributor scope must pin four profile IDs and five reviewed link additions.");
  }
  for (const profile of projection.existingProfiles) {
    if (!["update-existing-links", "reuse-existing"].includes(profile.operation)) {
      throw new Error(`Unexpected existing-profile operation for ${profile.key}.`);
    }
    if (profile.existingLinks.length + profile.addLinks.length > 3) {
      throw new Error(`Existing profile ${profile.key} exceeds the three-link limit.`);
    }
    if (profile.evidenceOnlyLinks.some((link) => !link.notImportedReason)) {
      throw new Error(`Existing profile ${profile.key} has an evidence-only link without a reason.`);
    }
  }

  const deployment = receipt.deployment as JsonObject | undefined;
  const result = receipt.deploymentResult as JsonObject | undefined;
  const verifiedFunctions = result?.verifiedLiveFunctions;
  if (
    sha256(receiptBytes) !== EXPECTED_DEPLOYMENT_RECEIPT_SHA256
    || deployment?.name !== `prod:${DEPLOYMENT}`
    || deployment?.url !== TARGET_URL
    || deployment?.applicationCommit !== APPLICATION_CONTRACT.deployedCommit
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
    applicationContractSha256: APPLICATION_CONTRACT_SHA256,
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

function liveExistingProfiles(inputs: ValidatedInputs, value: unknown): LiveContributorProfileSnapshot[] {
  if (!Array.isArray(value) || value.length !== 4) {
    throw new Error("Existing-profile preflight must read exactly four profiles.");
  }
  const projectedById = new Map(inputs.projection.existingProfiles.map((profile) => [profile.profileId, profile]));
  const rows = value as Array<Record<string, unknown>>;
  assertExactKeys(
    rows.map((row) => String(row._id ?? "")),
    inputs.projection.existingProfiles.map((profile) => profile.profileId),
    "Existing profile IDs",
  );
  return rows.map((row) => {
    const profileId = typeof row._id === "string" ? row._id : "";
    const projected = projectedById.get(profileId);
    const aliases = Array.isArray(row.aliases) && row.aliases.every((alias) => typeof alias === "string")
      ? row.aliases as string[]
      : [];
    const links = Array.isArray(row.links) && row.links.every((link) => (
      link && typeof link === "object"
      && typeof (link as Record<string, unknown>).label === "string"
      && typeof (link as Record<string, unknown>).url === "string"
    ))
      ? row.links as Array<{ label: string; url: string }>
      : [];
    if (
      !projected
      || row.key !== projected.key
      || row.displayName !== projected.displayName
      || JSON.stringify(links) !== JSON.stringify(projected.existingLinks)
      || (typeof row.avatarUrl === "string" ? row.avatarUrl : null) !== (projected.avatarUrl ?? null)
      || (row.avatarStorageId !== undefined && typeof row.avatarStorageId !== "string")
      || (row.avatarR2Key !== undefined && typeof row.avatarR2Key !== "string")
      || (row.avatarUrl !== undefined && typeof row.avatarUrl !== "string")
      || (row.bio !== undefined && typeof row.bio !== "string")
      || (row.role !== undefined && typeof row.role !== "string")
    ) {
      throw new Error(`Existing profile preflight drifted for ${projected?.key ?? profileId}.`);
    }
    return {
      _id: profileId as Id<"contributorProfiles">,
      key: projected.key,
      displayName: projected.displayName,
      aliases,
      ...(typeof row.avatarStorageId === "string"
        ? { avatarStorageId: row.avatarStorageId as Id<"_storage"> }
        : {}),
      ...(typeof row.avatarR2Key === "string" ? { avatarR2Key: row.avatarR2Key } : {}),
      ...(typeof row.avatarUrl === "string" ? { avatarUrl: row.avatarUrl } : {}),
      bio: typeof row.bio === "string" ? row.bio : "",
      ...(typeof row.role === "string" ? { role: row.role } : {}),
      links,
    };
  });
}

function normalizeStoredLink(link: { label: string; url: string }) {
  const label = link.label.trim().slice(0, 60);
  const url = new URL(link.url);
  if (!label || url.protocol !== "https:") throw new Error(`Invalid existing profile link: ${link.url}`);
  return { label, url: url.toString() };
}

export function buildExistingProfilePayload(
  inputs: ValidatedInputs,
  currentProfiles: unknown,
  dryRun: boolean,
): Omit<ReviewedProfileImportArgs, "apiKey"> {
  const liveProfiles = liveExistingProfiles(inputs, currentProfiles);
  const liveById = new Map(liveProfiles.map((profile) => [profile._id, profile]));
  const entries: ReviewedProfileImportArgs["entries"] = inputs.projection.existingProfiles.map((projected) => {
    const live = liveById.get(projected.profileId as Id<"contributorProfiles">);
    if (!live) throw new Error(`Existing profile ${projected.key} is missing from the exact-ID preflight.`);
    const avatarCount = [live.avatarStorageId, live.avatarR2Key, live.avatarUrl].filter(Boolean).length;
    if (avatarCount > 1) throw new Error(`Existing profile ${projected.key} has multiple avatar references.`);
    const expected = {
      key: live.key,
      displayName: live.displayName,
      aliases: live.aliases,
      avatarStorageId: live.avatarStorageId ?? null,
      avatarR2Key: live.avatarR2Key ?? null,
      avatarUrl: live.avatarUrl ?? null,
      bio: live.bio,
      role: live.role ?? null,
      links: live.links.map(normalizeStoredLink),
    };
    const desiredLinks = [
      ...expected.links,
      ...projected.addLinks.map((link) => normalizeStoredLink({ label: link.kind, url: link.url })),
    ];
    if (desiredLinks.length > 3) {
      throw new Error(`Existing profile ${projected.key} exceeds the three-link limit.`);
    }
    return {
      outcome: "existing-profile" as const,
      creatorName: projected.displayName,
      creatorKind: "person" as const,
      profileId: projected.profileId as Id<"contributorProfiles">,
      expected,
      profile: { ...expected, links: desiredLinks },
    };
  });
  const payload = {
    operationId: inputs.campaignId,
    dryRun,
    entries,
  };
  assertExistingPayloadMatchesPinnedProjection(inputs, payload);
  return payload;
}

export function assertExistingPayloadMatchesPinnedProjection(
  inputs: ValidatedInputs,
  payload: Omit<ReviewedProfileImportArgs, "apiKey">,
) {
  if (payload.operationId !== inputs.campaignId || payload.entries.length !== 4) {
    throw new Error("Existing-profile payload is not bound to the pinned campaign scope.");
  }
  const entries = existingProfileEntries(payload);
  const entriesById = new Map(entries.map((entry) => [entry.profileId, entry]));
  assertExactKeys(
    entries.map((entry) => entry.profileId),
    inputs.projection.existingProfiles.map((profile) => profile.profileId),
    "Existing-profile payload IDs",
  );
  let additionCount = 0;
  let changedProfileCount = 0;
  for (const projected of inputs.projection.existingProfiles) {
    const entry = entriesById.get(projected.profileId as Id<"contributorProfiles">);
    if (
      !entry
      || entry.creatorName !== projected.displayName
      || entry.creatorKind !== "person"
      || entry.expected.key !== projected.key
      || entry.expected.displayName !== projected.displayName
      || entry.profile.key !== projected.key
      || entry.profile.displayName !== projected.displayName
      || entry.expected.avatarUrl !== (projected.avatarUrl ?? null)
    ) {
      throw new Error(`Existing-profile payload target drifted for ${projected.key}.`);
    }
    const expectedLinks = projected.existingLinks.map(normalizeStoredLink);
    const approvedAdditions = projected.addLinks.map((link) => normalizeStoredLink({
      label: link.kind,
      url: link.url,
    }));
    const desiredLinks = [...expectedLinks, ...approvedAdditions];
    if (
      JSON.stringify(entry.expected.links) !== JSON.stringify(expectedLinks)
      || JSON.stringify(entry.profile.links) !== JSON.stringify(desiredLinks)
      || desiredLinks.length > 3
    ) {
      throw new Error(`Existing-profile payload links drifted for ${projected.key}.`);
    }
    const { links: _expectedLinks, ...expectedNonLinks } = entry.expected;
    const { links: _desiredLinks, ...desiredNonLinks } = entry.profile;
    if (JSON.stringify(expectedNonLinks) !== JSON.stringify(desiredNonLinks)) {
      throw new Error(`Existing-profile payload changed non-link fields for ${projected.key}.`);
    }
    additionCount += approvedAdditions.length;
    if (approvedAdditions.length > 0) changedProfileCount += 1;
  }
  if (additionCount !== 5 || changedProfileCount !== 3) {
    throw new Error("Existing-profile payload lost the pinned five additions across three profiles.");
  }
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
    applicationContractSha256: inputs.applicationContractSha256,
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
    profileWrite: {
      status: "pending",
      attempts: 0,
      expectedAbsent: true,
      payloadSha256: null,
      requestedAt: null,
      verifiedAt: null,
      result: null,
      readback: null,
      errorCode: null,
    },
    existingProfileDryRun: null,
    existingProfileWrite: createPendingExistingProfileWriteState(),
  };
}

function createPendingExistingProfileWriteState(): ExistingProfileWriteState {
  return {
    status: "pending",
    attempts: 0,
    applicationContractSha256: EXISTING_PROFILE_APPLICATION_CONTRACT_SHA256,
    payloadSha256: null,
    requestedAt: null,
    verifiedAt: null,
    result: null,
    readback: null,
    errorCode: null,
  };
}

function ensureExistingProfileLedgerState(ledger: AvatarUploadLedger) {
  if (ledger.existingProfileDryRun === undefined) ledger.existingProfileDryRun = null;
  if (ledger.existingProfileWrite === undefined) {
    ledger.existingProfileWrite = createPendingExistingProfileWriteState();
  }
  return ledger as AvatarUploadLedger & {
    existingProfileDryRun: ExistingProfileDryRun | null;
    existingProfileWrite: ExistingProfileWriteState;
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
    || ledger.applicationContractSha256 !== inputs.applicationContractSha256
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
  const profileWrite = ledger.profileWrite;
  if (
    !profileWrite
    || !["pending", "uncertain", "verified"].includes(profileWrite.status)
    || !Number.isInteger(profileWrite.attempts)
    || profileWrite.attempts < 0
    || profileWrite.expectedAbsent !== true
    || (profileWrite.status === "pending" && (
      profileWrite.attempts !== 0
      || profileWrite.payloadSha256 !== null
      || profileWrite.requestedAt !== null
      || profileWrite.verifiedAt !== null
      || profileWrite.result !== null
      || profileWrite.readback !== null
      || profileWrite.errorCode !== null
    ))
    || (profileWrite.status !== "pending" && (
      profileWrite.attempts !== 1
      || !profileWrite.payloadSha256
      || !profileWrite.requestedAt
    ))
    || (profileWrite.status === "verified" && (
      !profileWrite.verifiedAt
      || !profileWrite.readback
      || profileWrite.errorCode !== null
    ))
  ) {
    throw new Error("Avatar upload ledger has an invalid profile-write state.");
  }
  const existingDryRun = ledger.existingProfileDryRun;
  if (existingDryRun !== undefined && existingDryRun !== null) {
    assertExistingPayloadMatchesPinnedProjection(inputs, existingDryRun.payload);
    if (
      existingDryRun.applicationContractSha256 !== EXISTING_PROFILE_APPLICATION_CONTRACT_SHA256
      || existingDryRun.payload.dryRun !== true
      || existingDryRun.payload.operationId !== inputs.campaignId
      || existingDryRun.payloadSha256 !== profilePayloadDigest(existingDryRun.payload)
      || existingDryRun.result.dryRun !== true
      || existingDryRun.result.operationId !== inputs.campaignId
      || !importResultProvesExistingDryRun(existingDryRun.result, existingDryRun.payload)
    ) {
      throw new Error("Avatar upload ledger has an invalid existing-profile dry run.");
    }
  }
  const existingWrite = ledger.existingProfileWrite;
  if (existingWrite !== undefined && (
    existingWrite.applicationContractSha256 !== EXISTING_PROFILE_APPLICATION_CONTRACT_SHA256
    || !["pending", "uncertain", "verified"].includes(existingWrite.status)
    || !Number.isInteger(existingWrite.attempts)
    || existingWrite.attempts < 0
    || (existingWrite.status === "pending" && (
      existingWrite.attempts !== 0
      || existingWrite.payloadSha256 !== null
      || existingWrite.requestedAt !== null
      || existingWrite.verifiedAt !== null
      || existingWrite.result !== null
      || existingWrite.readback !== null
      || existingWrite.errorCode !== null
    ))
    || (existingWrite.status !== "pending" && (
      existingWrite.attempts !== 1
      || !existingWrite.payloadSha256
      || !existingWrite.requestedAt
      || !existingDryRun
    ))
    || (existingWrite.status === "verified" && (
      !existingWrite.verifiedAt
      || !existingWrite.readback
      || existingWrite.errorCode !== null
    ))
  )) {
    throw new Error("Avatar upload ledger has an invalid existing-profile write state.");
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

type ProfileWriteDependencies = {
  writeProfiles: (
    payload: Omit<ReviewedProfileImportArgs, "apiKey">,
  ) => Promise<unknown>;
  readProfiles: (keys: string[]) => Promise<unknown>;
  persist: (ledger: AvatarUploadLedger) => void;
  now?: () => string;
};

function profilePayloadDigest(payload: Omit<ReviewedProfileImportArgs, "apiKey">) {
  return sha256(`${JSON.stringify(payload)}\n`);
}

function sanitizeImportResult(
  value: unknown,
  operationId: string,
  expectedDryRun: boolean,
): ProfileImportResult {
  if (!value || typeof value !== "object") throw new Error("invalid-profile-import-result");
  const source = value as Record<string, unknown>;
  const countNames = ["created", "updated", "unchanged", "skipped", "blocked"] as const;
  if (
    source.operationId !== operationId
    || source.dryRun !== expectedDryRun
    || !countNames.every((name) => Number.isInteger(source[name]) && Number(source[name]) >= 0)
    || !Array.isArray(source.rows)
  ) {
    throw new Error("invalid-profile-import-result");
  }
  const validActions = new Set([
    "would-update", "updated", "would-create", "created", "unchanged", "skipped", "blocked",
  ]);
  const validBlockReasons = new Set([
    "official-link-limit", "avatar-unverified", "avatar-r2-verification-unavailable",
  ]);
  const rows = source.rows.map((raw): ImportResultRow => {
    if (!raw || typeof raw !== "object") throw new Error("invalid-profile-import-result");
    const row = raw as Record<string, unknown>;
    if (
      typeof row.creatorName !== "string"
      || (row.key !== null && typeof row.key !== "string")
      || (row.profileId !== null && typeof row.profileId !== "string")
      || typeof row.action !== "string"
      || !validActions.has(row.action)
      || (row.blockReason !== undefined && (
        typeof row.blockReason !== "string" || !validBlockReasons.has(row.blockReason)
      ))
    ) {
      throw new Error("invalid-profile-import-result");
    }
    return {
      creatorName: row.creatorName,
      key: row.key as string | null,
      profileId: row.profileId as string | null,
      action: row.action as ImportResultRow["action"],
      ...(row.blockReason === undefined
        ? {}
        : { blockReason: row.blockReason as ImportResultRow["blockReason"] }),
    };
  });
  return {
    operationId,
    dryRun: expectedDryRun,
    created: Number(source.created),
    updated: Number(source.updated),
    unchanged: Number(source.unchanged),
    skipped: Number(source.skipped),
    blocked: Number(source.blocked),
    rows,
  };
}

function expectedProfileStates(payload: Omit<ReviewedProfileImportArgs, "apiKey">) {
  return payload.entries.map((entry) => {
    if (entry.outcome !== "reviewed-new" || entry.expectedAbsent !== true) {
      throw new Error("Profile application payload lost reviewed-new expectedAbsent semantics.");
    }
    return entry.profile;
  });
}

function existingProfileEntries(payload: Omit<ReviewedProfileImportArgs, "apiKey">) {
  const entries = payload.entries.map((entry) => {
    if (entry.outcome !== "existing-profile") {
      throw new Error("Existing-profile payload contains a non-existing-profile entry.");
    }
    return entry;
  });
  if (entries.length !== 4) throw new Error("Existing-profile payload must contain exactly four entries.");
  return entries;
}

function importResultProvesExistingOperation(
  result: ProfileImportResult,
  payload: Omit<ReviewedProfileImportArgs, "apiKey">,
  dryRun: boolean,
) {
  const entries = existingProfileEntries(payload);
  if (
    result.dryRun !== dryRun
    || result.created !== 0
    || result.updated !== 3
    || result.unchanged !== 1
    || result.skipped !== 0
    || result.blocked !== 0
    || result.rows.length !== 4
  ) {
    return false;
  }
  const rowsByKey = new Map(result.rows.map((row) => [row.key, row]));
  if (rowsByKey.size !== 4) return false;
  return entries.every((entry) => {
    const row = rowsByKey.get(entry.profile.key);
    const unchanged = JSON.stringify(entry.expected) === JSON.stringify(entry.profile);
    const expectedAction = unchanged ? "unchanged" : dryRun ? "would-update" : "updated";
    return row?.creatorName === entry.creatorName
      && row.profileId === entry.profileId
      && row.action === expectedAction;
  });
}

function importResultProvesExistingDryRun(
  result: ProfileImportResult,
  payload: Omit<ReviewedProfileImportArgs, "apiKey">,
) {
  return importResultProvesExistingOperation(result, payload, true);
}

export function verifyExistingProfileReadback(
  payload: Omit<ReviewedProfileImportArgs, "apiKey">,
  value: unknown,
): VerifiedProfileReadbackRow[] {
  if (!Array.isArray(value)) throw new Error("Existing-profile readback did not return an array.");
  const entries = existingProfileEntries(payload);
  if (value.length !== entries.length) {
    throw new Error(`Existing-profile readback expected ${entries.length} rows; received ${value.length}.`);
  }
  const rawRows = value as ProfileReadbackRow[];
  assertExactKeys(
    rawRows.map((row) => row?.key),
    entries.map((entry) => entry.profile.key),
    "Existing-profile readback",
  );
  const rowsByKey = new Map(rawRows.map((row) => [row.key, row]));
  if (rowsByKey.size !== entries.length) throw new Error("Existing-profile readback repeats a profile key.");
  return entries.map((entry) => {
    const profile = entry.profile;
    const row = rowsByKey.get(profile.key);
    if (!row || row._id !== entry.profileId) {
      throw new Error(`Existing-profile readback ID mismatch for ${profile.key}.`);
    }
    const actualState = {
      key: row.key,
      displayName: row.displayName,
      aliases: row.aliases ?? [],
      avatarStorageId: row.avatarStorageId ?? null,
      avatarR2Key: row.avatarR2Key ?? null,
      avatarUrl: row.avatarUrl ?? null,
      bio: row.bio ?? "",
      role: row.role ?? null,
      links: row.links ?? [],
    };
    if (JSON.stringify(actualState) !== JSON.stringify(profile)) {
      throw new Error(`Existing-profile readback mismatch for ${profile.key}.`);
    }
    return { profileId: row._id, ...actualState };
  });
}

export function verifyProfileReadback(
  payload: Omit<ReviewedProfileImportArgs, "apiKey">,
  value: unknown,
): VerifiedProfileReadbackRow[] {
  if (!Array.isArray(value)) throw new Error("Profile readback did not return an array.");
  const expected = expectedProfileStates(payload);
  if (value.length !== expected.length) {
    throw new Error(`Profile readback expected ${expected.length} rows; received ${value.length}.`);
  }
  const rawRows = value as ProfileReadbackRow[];
  assertExactKeys(rawRows.map((row) => row?.key), expected.map((row) => row.key), "Profile readback");
  const rowsByKey = new Map(rawRows.map((row) => [row.key, row]));
  if (rowsByKey.size !== expected.length) throw new Error("Profile readback repeats a profile key.");

  return expected.map((profile) => {
    const row = rowsByKey.get(profile.key);
    if (!row || typeof row._id !== "string" || !row._id) {
      throw new Error(`Profile readback has no stored ID for ${profile.key}.`);
    }
    const actualState = {
      key: row.key,
      displayName: row.displayName,
      aliases: row.aliases ?? [],
      avatarStorageId: row.avatarStorageId ?? null,
      avatarR2Key: row.avatarR2Key ?? null,
      avatarUrl: row.avatarUrl ?? null,
      bio: row.bio ?? "",
      role: row.role ?? null,
      links: row.links ?? [],
    };
    if (JSON.stringify(actualState) !== JSON.stringify(profile)) {
      throw new Error(`Profile readback mismatch for ${profile.key}.`);
    }
    return { profileId: row._id, ...actualState };
  });
}

function verifyLedgeredProfileReadback(
  payload: Omit<ReviewedProfileImportArgs, "apiKey">,
  rows: VerifiedProfileReadbackRow[] | null,
) {
  if (!rows) throw new Error("Verified profile-write ledger is missing its readback.");
  return verifyProfileReadback(
    payload,
    rows.map(({ profileId, ...row }) => ({ _id: profileId, ...row })),
  );
}

function requireProfileWriteGate(
  inputs: ValidatedInputs,
  ledger: AvatarUploadLedger,
) {
  if (ledger.uploads.some((row) => row.status !== "uploaded" || !row.storageId)) {
    throw new Error("All four digest-bound avatar uploads must be ledgered before the profiles phase.");
  }
  const storageIds = new Map(ledger.uploads.map((row) => [row.key, row.storageId!]));
  const dryRunPayload = buildEightProfilePayload(inputs, storageIds);
  const dryRun = ledger.profileDryRuns.find((run) => run.phase === "remaining");
  if (
    !dryRun
    || dryRun.avatarStorageBindings !== 4
    || dryRun.payloadSha256 !== profilePayloadDigest(dryRunPayload)
    || dryRun.result.created !== 8
    || dryRun.result.updated !== 0
    || dryRun.result.unchanged !== 0
    || dryRun.result.skipped !== 0
    || dryRun.result.blocked !== 0
  ) {
    throw new Error(
      "The remaining eight-profile dry run must prove all expectedAbsent profiles would be created before the profiles phase.",
    );
  }
  return { ...dryRunPayload, dryRun: false };
}

function importResultProvesFirstWrite(
  result: ProfileImportResult,
  payload: Omit<ReviewedProfileImportArgs, "apiKey">,
  readback: VerifiedProfileReadbackRow[],
) {
  if (!(result.created === 8
    && result.updated === 0
    && result.unchanged === 0
    && result.skipped === 0
    && result.blocked === 0
    && result.rows.length === 8
    && result.rows.every((row) => row.action === "created" && row.key && row.profileId))) {
    return false;
  }
  const resultByKey = new Map(result.rows.map((row) => [row.key, row]));
  const readbackByKey = new Map(readback.map((row) => [row.key, row]));
  if (resultByKey.size !== 8) return false;
  return expectedProfileStates(payload).every((profile) => {
    const row = resultByKey.get(profile.key);
    return row?.creatorName === profile.displayName
      && row.profileId === readbackByKey.get(profile.key)?.profileId;
  });
}

export async function runProfileWritePhase(
  inputs: ValidatedInputs,
  ledger: AvatarUploadLedger,
  dependencies: ProfileWriteDependencies,
) {
  validateLedger(ledger, inputs);
  const payload = requireProfileWriteGate(inputs, ledger);
  const payloadSha256 = profilePayloadDigest(payload);
  const now = dependencies.now ?? (() => new Date().toISOString());

  if (ledger.profileWrite.status === "verified") {
    if (ledger.profileWrite.payloadSha256 !== payloadSha256) {
      throw new Error("Verified profile-write payload no longer matches the pinned application contract.");
    }
    verifyLedgeredProfileReadback(payload, ledger.profileWrite.readback);
    return { ledger, payload, resumed: true as const };
  }

  let mutationResult = ledger.profileWrite.result;
  if (ledger.profileWrite.status === "pending") {
    ledger.profileWrite = {
      status: "uncertain",
      attempts: 1,
      expectedAbsent: true,
      payloadSha256,
      requestedAt: now(),
      verifiedAt: null,
      result: null,
      readback: null,
      errorCode: "profile-write-outcome-uncertain",
    };
    ledger.updatedAt = now();
    dependencies.persist(ledger);
    try {
      mutationResult = sanitizeImportResult(
        await dependencies.writeProfiles(payload),
        inputs.campaignId,
        false,
      );
      ledger.profileWrite.result = mutationResult;
      ledger.updatedAt = now();
      dependencies.persist(ledger);
    } catch {
      // The mutation may have committed before its response was lost. Keep the
      // phase uncertain and use only exact readback for recovery; never retry.
      mutationResult = null;
    }
  } else if (ledger.profileWrite.payloadSha256 !== payloadSha256) {
    throw new Error("Uncertain profile-write payload no longer matches the pinned application contract.");
  }

  let readback: VerifiedProfileReadbackRow[];
  try {
    readback = verifyProfileReadback(
      payload,
      await dependencies.readProfiles(payload.entries.map((entry) => (
        entry.outcome === "reviewed-new" ? entry.profile.key : ""
      ))),
    );
  } catch {
    ledger.profileWrite.errorCode = "profile-readback-mismatch-or-unavailable";
    ledger.updatedAt = now();
    dependencies.persist(ledger);
    throw new Error(
      "Profile write remains uncertain because the exact eight-profile readback did not verify; do not retry the mutation.",
    );
  }

  if (mutationResult && !importResultProvesFirstWrite(mutationResult, payload, readback)) {
    ledger.profileWrite.readback = readback;
    ledger.profileWrite.errorCode = "profile-write-result-violated-expected-absent";
    ledger.updatedAt = now();
    dependencies.persist(ledger);
    throw new Error(
      "Profile write remains uncertain because its result violated expectedAbsent first-write semantics; do not retry the mutation.",
    );
  }

  ledger.profileWrite.status = "verified";
  ledger.profileWrite.result = mutationResult;
  ledger.profileWrite.readback = readback;
  ledger.profileWrite.verifiedAt = now();
  ledger.profileWrite.errorCode = null;
  ledger.updatedAt = now();
  dependencies.persist(ledger);
  return { ledger, payload, resumed: false as const };
}

function requireVerifiedEightProfileLedger(inputs: ValidatedInputs, ledger: AvatarUploadLedger) {
  const payload = requireProfileWriteGate(inputs, ledger);
  if (
    ledger.profileWrite.status !== "verified"
    || ledger.profileWrite.payloadSha256 !== profilePayloadDigest(payload)
  ) {
    throw new Error("The original eight-profile create phase must be verified before existing profiles.");
  }
  verifyLedgeredProfileReadback(payload, ledger.profileWrite.readback);
}

type ExistingProfileDryRunDependencies = {
  readProfiles: (keys: string[]) => Promise<unknown>;
  dryRunProfiles: (payload: Omit<ReviewedProfileImportArgs, "apiKey">) => Promise<unknown>;
  persist: (ledger: AvatarUploadLedger) => void;
  now?: () => string;
};

export async function runExistingProfileDryRunPhase(
  inputs: ValidatedInputs,
  ledger: AvatarUploadLedger,
  dependencies: ExistingProfileDryRunDependencies,
) {
  validateLedger(ledger, inputs);
  requireVerifiedEightProfileLedger(inputs, ledger);
  const extendedLedger = ensureExistingProfileLedgerState(ledger);
  if (extendedLedger.existingProfileWrite.status === "verified") {
    return { ledger: extendedLedger, resumed: true as const };
  }
  if (extendedLedger.existingProfileWrite.status === "uncertain") {
    throw new Error("Existing-profile write is uncertain; the dry run cannot replace its CAS contract.");
  }
  if (extendedLedger.existingProfileDryRun) {
    return {
      ledger: extendedLedger,
      payload: extendedLedger.existingProfileDryRun.payload,
      result: extendedLedger.existingProfileDryRun.result,
      resumed: true as const,
    };
  }

  const keys = inputs.projection.existingProfiles.map((profile) => profile.key);
  const payload = buildExistingProfilePayload(
    inputs,
    await dependencies.readProfiles(keys),
    true,
  );
  const result = sanitizeImportResult(
    await dependencies.dryRunProfiles(payload),
    inputs.campaignId,
    true,
  );
  if (!importResultProvesExistingDryRun(result, payload)) {
    throw new Error("Four-profile Convex dry run did not prove the exact three-update/one-unchanged CAS plan.");
  }
  const now = dependencies.now ?? (() => new Date().toISOString());
  extendedLedger.existingProfileDryRun = {
    at: now(),
    applicationContractSha256: EXISTING_PROFILE_APPLICATION_CONTRACT_SHA256,
    payloadSha256: profilePayloadDigest(payload),
    payload,
    result,
  };
  extendedLedger.updatedAt = now();
  dependencies.persist(extendedLedger);
  return { ledger: extendedLedger, payload, result, resumed: false as const };
}

type ExistingProfileWriteDependencies = {
  writeProfiles: (payload: Omit<ReviewedProfileImportArgs, "apiKey">) => Promise<unknown>;
  readProfiles: (keys: string[]) => Promise<unknown>;
  persist: (ledger: AvatarUploadLedger) => void;
  now?: () => string;
};

function verifyLedgeredExistingProfileReadback(
  payload: Omit<ReviewedProfileImportArgs, "apiKey">,
  rows: VerifiedProfileReadbackRow[] | null,
) {
  if (!rows) throw new Error("Verified existing-profile ledger is missing its readback.");
  return verifyExistingProfileReadback(
    payload,
    rows.map(({ profileId, ...row }) => ({ _id: profileId, ...row })),
  );
}

export async function runExistingProfileWritePhase(
  inputs: ValidatedInputs,
  ledger: AvatarUploadLedger,
  dependencies: ExistingProfileWriteDependencies,
) {
  validateLedger(ledger, inputs);
  requireVerifiedEightProfileLedger(inputs, ledger);
  const extendedLedger = ensureExistingProfileLedgerState(ledger);
  const dryRun = extendedLedger.existingProfileDryRun;
  if (!dryRun || !importResultProvesExistingDryRun(dryRun.result, dryRun.payload)) {
    throw new Error("A successful existing-profile dry run must be ledgered before its write phase.");
  }
  if (
    dryRun.applicationContractSha256 !== EXISTING_PROFILE_APPLICATION_CONTRACT_SHA256
    || dryRun.payloadSha256 !== profilePayloadDigest(dryRun.payload)
  ) {
    throw new Error("Existing-profile dry-run contract is stale.");
  }
  assertExistingPayloadMatchesPinnedProjection(inputs, dryRun.payload);
  const payload = { ...dryRun.payload, dryRun: false };
  assertExistingPayloadMatchesPinnedProjection(inputs, payload);
  const payloadSha256 = profilePayloadDigest(payload);
  const now = dependencies.now ?? (() => new Date().toISOString());

  if (extendedLedger.existingProfileWrite.status === "verified") {
    if (extendedLedger.existingProfileWrite.payloadSha256 !== payloadSha256) {
      throw new Error("Verified existing-profile payload no longer matches the pinned contract.");
    }
    verifyLedgeredExistingProfileReadback(payload, extendedLedger.existingProfileWrite.readback);
    return { ledger: extendedLedger, payload, resumed: true as const };
  }

  let mutationResult = extendedLedger.existingProfileWrite.result;
  if (extendedLedger.existingProfileWrite.status === "pending") {
    extendedLedger.existingProfileWrite = {
      status: "uncertain",
      attempts: 1,
      applicationContractSha256: EXISTING_PROFILE_APPLICATION_CONTRACT_SHA256,
      payloadSha256,
      requestedAt: now(),
      verifiedAt: null,
      result: null,
      readback: null,
      errorCode: "existing-profile-write-outcome-uncertain",
    };
    extendedLedger.updatedAt = now();
    dependencies.persist(extendedLedger);
    try {
      mutationResult = sanitizeImportResult(
        await dependencies.writeProfiles(payload),
        inputs.campaignId,
        false,
      );
      extendedLedger.existingProfileWrite.result = mutationResult;
      extendedLedger.updatedAt = now();
      dependencies.persist(extendedLedger);
    } catch {
      // The transactional mutation may have committed before its response was
      // lost. Never retry; exact readback is the sole recovery mechanism.
      mutationResult = null;
    }
  } else if (extendedLedger.existingProfileWrite.payloadSha256 !== payloadSha256) {
    throw new Error("Uncertain existing-profile payload no longer matches the pinned contract.");
  }

  const keys = existingProfileEntries(payload).map((entry) => entry.profile.key);
  let readback: VerifiedProfileReadbackRow[];
  try {
    readback = verifyExistingProfileReadback(payload, await dependencies.readProfiles(keys));
  } catch {
    extendedLedger.existingProfileWrite.errorCode = "existing-profile-readback-mismatch-or-unavailable";
    extendedLedger.updatedAt = now();
    dependencies.persist(extendedLedger);
    throw new Error(
      "Existing-profile write remains uncertain because exact readback did not verify; do not retry the mutation.",
    );
  }

  if (mutationResult && !importResultProvesExistingOperation(mutationResult, payload, false)) {
    extendedLedger.existingProfileWrite.readback = readback;
    extendedLedger.existingProfileWrite.errorCode = "existing-profile-result-violated-cas-plan";
    extendedLedger.updatedAt = now();
    dependencies.persist(extendedLedger);
    throw new Error(
      "Existing-profile write remains uncertain because its result violated the pinned CAS plan; do not retry.",
    );
  }

  extendedLedger.existingProfileWrite.status = "verified";
  extendedLedger.existingProfileWrite.result = mutationResult;
  extendedLedger.existingProfileWrite.readback = readback;
  extendedLedger.existingProfileWrite.verifiedAt = now();
  extendedLedger.existingProfileWrite.errorCode = null;
  extendedLedger.updatedAt = now();
  dependencies.persist(extendedLedger);
  return { ledger: extendedLedger, payload, resumed: false as const };
}

function snapshotProfile(row: unknown): VerifiedProfileReadbackRow {
  if (!row || typeof row !== "object") throw new Error("Profile snapshot contains a non-object row.");
  const source = row as Record<string, unknown>;
  const aliases = source.aliases ?? [];
  const links = source.links ?? [];
  if (
    typeof source._id !== "string"
    || !source._id
    || typeof source.key !== "string"
    || !source.key
    || typeof source.displayName !== "string"
    || !Array.isArray(aliases)
    || !aliases.every((alias) => typeof alias === "string")
    || !Array.isArray(links)
    || !links.every((link) => (
      link && typeof link === "object"
      && typeof (link as Record<string, unknown>).label === "string"
      && typeof (link as Record<string, unknown>).url === "string"
    ))
    || (source.avatarStorageId !== undefined && typeof source.avatarStorageId !== "string")
    || (source.avatarR2Key !== undefined && typeof source.avatarR2Key !== "string")
    || (source.avatarUrl !== undefined && typeof source.avatarUrl !== "string")
    || (source.bio !== undefined && typeof source.bio !== "string")
    || (source.role !== undefined && typeof source.role !== "string")
  ) {
    throw new Error(`Profile snapshot row is malformed for ${String(source.key ?? source._id ?? "unknown")}.`);
  }
  const avatarStorageId = typeof source.avatarStorageId === "string" ? source.avatarStorageId : null;
  const avatarR2Key = typeof source.avatarR2Key === "string" ? source.avatarR2Key : null;
  const avatarUrl = typeof source.avatarUrl === "string" ? source.avatarUrl : null;
  if ([avatarStorageId, avatarR2Key, avatarUrl].filter(Boolean).length > 1) {
    throw new Error(`Profile snapshot has multiple avatar references for ${source.key}.`);
  }
  return {
    profileId: source._id,
    key: source.key,
    displayName: source.displayName,
    aliases: aliases as string[],
    avatarStorageId,
    avatarR2Key,
    avatarUrl,
    bio: typeof source.bio === "string" ? source.bio : "",
    role: typeof source.role === "string" ? source.role : null,
    links: links as Array<{ label: string; url: string }>,
  };
}

export function buildContributorProfileSnapshot(
  inputs: ValidatedInputs,
  ledger: AvatarUploadLedger,
  keyValue: unknown,
  rowValue: unknown,
  capturedAt = new Date().toISOString(),
): ContributorProfileSnapshot {
  validateLedger(ledger, inputs);
  requireVerifiedEightProfileLedger(inputs, ledger);
  const extendedLedger = ensureExistingProfileLedgerState(ledger);
  const dryRun = extendedLedger.existingProfileDryRun;
  const write = extendedLedger.existingProfileWrite;
  if (!dryRun || write.status !== "verified" || write.payloadSha256 !== profilePayloadDigest({
    ...dryRun.payload,
    dryRun: false,
  })) {
    throw new Error("Existing-profile rollout must be verified before capturing the production profile snapshot.");
  }
  verifyLedgeredExistingProfileReadback(
    { ...dryRun.payload, dryRun: false },
    write.readback,
  );
  if (
    !Array.isArray(keyValue)
    || keyValue.length !== 160
    || !keyValue.every((key) => typeof key === "string" && key)
    || new Set(keyValue).size !== 160
  ) {
    throw new Error("Production profile snapshot requires exactly 160 unique live keys.");
  }
  if (!Array.isArray(rowValue) || rowValue.length !== 160) {
    throw new Error("Production profile snapshot requires exactly 160 raw live profiles.");
  }
  const profiles = rowValue.map(snapshotProfile).sort((left, right) => left.key.localeCompare(right.key));
  assertExactKeys(profiles.map((profile) => profile.key), keyValue as string[], "Production profile snapshot");
  if (new Set(profiles.map((profile) => profile.profileId)).size !== 160) {
    throw new Error("Production profile snapshot repeats a profile ID.");
  }
  const documentWithoutDigest: Omit<ContributorProfileSnapshot, "payloadSha256"> = {
    schemaVersion: 1 as const,
    artifactType: "replication-index-contributor-profile-production-snapshot" as const,
    campaignId: inputs.campaignId,
    capturedAt,
    targetDeployment: DEPLOYMENT,
    targetUrl: TARGET_URL,
    projectionSha256: inputs.projectionSha256,
    deployedCommit: APPLICATION_CONTRACT.deployedCommit,
    applicationContractSha256: EXISTING_PROFILE_APPLICATION_CONTRACT_SHA256,
    profileCount: 160 as const,
    profiles,
  };
  return {
    ...documentWithoutDigest,
    payloadSha256: sha256(`${JSON.stringify(documentWithoutDigest)}\n`),
  };
}

export function writeJsonAtomic(outputPath: string, value: unknown) {
  if (existsSync(outputPath)) {
    throw new Error(`Refusing to overwrite existing profile snapshot: ${outputPath}`);
  }
  mkdirSync(path.dirname(outputPath), { recursive: true });
  const temporaryPath = `${outputPath}.tmp-${process.pid}`;
  writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  renameSync(temporaryPath, outputPath);
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
  const profileSnapshotPath = path.resolve(
    flagValue(argv, "--profile-snapshot") ?? DEFAULT_PROFILE_SNAPSHOT_PATH,
  );
  const phase = flagValue(argv, "--phase") ?? "plan";
  if (![
    "plan", "canary", "remaining", "profiles", "existing-dry-run", "existing-profiles",
    "profile-snapshot",
  ].includes(phase)) {
    throw new Error(
      "--phase must be plan, canary, remaining, profiles, existing-dry-run, existing-profiles, "
        + "or profile-snapshot.",
    );
  }
  const inputs = validateInputs({ planPath, projectionPath, deploymentReceiptPath });
  const prospectivePayload = buildEightProfilePayload(inputs);
  console.log(`Campaign: ${inputs.campaignId}`);
  console.log(`Pinned upload plan: ${inputs.planPayloadSha256}`);
  console.log(`Pinned contributor projection: ${inputs.projectionSha256}`);
  console.log(`Profiles: ${prospectivePayload.entries.length}; uploads: ${inputs.uploads.length}; canary: ${CANARY_KEY}`);
  console.log("Existing profiles: 4; reviewed link additions: 5; product link cap: 3");
  for (const upload of inputs.uploads) {
    console.log(`${upload.key} ${upload.sha256} ${upload.byteSize} ${upload.contentType}`);
  }

  const command = createProductionWriteCommand({ operation: OPERATION, argv });
  printProductionWriteCommand(command);
  if (phase === "profile-snapshot") {
    if (command.writeRequested) throw new Error("profile-snapshot is read-only and rejects --write.");
    if (
      command.targetUrl !== TARGET_URL
      || command.deploymentFingerprint !== DEPLOYMENT
      || command.expectedDeployment !== DEPLOYMENT
    ) {
      throw new Error(
        `profile-snapshot requires --target-url=${TARGET_URL} and --expected-deployment=${DEPLOYMENT}.`,
      );
    }
    const token = requireProductionWriteCredential("profileMediaWrite").token;
    const client = new ConvexHttpClient(command.targetUrl);
    const lock = acquireLedgerLock(ledgerPath);
    try {
      const ledger = readOrCreateLedger(ledgerPath, inputs);
      const keys = await client.query(api.contributorProfiles.getKeys, {});
      const profiles = await client.query(api.contributorProfiles.getForBulkImport, {
        apiKey: token,
        keys,
      });
      const snapshot = buildContributorProfileSnapshot(inputs, ledger, keys, profiles);
      writeJsonAtomic(profileSnapshotPath, snapshot);
      console.log(
        `Read-only profile snapshot: ${snapshot.profileCount} profiles; ${snapshot.payloadSha256}; ${profileSnapshotPath}`,
      );
      return { mode: "profile-snapshot" as const, snapshot, profileSnapshotPath };
    } finally {
      lock.release();
    }
  }
  if (!command.writeRequested) {
    console.log("Dry run only: no upload URL generated, no bytes uploaded, no ledger written, and no Convex write mutation called.");
    return { mode: "dry-run" as const, payload: prospectivePayload };
  }
  if (phase === "plan") {
    throw new Error(
      "A write requires a separate --phase=canary, --phase=remaining, --phase=profiles, "
        + "--phase=existing-dry-run, or --phase=existing-profiles command.",
    );
  }
  assertProductionWriteAllowed(command);
  if (command.targetUrl !== TARGET_URL || command.deploymentFingerprint !== DEPLOYMENT) {
    throw new Error(`This campaign is pinned to prod:${DEPLOYMENT}.`);
  }
  const token = requireProductionWriteCredential("profileMediaWrite").token;
  const client = new ConvexHttpClient(command.targetUrl);
  const lock = acquireLedgerLock(ledgerPath);
  try {
    const ledger = readOrCreateLedger(ledgerPath, inputs);
    if (phase === "existing-dry-run") {
      const result = await runExistingProfileDryRunPhase(inputs, ledger, {
        readProfiles: async (keys) => await client.query(
          api.contributorProfiles.getForBulkImport,
          { apiKey: token, keys },
        ),
        dryRunProfiles: async (payload) => await client.mutation(
          api.contributorProfiles.importReviewedProfilePlan,
          { ...payload, apiKey: token },
        ),
        persist: (nextLedger) => writeLedgerAtomic(ledgerPath, nextLedger),
      });
      console.log(
        result.resumed
          ? "existing-profile dry run already ledgered; no Convex call repeated."
          : "existing-profile dry run complete: 3 updates, 1 unchanged, 0 blocked.",
      );
      return result;
    }
    if (phase === "existing-profiles") {
      const result = await runExistingProfileWritePhase(inputs, ledger, {
        writeProfiles: async (payload) => await client.mutation(
          api.contributorProfiles.importReviewedProfilePlan,
          { ...payload, apiKey: token },
        ),
        readProfiles: async (keys) => await client.query(
          api.contributorProfiles.getForBulkImport,
          { apiKey: token, keys },
        ),
        persist: (nextLedger) => writeLedgerAtomic(ledgerPath, nextLedger),
      });
      console.log(
        result.resumed
          ? "existing profiles already verified: mutation was not called again."
          : "existing profiles complete: exact four-profile readback verified and ledgered.",
      );
      return result;
    }
    if (phase === "profiles") {
      const result = await runProfileWritePhase(inputs, ledger, {
        writeProfiles: async (payload) => await client.mutation(
          api.contributorProfiles.importReviewedProfilePlan,
          { ...payload, apiKey: token },
        ),
        readProfiles: async (keys) => await client.query(
          api.contributorProfiles.getForBulkImport,
          { apiKey: token, keys },
        ),
        persist: (nextLedger) => writeLedgerAtomic(ledgerPath, nextLedger),
      });
      console.log(
        result.resumed
          ? "profiles already verified: mutation was not called again."
          : "profiles complete: exact eight-profile readback verified and ledgered.",
      );
      return result;
    }
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
