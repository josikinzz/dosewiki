#!/usr/bin/env node
/** Pinned, resumable rollout for the reviewed Replication Index profile plan. */
import { createHash } from "node:crypto";
import {
  chmodSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ConvexHttpClient } from "convex/browser";

import { api } from "../../convex/_generated/api.js";
import {
  assertProductionWriteAllowed,
  createProductionWriteCommand,
  requireProductionWriteCredential,
} from "../lib/production-write-command.mjs";

export const OPERATION = "replication-index-profile-rollout";
export const EXPECTED_DEPLOYMENT = "glad-minnow-656";
export const EXPECTED_TARGET_URL = `https://${EXPECTED_DEPLOYMENT}.convex.cloud`;
export const DEFAULT_PLAN_PATH =
  "/Users/josie/Documents/Dose Wiki Media Review/Data/Replication Index Campaign 2026-08-30/attribution-profile-materialization-2026-08-31.json";
export const DEFAULT_LEDGER_PATH =
  "/Users/josie/Documents/Dose Wiki Media Review/Data/Replication Index Campaign 2026-08-30/profile-rollout-production-ledger-2026-08-31.json";
export const EXPECTED_FILE_SHA256 = "f9077a939d562d86d69acaa8cc644841e4e9bac1b15c9dc2d4697ad398975a35";
export const EXPECTED_CONTENT_SHA256 = "a10e5a6a39a2ba7b3734e87e7b8f715b8d337a5c380cc8bb73f07460921f4211";

type ProfileState = {
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
type Entry = {
  outcome: "reviewed-new" | "existing-profile";
  creatorName: string;
  creatorKind: "person";
  expectedAbsent?: true;
  profileId?: string;
  expected?: ProfileState;
  profile: ProfileState;
};
type Payload = { operationId: string; dryRun: boolean; entries: Entry[] };
type RollbackPayload = { operationId: string; dryRun: boolean; entries: Entry[] };
type Batch = { batchNumber: number; entryCount: number; payloadSha256: string; payload: Payload };
export type Materialization = {
  schemaVersion: number;
  artifactType: string;
  campaignId: string;
  target: { deployment: string; writesPerformed: number };
  policy: { batchCap: number };
  counts: Record<string, number>;
  avatarOutcomes: Array<{ key: string; mode: string }>;
  batches: Batch[];
  contentSha256: string;
};
type BatchLedger = {
  batchNumber: number;
  operationId: string;
  payloadSha256: string;
  status: "pending" | "uncertain" | "verified" | "rollback-uncertain" | "rolled-back";
  attemptedAt: string | null;
  verifiedAt: string | null;
  rollbackAttemptedAt: string | null;
  rolledBackAt: string | null;
};
export type ProfileRolloutLedger = {
  schemaVersion: 1;
  artifactFileSha256: string;
  artifactContentSha256: string;
  targetDeployment: string;
  batches: BatchLedger[];
};

function sha256(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function required(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function flagValue(argv: string[], name: string) {
  const equals = argv.find((item) => item.startsWith(`${name}=`));
  if (equals) return equals.slice(name.length + 1);
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

function storedState(row: Record<string, unknown>): ProfileState {
  return {
    key: String(row.key ?? ""),
    displayName: String(row.displayName ?? ""),
    aliases: Array.isArray(row.aliases) ? row.aliases as string[] : [],
    avatarStorageId: typeof row.avatarStorageId === "string" ? row.avatarStorageId : null,
    avatarR2Key: typeof row.avatarR2Key === "string" ? row.avatarR2Key : null,
    avatarUrl: typeof row.avatarUrl === "string" ? row.avatarUrl : null,
    bio: String(row.bio ?? ""),
    role: typeof row.role === "string" ? row.role : null,
    links: Array.isArray(row.links) ? row.links as ProfileState["links"] : [],
  };
}

export function validateMaterialization(planPath = DEFAULT_PLAN_PATH): Materialization {
  const bytes = readFileSync(planPath);
  required(sha256(bytes) === EXPECTED_FILE_SHA256, "Pinned profile materialization file hash mismatch.");
  const parsed = JSON.parse(bytes.toString("utf8")) as Materialization;
  const { contentSha256, ...withoutSelfHash } = parsed;
  required(contentSha256 === EXPECTED_CONTENT_SHA256, "Pinned profile materialization content hash mismatch.");
  required(sha256(canonical(withoutSelfHash)) === contentSha256, "Profile materialization self-hash mismatch.");
  required(parsed.schemaVersion === 1, "Unsupported profile materialization schema.");
  required(parsed.artifactType === "replication-index-attribution-profile-materialization", "Wrong artifact type.");
  required(parsed.target.deployment === `prod:${EXPECTED_DEPLOYMENT}`, "Wrong pinned production deployment.");
  required(parsed.target.writesPerformed === 0, "Input artifact unexpectedly records production writes.");
  required(parsed.policy.batchCap === 50, "Profile batch cap must be exactly 50.");
  required(parsed.batches.length === parsed.counts.batches, "Batch count mismatch.");
  const keys = new Set<string>();
  const names = new Set<string>();
  let entryCount = 0;
  let newProfiles = 0;
  let existingProfiles = 0;
  parsed.batches.forEach((batch, index) => {
    required(batch.batchNumber === index + 1, "Batch numbering is not contiguous.");
    required(batch.entryCount === batch.payload.entries.length, `Batch ${batch.batchNumber} entry count mismatch.`);
    required(batch.entryCount > 0 && batch.entryCount <= 50, `Batch ${batch.batchNumber} exceeds the 50-row cap.`);
    required(batch.payload.dryRun === true, `Batch ${batch.batchNumber} source payload is not dry-run pinned.`);
    required(sha256(canonical(batch.payload)) === batch.payloadSha256, `Batch ${batch.batchNumber} payload hash mismatch.`);
    for (const entry of batch.payload.entries) {
      required(entry.outcome === "reviewed-new" || entry.outcome === "existing-profile", "Unreviewed profile outcome in rollout.");
      required(!keys.has(entry.profile.key), `Duplicate profile key ${entry.profile.key}.`);
      const normalizedName = entry.profile.displayName.toLocaleLowerCase();
      required(!names.has(normalizedName), `Duplicate profile display name ${entry.profile.displayName}.`);
      keys.add(entry.profile.key);
      names.add(normalizedName);
      entryCount += 1;
      if (entry.outcome === "reviewed-new") newProfiles += 1;
      else existingProfiles += 1;
    }
  });
  required(entryCount === parsed.counts.profileOperations, "Profile operation count mismatch.");
  required(newProfiles === parsed.counts.newProfiles, "New profile count mismatch.");
  required(existingProfiles === parsed.counts.existingProfiles, "Existing profile count mismatch.");
  required(parsed.counts.maximumBatchSize <= 50, "Recorded maximum batch size exceeds 50.");
  required(parsed.counts.productionWrites === 0, "Materialization productionWrites must be zero.");
  required(parsed.avatarOutcomes.length === parsed.counts.profileOperations, "Avatar outcome count mismatch.");
  required(
    parsed.avatarOutcomes.filter((row) => row.mode === "ui-initials-no-file").length
      === parsed.counts.initialsFallbacksForNewProfiles,
    "Avatar fallback count mismatch.",
  );
  required(
    parsed.avatarOutcomes.every((row) =>
      row.mode === "ui-initials-no-file" || row.mode === "preserve-existing-avatar-or-fallback"),
    "Unexpected avatar outcome.",
  );
  return parsed;
}

export function createLedger(plan: Materialization): ProfileRolloutLedger {
  return {
    schemaVersion: 1,
    artifactFileSha256: EXPECTED_FILE_SHA256,
    artifactContentSha256: plan.contentSha256,
    targetDeployment: EXPECTED_DEPLOYMENT,
    batches: plan.batches.map((batch) => ({
      batchNumber: batch.batchNumber,
      operationId: batch.payload.operationId,
      payloadSha256: batch.payloadSha256,
      status: "pending",
      attemptedAt: null,
      verifiedAt: null,
      rollbackAttemptedAt: null,
      rolledBackAt: null,
    })),
  };
}

export function validateLedger(ledger: ProfileRolloutLedger, plan: Materialization) {
  required(ledger.schemaVersion === 1, "Unsupported profile rollout ledger schema.");
  required(ledger.artifactFileSha256 === EXPECTED_FILE_SHA256, "Ledger artifact file hash mismatch.");
  required(ledger.artifactContentSha256 === plan.contentSha256, "Ledger artifact content hash mismatch.");
  required(ledger.targetDeployment === EXPECTED_DEPLOYMENT, "Ledger target deployment mismatch.");
  required(ledger.batches.length === plan.batches.length, "Ledger batch count mismatch.");
  ledger.batches.forEach((row, index) => {
    const batch = plan.batches[index]!;
    required(row.batchNumber === batch.batchNumber && row.operationId === batch.payload.operationId,
      `Ledger identity mismatch for batch ${batch.batchNumber}.`);
    required(row.payloadSha256 === batch.payloadSha256, `Ledger payload hash mismatch for batch ${batch.batchNumber}.`);
    required(["pending", "uncertain", "verified", "rollback-uncertain", "rolled-back"].includes(row.status), "Invalid ledger status.");
    // Older, still-valid ledgers predate rollback timestamps. Normalize them
    // in memory so the first atomic persistence upgrades without weakening pins.
    row.rollbackAttemptedAt ??= null;
    row.rolledBackAt ??= null;
  });
  return ledger;
}

export function atomicWriteLedger(filename: string, ledger: ProfileRolloutLedger) {
  mkdirSync(path.dirname(filename), { recursive: true });
  const temporary = `${filename}.${process.pid}.part`;
  writeFileSync(temporary, `${JSON.stringify(ledger, null, 2)}\n`, { mode: 0o600 });
  chmodSync(temporary, 0o600);
  renameSync(temporary, filename);
  chmodSync(filename, 0o600);
}

function exactReadbackMatches(batch: Batch, rows: Array<Record<string, unknown>>) {
  const byKey = new Map(rows.map((row) => [String(row.key), row]));
  if (byKey.size !== batch.entryCount || rows.length !== batch.entryCount) return false;
  return batch.payload.entries.every((entry) => {
    const row = byKey.get(entry.profile.key);
    if (!row) return false;
    if (entry.outcome === "existing-profile" && row._id !== entry.profileId) return false;
    return canonical(storedState(row)) === canonical(entry.profile);
  });
}

export function rollbackPayloadFor(batch: Batch, dryRun: boolean): RollbackPayload {
  return {
    // The backend uses the original operation ID to verify the exact
    // operation-scoped provenance written by importReviewedProfilePlan.
    operationId: batch.payload.operationId,
    dryRun,
    // The pinned entry contains both sides of the CAS: `profile` is the exact
    // applied state; `expected` is the exact pre-write state for an existing
    // profile, while `expectedAbsent` identifies a profile created by apply.
    entries: batch.payload.entries.map((entry) => structuredClone(entry)),
  };
}

function exactRollbackReadbackMatches(batch: Batch, rows: Array<Record<string, unknown>>) {
  const byKey = new Map(rows.map((row) => [String(row.key), row]));
  const existing = batch.payload.entries.filter((entry) => entry.outcome === "existing-profile");
  if (rows.length !== existing.length || byKey.size !== existing.length) return false;
  return batch.payload.entries.every((entry) => {
    const row = byKey.get(entry.profile.key);
    if (entry.outcome === "reviewed-new") return !row;
    return Boolean(
      row
      && row._id === entry.profileId
      && entry.expected
      && canonical(storedState(row)) === canonical(entry.expected),
    );
  });
}

export type RolloutDependencies = {
  dryRunBatch: (payload: Payload, token: string) => Promise<unknown>;
  writeBatch: (payload: Payload, token: string) => Promise<unknown>;
  rollbackBatch: (payload: RollbackPayload, token: string) => Promise<unknown>;
  readProfiles: (keys: string[], token: string) => Promise<Array<Record<string, unknown>>>;
  persist: (ledger: ProfileRolloutLedger) => void;
  now: () => string;
};

function validateDryRunResult(batch: Batch, result: unknown) {
  const value = result as Record<string, unknown>;
  required(value?.operationId === batch.payload.operationId, `Batch ${batch.batchNumber} dry-run operation mismatch.`);
  required(value?.dryRun === true, `Batch ${batch.batchNumber} did not return dryRun true.`);
  required(Array.isArray(value.rows) && value.rows.length === batch.entryCount, `Batch ${batch.batchNumber} dry-run row count mismatch.`);
  required(Number(value.blocked) === 0, `Batch ${batch.batchNumber} dry run was blocked.`);
}

function validateRollbackDryRunResult(batch: Batch, result: unknown) {
  const value = result as Record<string, unknown>;
  required(value?.operationId === batch.payload.operationId, `Batch ${batch.batchNumber} rollback dry-run operation mismatch.`);
  required(value?.dryRun === true, `Batch ${batch.batchNumber} rollback did not return dryRun true.`);
  required(Array.isArray(value.rows) && value.rows.length === batch.entryCount, `Batch ${batch.batchNumber} rollback dry-run row count mismatch.`);
  required(Number(value.skipped) === 0, `Batch ${batch.batchNumber} rollback dry run skipped an entry.`);
}

export async function runRollbackLiveDryRun(plan: Materialization, token: string, dependencies: RolloutDependencies) {
  for (const batch of [...plan.batches].reverse()) {
    const payload = rollbackPayloadFor(batch, true);
    validateRollbackDryRunResult(batch, await dependencies.rollbackBatch(payload, token));
  }
  return { phase: "rollback", batches: plan.batches.length, rows: plan.counts.profileOperations, wrote: false };
}

export async function runLiveDryRun(plan: Materialization, token: string, dependencies: RolloutDependencies) {
  for (const batch of plan.batches) {
    const payload = { ...batch.payload, dryRun: true };
    validateDryRunResult(batch, await dependencies.dryRunBatch(payload, token));
  }
  return { batches: plan.batches.length, rows: plan.counts.profileOperations, wrote: false };
}

export async function runWritePhase(
  phase: "canary" | "remaining",
  plan: Materialization,
  ledger: ProfileRolloutLedger,
  token: string,
  dependencies: RolloutDependencies,
) {
  validateLedger(ledger, plan);
  if (phase === "remaining") {
    required(ledger.batches[0]?.status === "verified", "Canary batch must be verified before remaining batches.");
  }
  const selected = phase === "canary" ? plan.batches.slice(0, 1) : plan.batches.slice(1);
  for (const batch of selected) {
    const row = ledger.batches[batch.batchNumber - 1]!;
    if (row.status === "verified") continue;
    if (row.status === "uncertain") {
      const readback = await dependencies.readProfiles(batch.payload.entries.map((entry) => entry.profile.key), token);
      if (!exactReadbackMatches(batch, readback)) {
        throw new Error(`Batch ${batch.batchNumber} remains uncertain after exact readback; do not retry.`);
      }
      row.status = "verified";
      row.verifiedAt = dependencies.now();
      dependencies.persist(ledger);
      continue;
    }
    row.status = "uncertain";
    row.attemptedAt = dependencies.now();
    dependencies.persist(ledger);
    await dependencies.writeBatch({ ...batch.payload, dryRun: false }, token);
    const readback = await dependencies.readProfiles(batch.payload.entries.map((entry) => entry.profile.key), token);
    if (!exactReadbackMatches(batch, readback)) {
      dependencies.persist(ledger);
      throw new Error(`Batch ${batch.batchNumber} write remains uncertain because exact readback did not verify; do not retry.`);
    }
    row.status = "verified";
    row.verifiedAt = dependencies.now();
    dependencies.persist(ledger);
  }
  return ledger;
}

export async function runRollbackPhase(
  plan: Materialization,
  ledger: ProfileRolloutLedger,
  token: string,
  dependencies: RolloutDependencies,
) {
  validateLedger(ledger, plan);
  const uncertainApply = ledger.batches.filter((row) => row.status === "uncertain");
  required(uncertainApply.length === 0,
    `Profile rollback is blocked by uncertain apply batches: ${uncertainApply.map((row) => row.batchNumber).join(", ")}.`);
  required(ledger.batches.some((row) => row.status === "verified" || row.status === "rollback-uncertain" || row.status === "rolled-back"),
    "No verified profile batch is available to roll back.");
  for (const batch of [...plan.batches].reverse()) {
    const row = ledger.batches[batch.batchNumber - 1]!;
    if (row.status === "pending") continue;
    if (row.status === "rolled-back") continue;
    required(row.status !== "uncertain", `Batch ${batch.batchNumber} has an uncertain apply outcome; rollback is blocked pending manual reconciliation.`);
    if (row.status === "rollback-uncertain") {
      const readback = await dependencies.readProfiles(batch.payload.entries.map((entry) => entry.profile.key), token);
      if (!exactRollbackReadbackMatches(batch, readback)) {
        throw new Error(`Batch ${batch.batchNumber} rollback remains uncertain after exact readback; do not retry.`);
      }
      row.status = "rolled-back";
      row.rolledBackAt = dependencies.now();
      dependencies.persist(ledger);
      continue;
    }
    required(row.status === "verified", `Batch ${batch.batchNumber} cannot roll back from status ${row.status}.`);
    row.status = "rollback-uncertain";
    row.rollbackAttemptedAt = dependencies.now();
    dependencies.persist(ledger);
    try {
      await dependencies.rollbackBatch(rollbackPayloadFor(batch, false), token);
      const readback = await dependencies.readProfiles(batch.payload.entries.map((entry) => entry.profile.key), token);
      if (!exactRollbackReadbackMatches(batch, readback)) {
        dependencies.persist(ledger);
        throw new Error(`Batch ${batch.batchNumber} rollback remains uncertain because exact readback did not verify; do not retry.`);
      }
      row.status = "rolled-back";
      row.rolledBackAt = dependencies.now();
      dependencies.persist(ledger);
    } catch (error) {
      dependencies.persist(ledger);
      if (error instanceof Error && /rollback remains uncertain/.test(error.message)) throw error;
      throw new Error(`Batch ${batch.batchNumber} rollback has an uncertain production outcome; do not retry. ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return ledger;
}

function loadLedger(filename: string, plan: Materialization) {
  try {
    return validateLedger(JSON.parse(readFileSync(filename, "utf8")) as ProfileRolloutLedger, plan);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return createLedger(plan);
  }
}

export async function runProfileRollout({
  argv = process.argv.slice(2),
  env = process.env,
  dependencies,
}: {
  argv?: string[];
  env?: NodeJS.ProcessEnv;
  dependencies?: Partial<RolloutDependencies>;
} = {}) {
  const planPath = flagValue(argv, "--plan") ?? DEFAULT_PLAN_PATH;
  const ledgerPath = flagValue(argv, "--ledger") ?? DEFAULT_LEDGER_PATH;
  const plan = validateMaterialization(planPath);
  const liveDryRun = argv.includes("--live-dry-run");
  const phase = flagValue(argv, "--phase") as "canary" | "remaining" | "rollback" | undefined;
  const writeRequested = argv.includes("--write");
  if (!liveDryRun && !writeRequested) {
    return { mode: "local-dry-run", batches: plan.batches.length, rows: plan.counts.profileOperations, networkCalls: 0 };
  }
  required(!(liveDryRun && writeRequested), "--live-dry-run and --write cannot be combined.");
  const command = createProductionWriteCommand({ operation: OPERATION, argv, env, loadsEnvLocal: false });
  required(command.targetUrl === EXPECTED_TARGET_URL, `Target must be exactly ${EXPECTED_TARGET_URL}.`);
  required(command.expectedDeployment === EXPECTED_DEPLOYMENT, `--expected-deployment must be ${EXPECTED_DEPLOYMENT}.`);
  if (writeRequested) {
    required(phase === "canary" || phase === "remaining" || phase === "rollback", "Writes require --phase=canary, --phase=remaining, or --phase=rollback.");
    assertProductionWriteAllowed(command);
  } else {
    required(!phase || phase === "rollback", "--live-dry-run only accepts --phase=rollback.");
  }
  const credential = requireProductionWriteCredential("profileMediaWrite", { env });
  required(
    credential.source === "scoped",
    "Replication Index profile rollout requires CONVEX_ADMIN_TOKEN_PROFILE_MEDIA_WRITE; the legacy broad admin key is not accepted.",
  );
  const token = credential.token;
  const client = dependencies ? null : new ConvexHttpClient(EXPECTED_TARGET_URL);
  const deps: RolloutDependencies = {
    dryRunBatch: dependencies?.dryRunBatch ?? (async (payload, apiKey) =>
      client!.mutation(api.contributorProfiles.importReviewedProfilePlan, { ...payload, apiKey } as never)),
    writeBatch: dependencies?.writeBatch ?? (async (payload, apiKey) =>
      client!.mutation(api.contributorProfiles.importReviewedProfilePlan, { ...payload, apiKey } as never)),
    rollbackBatch: dependencies?.rollbackBatch ?? (async (payload, apiKey) =>
      client!.mutation(api.contributorProfiles.rollbackReviewedProfilePlan, { ...payload, apiKey } as never)),
    readProfiles: dependencies?.readProfiles ?? (async (keys, apiKey) =>
      client!.query(api.contributorProfiles.getForBulkImport, { keys, apiKey }) as Promise<Array<Record<string, unknown>>>),
    persist: dependencies?.persist ?? ((ledger) => atomicWriteLedger(ledgerPath, ledger)),
    now: dependencies?.now ?? (() => new Date().toISOString()),
  };
  if (liveDryRun) return phase === "rollback"
    ? runRollbackLiveDryRun(plan, token, deps)
    : runLiveDryRun(plan, token, deps);
  const ledger = loadLedger(ledgerPath, plan);
  deps.persist(ledger);
  return phase === "rollback"
    ? runRollbackPhase(plan, ledger, token, deps)
    : runWritePhase(phase!, plan, ledger, token, deps);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  runProfileRollout().then((result) => console.log(JSON.stringify(result, null, 2))).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
