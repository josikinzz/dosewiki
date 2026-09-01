#!/usr/bin/env node
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../convex/_generated/api.js";
import {
  assertProductionWriteAllowed,
  createProductionWriteCommand,
  requireProductionWriteCredential,
} from "../../lib/production-write-command.mjs";
import { appendLedger, digest, loadLedger, PRODUCTION_DEPLOYMENT } from "./executor-lib.mjs";
import {
  JOSIE_PROFILE_ID,
  JOSIE_REPLACEMENT_AVATAR,
  JOSIE_RESTORED_AVATAR,
  assertJosieCorrectionLiveState,
  buildJosieProfileCorrection,
} from "./josie-profile-correction-lib.mjs";

const CAMPAIGN = "/Users/josie/Documents/Dose Wiki Media Review/Data/Replication Identity and Social Pass 2026-08-31";
const OPERATION = "restore-josie-profile-curation";

const flag = (argv, name) => {
  const value = argv.find((item) => item.startsWith(`${name}=`));
  return value ? value.slice(name.length + 1) : null;
};

export function parseJosieCorrectionArgs(argv) {
  return {
    actor: flag(argv, "--actor-email"),
    ledger: flag(argv, "--ledger") ?? `${CAMPAIGN}/josie-profile-correction-ledger.jsonl`,
    rollbackOut: flag(argv, "--rollback-out") ?? `${CAMPAIGN}/josie-profile-correction-rollback-manifest.json`,
    argv,
  };
}

export async function fetchTrustedAvatarReceipt(fetchImpl = fetch, now = Date.now) {
  const response = await fetchImpl(JOSIE_RESTORED_AVATAR.publicUrl, { cache: "no-store" });
  if (!response.ok || ![200, 206].includes(response.status)) throw new Error(`Restored Josie avatar returned HTTP ${response.status}.`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const contentSha256 = createHash("sha256").update(bytes).digest("hex");
  if (bytes.byteLength !== JOSIE_RESTORED_AVATAR.byteSize || contentSha256 !== JOSIE_RESTORED_AVATAR.sha256) {
    throw new Error("Deployed Josie avatar bytes do not match the owner-selected pre-campaign asset.");
  }
  const core = {
    url: JOSIE_RESTORED_AVATAR.publicUrl,
    content_sha256: contentSha256,
    byte_size: bytes.byteLength,
    http_status: response.status,
    verified_at: now(),
    verifier: "dosewiki-admin/identity-social-full-byte-verifier-v1",
  };
  return { ...core, receipt_digest: digest(core) };
}

function preparedCorrection(events) {
  const prepared = events.find((event) => event.event === "correction-prepared");
  return prepared?.correction ?? null;
}

function correctionIsComplete(readback, correction) {
  try {
    return assertJosieCorrectionLiveState(readback, correction);
  } catch {
    return false;
  }
}

function rollbackManifest(correction) {
  return {
    target: PRODUCTION_DEPLOYMENT,
    profile_id: JOSIE_PROFILE_ID,
    order: "reverse-application-order",
    operations: correction.rollback,
  };
}

export async function runJosieProfileCorrection(argv = process.argv.slice(2), adapters = {}) {
  const options = parseJosieCorrectionArgs(argv);
  const command = adapters.command ?? createProductionWriteCommand({ operation: OPERATION, argv });
  if (!command.targetUrl || command.deploymentFingerprint !== PRODUCTION_DEPLOYMENT) {
    throw new Error(`Josie correction is restricted to ${PRODUCTION_DEPLOYMENT}.`);
  }
  if (!options.actor) throw new Error("--actor-email is required for authenticated dry-run and write modes.");
  if (command.writeRequested) assertProductionWriteAllowed(command);
  const credential = adapters.credential ?? requireProductionWriteCredential("replicationMaintenance");
  const client = adapters.client ?? new ConvexHttpClient(command.targetUrl);
  const query = adapters.query ?? ((ref, args) => client.query(ref, args));
  const mutate = adapters.mutate ?? ((ref, args) => client.mutation(ref, args));
  const readLedger = adapters.loadLedger ?? loadLedger;
  const append = adapters.appendLedger ?? appendLedger;
  const writeRollback = adapters.writeRollbackManifest ?? ((path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`));
  const auth = { apiKey: credential.token, actor_email: options.actor };
  const readback = () => query(api.replicationIdentitySocial.getProfileCurationReadbackAuthenticated, {
    ...auth,
    profile_id: JOSIE_PROFILE_ID,
    history_digests: [JOSIE_REPLACEMENT_AVATAR.sha256, JOSIE_RESTORED_AVATAR.sha256],
  });

  const existingEvents = readLedger(options.ledger);
  let correction = preparedCorrection(existingEvents);
  const initial = await readback();
  if (correction && correctionIsComplete(initial, correction)) {
    writeRollback(options.rollbackOut, rollbackManifest(correction));
    if (!existingEvents.some((event) => event.event === "final-readback-verified")) {
      append(options.ledger, { event: "final-readback-verified", profile_id: JOSIE_PROFILE_ID, idempotent_resume: true, at: Date.now() });
    }
    return { mode: command.writeRequested ? "write" : "dry-run", status: "already-complete", wrote: false };
  }

  if (!correction) {
    const receipt = await (adapters.fetchReceipt ?? fetchTrustedAvatarReceipt)();
    correction = buildJosieProfileCorrection({ receipt });
    append(options.ledger, { event: "correction-prepared", profile_id: JOSIE_PROFILE_ID, correction, at: Date.now() });
  }
  writeRollback(options.rollbackOut, rollbackManifest(correction));

  const avatarEntry = correction.avatar.entries[0];
  let avatarReceipt = await query(api.replicationIdentitySocial.getOperationCompletionReceiptAuthenticated, {
    ...auth,
    operation_id: correction.avatar.operationId,
  });
  if (avatarReceipt && !avatarReceipt.all_live_match) throw new Error("Existing Josie avatar correction receipt no longer matches live state.");

  if (!avatarReceipt) {
    const preview = await query(api.replicationIdentitySocial.previewCanonicalBeforeAuthenticated, { ...auth, entry: avatarEntry });
    if (!preview.matches || preview.digest !== avatarEntry.projection.expectedBeforeSha256) {
      throw new Error(`Josie avatar exact preview failed: ${preview.error ?? preview.digest}`);
    }
    const preflight = await query(api.replicationIdentitySocial.preflightBatchEntryAuthenticated, { ...auth, entry: avatarEntry });
    if (!preflight.matches) throw new Error(`Josie avatar preflight failed: ${preflight.error ?? "unknown"}`);
    const previewResult = await mutate(api.replicationIdentitySocial.applyBatch, {
      ...auth,
      operation_id: correction.avatar.operationId,
      kind: "avatar",
      dry_run: !command.writeRequested,
      entries: correction.avatar.entries,
    });
    append(options.ledger, { event: command.writeRequested ? "avatar-applied" : "avatar-dry-run-verified", result: previewResult, at: Date.now() });
    if (!command.writeRequested) {
      return { mode: "dry-run", status: "ready", wrote: false, avatar: previewResult, profile_link_change: "would-remove-all-links-except-personal-website" };
    }
    avatarReceipt = await query(api.replicationIdentitySocial.getOperationCompletionReceiptAuthenticated, {
      ...auth,
      operation_id: correction.avatar.operationId,
    });
    if (!avatarReceipt || !avatarReceipt.all_live_match || avatarReceipt.item_count !== 1) {
      throw new Error("Josie avatar authenticated completion receipt failed.");
    }
    append(options.ledger, { event: "avatar-readback-verified", receipt: avatarReceipt, at: Date.now() });
  }

  if (!command.writeRequested) {
    return { mode: "dry-run", status: "avatar-already-applied-profile-pending", wrote: false };
  }

  const profileDryRun = await mutate(api.contributorProfiles.importReviewedProfilePlan, {
    apiKey: credential.token,
    operationId: correction.profile.operationId,
    dryRun: true,
    entries: correction.profile.entries,
  });
  if (profileDryRun.blocked !== 0 || profileDryRun.created !== 0 || profileDryRun.updated + profileDryRun.unchanged !== 1) {
    throw new Error("Josie personal-site-only profile dry-run did not produce one safe existing-profile outcome.");
  }
  const profileResult = await mutate(api.contributorProfiles.importReviewedProfilePlan, {
    apiKey: credential.token,
    operationId: correction.profile.operationId,
    dryRun: false,
    entries: correction.profile.entries,
  });
  append(options.ledger, { event: "profile-links-applied", result: profileResult, at: Date.now() });

  const finalReadback = await readback();
  assertJosieCorrectionLiveState(finalReadback, correction);
  append(options.ledger, {
    event: "final-readback-verified",
    profile_id: JOSIE_PROFILE_ID,
    avatar_sha256: JOSIE_RESTORED_AVATAR.sha256,
    links: finalReadback.profile.links,
    history_hashes: finalReadback.avatarHistory.map((item) => item.media_digest).sort(),
    at: Date.now(),
  });
  return { mode: "write", status: "complete", wrote: true, avatar: avatarReceipt, profile: profileResult };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runJosieProfileCorrection().then((result) => console.log(JSON.stringify(result, null, 2))).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
