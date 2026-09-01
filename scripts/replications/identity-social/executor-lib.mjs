import { createHash } from "node:crypto";
import { appendFileSync, existsSync, readFileSync } from "node:fs";

export const PRODUCTION_DEPLOYMENT = "glad-minnow-656";
export const MAX_BATCH_COUNT = 50;
export const MAX_BATCH_BYTES = 512_000;
export const PINNED_PROFILE_COUNT = 2_119;
export const PINNED_PROFILE_SNAPSHOT_DIGEST = "aea1bbeac1ce5a10e7e3a0981af17b40909c13ecf04fcf49299bbb32f66c2d8d";

export function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value)
    .filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => [key, canonical(item)]));
  return value;
}
export function canonicalJson(value) { return JSON.stringify(canonical(value)); }
export function digest(value) { return createHash("sha256").update(canonicalJson(value)).digest("hex"); }
const evidenceDigest = (value) => digest(value);
const profileKey = (value) => String(value ?? "").trim().toUpperCase();
const normalizedAlias = (value) => String(value ?? "").trim().toLowerCase();

export function verifyBaseProjection(projection, expectedProjectionDigest) {
  if (projection?.artifactType !== "replication-identity-social-local-projection") throw new Error("Unexpected projection artifact type.");
  const { projectionSha256, ...core } = projection;
  if (!/^[a-f0-9]{64}$/.test(projectionSha256 ?? "") || digest(core) !== projectionSha256) throw new Error("Base projection content digest is invalid.");
  if (projectionSha256 !== expectedProjectionDigest) throw new Error("Projection digest does not match the explicitly expected base digest.");
  return projectionSha256;
}

export function verifyDeliveryReceiptSidecar(projection, sidecar, expectedSidecarDigest) {
  if (sidecar?.artifactType !== "identity-social-production-delivery-receipt-sidecar" || sidecar.schemaVersion !== 2) throw new Error("Unexpected delivery receipt sidecar artifact.");
  if (!/^[a-f0-9]{64}$/.test(expectedSidecarDigest ?? "")) throw new Error("An explicit receipt sidecar digest is required.");
  const { receiptSidecarSha256, ...core } = sidecar;
  const computed = digest(core);
  if (receiptSidecarSha256 !== computed || receiptSidecarSha256 !== expectedSidecarDigest) throw new Error("Delivery receipt sidecar digest mismatch.");
  if (sidecar.baseProjectionSha256 !== projection.projectionSha256) throw new Error("Delivery receipt sidecar targets a different base projection.");
  if (sidecar.baseProjectionOperationCount !== projection.operations.length) throw new Error("Delivery receipt sidecar base operation count mismatch.");
  for (const [operationId, item] of Object.entries(sidecar.receipts ?? {})) {
    if (item.operation_id !== operationId || item.projection_sha256 !== projection.projectionSha256) throw new Error(`Receipt ${operationId} is not bound to the immutable base projection.`);
  }
  return { receipts: sidecar.receipts, receiptSidecarSha256 };
}

function evidence(kind, source, note, extra = {}) {
  const item = { kind, ...(source ? { reference_url: source } : {}), ...(note ? { note } : {}), ...extra };
  return { ...item, digest: evidenceDigest(item) };
}

export function indexProfiles(rows) {
  const byKey = new Map();
  for (const row of rows) {
    const key = profileKey(row.key);
    if (!key || !row.profileId) throw new Error("Every profile resolution row requires key and profileId.");
    if (byKey.has(key) && byKey.get(key).profileId !== row.profileId) throw new Error(`Identity ambiguity for profile key ${key}.`);
    byKey.set(key, row);
  }
  return byKey;
}

export function canonicalProfileSnapshotDigest(rows) {
  const canonicalRows = rows.map((row) => {
    const key = profileKey(row.key);
    const aliases = [...new Set((row.aliases ?? []).map(normalizedAlias).filter(Boolean))].sort();
    return {
      key, displayName: String(row.displayName ?? "").trim(), aliases,
      avatarUrl: row.avatarUrl ?? null, bio: row.bio ?? "", links: row.links ?? [],
      hasCustomBio: Boolean(row.hasCustomBio), replicationOrder: row.replicationOrder ?? [],
      reportOrder: row.reportOrder ?? [], role: row.role ?? null,
    };
  }).sort((a, b) => a.key.localeCompare(b.key));
  // This snapshot predates the generic recursively key-sorted serializer. Its
  // reviewed CAS contract is compact JSON in the explicit field order above;
  // changing serializers produces a different digest without any data drift.
  return createHash("sha256").update(JSON.stringify(canonicalRows)).digest("hex");
}

export function validatePinnedProfileSnapshot(document) {
  const rows = document?.profiles;
  if (!Array.isArray(rows) || rows.length !== PINNED_PROFILE_COUNT) throw new Error("--profiles must contain exactly 2,119 immutable contributor rows.");
  const ids = new Set(); const keys = new Set();
  for (const row of rows) {
    if (!row.profileId || ids.has(row.profileId)) throw new Error("Every pinned profile row requires a unique immutable profileId.");
    ids.add(row.profileId);
    const key = profileKey(row.key);
    if (!key || keys.has(key)) throw new Error("Every pinned profile row requires a unique canonical key.");
    keys.add(key);
  }
  const computed = canonicalProfileSnapshotDigest(rows);
  if (computed !== PINNED_PROFILE_SNAPSHOT_DIGEST) throw new Error(`Pinned 2,119-profile canonical digest mismatch: ${computed}.`);
  return rows;
}

function requireProfile(profiles, key) {
  const row = profiles.get(profileKey(key));
  if (!row) throw new Error(`No immutable contributor profile ID for ${key}.`);
  return row;
}

function receiptFor(receipts, operation) {
  return receipts?.[operation.operationId] ?? receipts?.[operation.after?.sha256] ?? receipts?.[operation.after?.derivativeSha256] ?? null;
}
function verifiedDelivery(raw, mediaDigest) {
  if (!raw) return null;
  const receipt = raw.receipt ?? raw;
  const r2Key = raw.r2_key ?? raw.key;
  const core = {
    url: receipt.url, content_sha256: receipt.content_sha256, byte_size: receipt.byte_size,
    http_status: receipt.http_status, verified_at: receipt.verified_at, verifier: receipt.verifier,
  };
  if (!/^media\/sha256\/[a-f0-9]{2}\/[a-f0-9]{64}\.(?:jpg|jpeg|png|webp)$/.test(r2Key ?? "") || !r2Key.includes(mediaDigest) || !/^https:\/\//.test(core.url ?? "") || core.content_sha256 !== mediaDigest || !Number.isInteger(core.byte_size) || core.byte_size < 1 || ![200, 206].includes(core.http_status) || !Number.isFinite(core.verified_at) || !core.verifier) return null;
  const computed = digest(core);
  if (receipt.receipt_digest !== computed) return null;
  return { receipt: { ...core, receipt_digest: computed }, r2Key };
}

export function classifyProjectionOperation(operation, context) {
  if (operation.kind === "profile-binding") return { disposition: operation.action === "preserve-unresolved-profile-binding-no-write" ? "journal-only" : "actionable" };
  if (operation.kind === "profile-alias" && operation.action !== "add-alias-preserve-source-history") return { disposition: "journal-only", reason: operation.action };
  if (["replicator-verification", "profile-alias", "profile-avatar"].includes(operation.kind) && !context.profiles.has(profileKey(operation.target.profileKey))) return { disposition: "no-write", reason: "immutable-profile-id-unresolved" };
  if (operation.kind === "creator-attribution") {
    if (operation.action === "set-proven-creator-with-verified-chronology") {
      if (!Number.isSafeInteger(operation.after.originalPublishedAt) || !Number.isSafeInteger(operation.after.posterPostedAt) || operation.after.originalPublishedAt >= operation.after.posterPostedAt || !/^[a-f0-9]{64}$/.test(operation.after.sourceDigest ?? "")) {
        return { disposition: "no-write", reason: "typed-creator-chronology-invalid" };
      }
    }
  }
  if (operation.kind === "profile-avatar" || operation.kind === "social-asset") {
    const mediaDigest = operation.after.derivativeSha256 ?? operation.after.sha256;
    if (!verifiedDelivery(receiptFor(context.receipts, operation), mediaDigest)) return { disposition: "no-write", reason: "verified-delivery-receipt-required" };
  }
  if (operation.kind === "social-asset" && operation.target.entityType === "replications" && !context.replicationIds?.[operation.target.entityKey]) return { disposition: "no-write", reason: "immutable-replication-id-unresolved" };
  return { disposition: "actionable" };
}

function transformedEvidence(operation) {
  const urls = operation.evidence?.sources ?? [];
  const values = urls.slice(0, 32).map((source) => evidence(
    source.authority ? "earlier-exact-source" : "editorial-review", source.url, source.finding,
  ));
  if (!values.length) values.push(evidence("editorial-review", undefined, operation.evidence?.rationale ?? `Reviewed campaign operation ${operation.operationId}.`));
  return values;
}

export function transformOperation(operation, context) {
  const classification = classifyProjectionOperation(operation, context);
  if (classification.disposition === "no-write") return { operation, ...classification };
  const profiles = context.profiles;
  const envelope = { base_projection_digest: context.expectedProjectionDigest, receipt_sidecar_digest: context.receiptSidecarDigest ?? null };
  const common = { expected_operation_id: null, projection: operation, ...envelope };
  let kind; let value;
  if (operation.kind === "profile-binding") {
    const verificationOperation = context.verificationOperations?.get(operation.after?.verificationDependency?.verificationOperationId);
    const decision = operation.action === "create-profile-then-bind-verification" ? "create" : operation.action === "bind-existing-profile-then-apply-verification" ? "bind" : "unresolved";
    if (!verificationOperation) throw new Error(`Profile binding ${operation.operationId} references a missing verification operation.`);
    if (decision === "unresolved") {
      const core = { schemaVersion: 1, projection: operation, artist_id: operation.target.artistId, decision, snapshot_digest: operation.expectedBefore.fullProductionProfileSetSha256, snapshot_profile_count: operation.expectedBefore.expectedProfileCount, profile_key: null, existing_profile_id: null, profile: null, verification: null, ...envelope };
      return { disposition: "journal-only", reason: operation.action, entry: { kind: "profile-binding", item_operation_id: `identity-social-item:v1:${digest(core).slice(0, 24)}`, projection: operation, artist_id: operation.target.artistId, decision, snapshot_digest: operation.expectedBefore.fullProductionProfileSetSha256, snapshot_profile_count: operation.expectedBefore.expectedProfileCount, ...envelope } };
    }
    const verification = {
      status: verificationOperation.after.verifiedReplicator ? "verified" : verificationOperation.after.verdict === "unclear" ? "unclear" : "not-verified",
      basis: "artist-sheet-review", work_count_reviewed: verificationOperation.evidence.workCount,
      rationale: verificationOperation.after.reviewTrail.map((x) => x.rationale).join("\n"),
      evidence: [evidence("editorial-review", undefined, `Reviewed artist sheet batch ${verificationOperation.evidence.sourceSheetBatch}.`)],
      source_digest: digest(verificationOperation.evidence),
    };
    const profileKeyValue = operation.target.profileKey;
    const profile = decision === "create" ? { display_name: operation.after.profile.displayName, aliases: operation.after.profile.aliases, links: operation.after.profile.links } : null;
    const existingProfileId = decision === "bind" ? operation.after.profileId : null;
    const core = { schemaVersion: 1, projection: operation, artist_id: operation.target.artistId, decision, snapshot_digest: operation.expectedBefore.fullProductionProfileSetSha256, snapshot_profile_count: operation.expectedBefore.expectedProfileCount, profile_key: profileKeyValue, existing_profile_id: existingProfileId, profile, verification, ...envelope };
    return { disposition: "actionable", entry: { kind: "profile-binding", item_operation_id: `identity-social-item:v1:${digest(core).slice(0, 24)}`, projection: operation, artist_id: operation.target.artistId, decision, snapshot_digest: operation.expectedBefore.fullProductionProfileSetSha256, snapshot_profile_count: operation.expectedBefore.expectedProfileCount, profile_key: profileKeyValue, ...(existingProfileId ? { existing_profile_id: existingProfileId } : {}), ...(profile ? { profile } : {}), verification, ...envelope } };
  } else if (operation.kind === "creator-attribution") {
    kind = "attribution";
    const history = operation.after.posterAttribution;
    const proven = operation.action === "set-proven-creator-with-verified-chronology";
    value = {
      replication_id: operation.target.replicationId,
      poster_display_name: history.posterDisplayName,
      ...(history.posterProfileUrl ? { poster_profile_url: history.posterProfileUrl, poster_platform: "reddit" } : {}),
      ...(proven ? { poster_posted_at: operation.after.posterPostedAt } : {}),
      creator_display_name: operation.after.creatorDisplayName,
      creator_determination: proven ? "proven-different-creator" : operation.after.resolution === "unresolved" ? "unresolved" : "poster-presumed-creator",
      review_status: proven ? "creator-proven" : "reviewed-no-obvious-conflict",
      evidence: transformedEvidence(operation),
      source_digest: proven ? operation.after.sourceDigest : digest(operation.expectedBefore.sourceHistory),
    };
  } else if (operation.kind === "replicator-verification") {
    kind = "verification";
    value = {
      profile_id: requireProfile(profiles, operation.target.profileKey).profileId,
      status: operation.after.verifiedReplicator ? "verified" : operation.after.verdict === "unclear" ? "unclear" : "not-verified",
      basis: "artist-sheet-review", work_count_reviewed: operation.evidence.workCount,
      rationale: operation.after.reviewTrail.map((x) => x.rationale).join("\n"),
      evidence: [evidence("editorial-review", undefined, `Reviewed artist sheet batch ${operation.evidence.sourceSheetBatch}.`)],
      source_digest: digest(operation.evidence),
    };
  } else if (operation.kind === "profile-alias") {
    kind = "alias";
    value = {
      profile_id: requireProfile(profiles, operation.target.profileKey).profileId,
      alias: operation.target.alias, normalized_alias: normalizedAlias(operation.target.alias),
      evidence: [evidence("editorial-review", undefined, operation.evidence.identityConclusion)],
    };
  } else if (operation.kind === "profile-avatar") {
    kind = "avatar";
    const delivery = verifiedDelivery(receiptFor(context.receipts, operation), operation.after.derivativeSha256);
    const receipt = delivery.receipt;
    value = {
      profile_id: requireProfile(profiles, operation.target.profileKey).profileId,
      provenance: ["JOHNARCHIBALDWHEELER"].includes(operation.target.profileKey) ? "untraced" : ["JOHNTENNIEL"].includes(operation.target.profileKey) ? "artwork-derived" : "profile-controlled",
      r2_key: delivery.r2Key, public_url: receipt.url, source_url: operation.after.sourcePage,
      media_digest: operation.after.derivativeSha256, delivery_verification: "verified",
      delivery_verified_at: receipt.verified_at, delivery_receipt: receipt,
      evidence: [evidence("profile", operation.after.sourcePage, operation.evidence.rationale)],
    };
  } else {
    kind = "social-asset";
    const delivery = verifiedDelivery(receiptFor(context.receipts, operation), operation.after.sha256);
    const receipt = delivery.receipt;
    value = {
      entity_kind: operation.target.entityType, entity_key: operation.target.entityKey,
      ...(operation.target.entityType === "replications" ? { replication_id: context.replicationIds[operation.target.entityKey] } : {}),
      variant: "open-graph", r2_key: delivery.r2Key, public_url: receipt.url, width: 1200, height: 630, mime_type: "image/jpeg",
      media_digest: operation.after.sha256, source_digest: digest(operation.after), status: "ready",
      delivery_verification: "verified", delivery_verified_at: receipt.verified_at, delivery_receipt: receipt,
    };
  }
  const target = kind === "attribution" ? { kind, replication_id: value.replication_id }
    : kind === "alias" ? { kind, profile_id: value.profile_id, normalized_alias: value.normalized_alias }
      : kind === "avatar" ? { kind, profile_id: value.profile_id, media_digest: value.media_digest }
        : kind === "verification" ? { kind, profile_id: value.profile_id }
          : { kind: "social-asset", entity_kind: value.entity_kind, entity_key: value.entity_key, variant: value.variant };
  const entryCore = { schemaVersion: 1, projection: operation, target, value, ...envelope };
  return { disposition: classification.disposition, reason: classification.reason, entry: { kind, item_operation_id: `identity-social-item:v1:${digest(entryCore).slice(0, 24)}`, ...common, value } };
}

export function buildExecutionPlan(projection, context) {
  if (projection.target?.convexDeployment !== PRODUCTION_DEPLOYMENT) throw new Error("Projection targets the wrong Convex deployment.");
  verifyBaseProjection(projection, context.expectedProjectionDigest);
  const verificationOperations = new Map(projection.operations.filter((operation) => operation.kind === "replicator-verification").map((operation) => [operation.operationId, operation]));
  const boundVerificationIds = new Set(projection.operations.filter((operation) => operation.kind === "profile-binding").map((operation) => operation.after?.verificationDependency?.verificationOperationId).filter(Boolean));
  const transformed = projection.operations.map((operation) => boundVerificationIds.has(operation.operationId) ? { operation, disposition: "no-write", reason: "verification-submitted-with-profile-binding" } : transformOperation(operation, { ...context, verificationOperations }));
  const entries = transformed.filter((x) => x.disposition === "actionable" || x.disposition === "journal-only").map((x) => x.entry);
  const noWrites = transformed.filter((x) => x.disposition === "no-write").map((x) => ({ operation_id: x.operation.operationId, kind: x.operation.kind, reason: x.reason }));
  return { projection_digest: projection.projectionSha256, ...(context.receiptSidecarDigest ? { receipt_sidecar_digest: context.receiptSidecarDigest } : {}), entries, noWrites, batches: makeBatches(entries) };
}

export function makeBatches(entries) {
  const result = [];
  for (const kind of ["profile-binding", "attribution", "alias", "avatar", "verification", "social-asset"]) {
    const kindLimit = kind === "profile-binding" ? 25 : MAX_BATCH_COUNT;
    let batch = [];
    for (const entry of entries.filter((x) => x.kind === kind)) {
      const candidate = [...batch, entry];
      if (candidate.length > kindLimit || Buffer.byteLength(canonicalJson(candidate)) > MAX_BATCH_BYTES) {
        if (!batch.length) throw new Error(`Single ${kind} entry exceeds ${MAX_BATCH_BYTES} bytes.`);
        result.push(finishBatch(kind, batch)); batch = [entry];
      } else batch = candidate;
    }
    if (batch.length) result.push(finishBatch(kind, batch));
  }
  return result;
}
function finishBatch(kind, entries) {
  const operation_id = `identity-social-batch:${kind}:${digest(entries).slice(0, 24)}`;
  return { operation_id, kind, entries, bytes: Buffer.byteLength(canonicalJson(entries)) };
}

export function selectCanaries(batches) {
  const seen = new Set(); const canaries = [];
  for (const batch of batches) if (!seen.has(batch.kind)) { seen.add(batch.kind); canaries.push({ ...batch, entries: [batch.entries[0]], operation_id: `identity-social-canary:${batch.kind}:${digest(batch.entries[0]).slice(0, 24)}` }); }
  return canaries;
}
export function batchesAfterCanaries(batches, canaries = selectCanaries(batches)) {
  const canaryItems = new Set(canaries.flatMap((batch) => batch.entries.map((entry) => entry.item_operation_id)));
  return makeBatches(batches.flatMap((batch) => batch.entries).filter((entry) => !canaryItems.has(entry.item_operation_id)));
}
export function assertPreviewMatches(entry, preview) {
  if (!preview || preview.matches !== true || preview.digest !== entry.projection.expectedBeforeSha256) throw new Error(`CAS mismatch for ${entry.item_operation_id}${preview?.error ? `: ${preview.error}` : ""}.`);
}
export function rollbackManifest(completedBatches) {
  return [...completedBatches].reverse().map((batch) => ({ rollback_of: batch.operation_id, operation_id: `identity-social-rollback:${digest({ rollback_of: batch.operation_id }).slice(0, 24)}` }));
}
export function loadLedger(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
}
export function appendLedger(path, event) { appendFileSync(path, `${canonicalJson(event)}\n`, { flag: "a" }); }
export function pendingBatches(batches, ledger) {
  const done = new Set(ledger.filter((x) => x.event === "batch-readback-verified").map((x) => x.operation_id));
  return batches.filter((x) => !done.has(x.operation_id));
}
