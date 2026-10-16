import { isValidR2Key } from "./replicationUrls";
import type { IdentitySocialBatchEntry, IdentitySocialTarget } from "./replicationIdentitySocialValidators";

const SHA256 = /^[a-f0-9]{64}$/;
const MAX_BATCH = 50;
const MAX_EVIDENCE = 32;
const MAX_PAYLOAD_BYTES = 512_000;
const ITEM_ID_VERSION = 1;
const encoder = new TextEncoder();
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => [key, canonical(item)]));
  return value;
}
export function canonicalJson(value: unknown) { return JSON.stringify(canonical(value)); }
export async function canonicalDigest(value: unknown) {
  const bytes = encoder.encode(canonicalJson(value));
  const hash = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
export function required(value: string, label: string, max = 200) {
  const clean = value.trim();
  if (!clean) throw new Error(`${label} is required.`);
  if (encoder.encode(clean).length > max) throw new Error(`${label} exceeds ${max} bytes.`);
  return clean;
}
export function digest(value: string, label: string) { if (!SHA256.test(value)) throw new Error(`${label} must be a lowercase SHA-256 digest.`); }
function https(value: string, label: string) {
  required(value, label, 2_048);
  let url: URL;
  try { url = new URL(value); } catch { throw new Error(`${label} must be an HTTPS URL.`); }
  if (url.protocol !== "https:" || !url.hostname) throw new Error(`${label} must be an HTTPS URL.`);
}

const projectionForKind = {
  attribution: "creator-attribution", alias: "profile-alias", avatar: "profile-avatar",
  verification: "replicator-verification", "social-asset": "social-asset",
} as const;

export function targetOf(entry: IdentitySocialBatchEntry): IdentitySocialTarget {
  if (entry.kind === "attribution") return { kind: "attribution", replication_id: entry.value.replication_id };
  if (entry.kind === "alias") return { kind: "alias", profile_id: entry.value.profile_id, normalized_alias: entry.value.normalized_alias };
  if (entry.kind === "avatar") return { kind: "avatar", profile_id: entry.value.profile_id, media_digest: entry.value.media_digest };
  if (entry.kind === "verification") return { kind: "verification", profile_id: entry.value.profile_id };
  return { kind: "social-asset", entity_kind: entry.value.entity_kind, entity_key: entry.value.entity_key, variant: entry.value.variant };
}

function validateDeliveryShape(value: { storage_id?: string; r2_key?: string; public_url?: string; delivery_verification: string; delivery_verified_at?: number; delivery_receipt?: unknown }, label: string) {
  if (value.r2_key) { required(value.r2_key, `${label} R2 key`, 256); if (!isValidR2Key(value.r2_key)) throw new Error(`${label} R2 key is not canonical.`); }
  if (value.public_url) https(value.public_url, `${label} public URL`);
  if (![value.storage_id, value.r2_key, value.public_url].some(Boolean)) throw new Error(`${label} requires a delivery locator.`);
  if (value.delivery_verification === "verified" && (!value.delivery_verified_at || !value.delivery_receipt)) throw new Error(`${label} verified delivery requires a receipt and timestamp.`);
  if (value.delivery_verification !== "verified" && (value.delivery_verified_at !== undefined || value.delivery_receipt !== undefined)) throw new Error(`${label} unverified delivery cannot carry a verified receipt.`);
}

export function validateIdentitySocialBatch(kind: IdentitySocialBatchEntry["kind"], entries: IdentitySocialBatchEntry[], batchId = "batch") {
  if (entries.length < 1 || entries.length > MAX_BATCH) throw new Error("Identity/social batches are limited to 1 to 50 records.");
  if (encoder.encode(canonicalJson(entries)).length > MAX_PAYLOAD_BYTES) throw new Error("Identity/social batch exceeds 512000 bytes.");
  const keys = new Set<string>();
  const ids = new Set<string>();
  const baseProjectionDigest = entries[0]?.base_projection_digest;
  const receiptSidecarDigest = entries[0]?.receipt_sidecar_digest ?? null;
  for (const entry of entries) {
    if (entry.kind !== kind || entry.projection.kind !== projectionForKind[entry.kind]) throw new Error("Entry and projection kinds do not match the batch.");
    const id = required(entry.item_operation_id, "Item operation ID");
    if (id === batchId || ids.has(id)) throw new Error("Item operation IDs must be unique and differ from the batch ID.");
    ids.add(id);
    if (entry.expected_operation_id) required(entry.expected_operation_id, "Expected operation ID");
    digest(entry.projection.expectedBeforeSha256, "Projection expected-before digest");
    digest(entry.base_projection_digest, "Base projection digest");
    if (entry.base_projection_digest !== baseProjectionDigest || (entry.receipt_sidecar_digest ?? null) !== receiptSidecarDigest) throw new Error("Batch entries must share one immutable base projection and receipt sidecar envelope.");
    if (entry.receipt_sidecar_digest) digest(entry.receipt_sidecar_digest, "Receipt sidecar digest");
    required(entry.projection.action, "Projection action", 160);
    const key = canonicalJson(targetOf(entry));
    if (keys.has(key)) throw new Error(`Duplicate identity/social target: ${key}.`);
    keys.add(key);
    const evidence = entry.kind === "social-asset" ? [] : entry.value.evidence;
    if (evidence.length > MAX_EVIDENCE) throw new Error("Identity evidence is limited to 32 items.");
    for (const item of evidence) {
      digest(item.digest, "Evidence digest");
      if (item.reference_url) https(item.reference_url, "Evidence URL");
      if (item.note) required(item.note, "Evidence note", 2_000);
      if (item.supports_source_digest) digest(item.supports_source_digest, "Supported source digest");
    }
    if (entry.kind === "attribution") {
      const x = entry.value;
      digest(x.source_digest, "Attribution source digest");
      required(x.poster_display_name, "Poster name", 160); required(x.creator_display_name, "Creator name", 160);
      if (x.poster_profile_url) https(x.poster_profile_url, "Poster profile URL");
      if (x.creator_profile_id && !x.poster_profile_id) throw new Error("Creator profile linkage requires poster profile linkage.");
      const sameName = x.creator_display_name.trim() === x.poster_display_name.trim();
      const sameProfile = x.creator_profile_id === x.poster_profile_id;
      const explicitlySameProfile = Boolean(x.creator_profile_id && x.poster_profile_id && sameProfile);
      if (x.creator_determination === "poster-presumed-creator") {
        if (!sameName || !sameProfile || !["not-reviewed", "reviewed-no-obvious-conflict"].includes(x.review_status)) throw new Error("Poster-presumed creator name, profile, or status is invalid.");
      } else if (x.creator_determination === "unresolved") {
        if (!sameName || !sameProfile || x.review_status !== "obvious-conflict-needs-research") throw new Error("Unresolved attribution cannot assign a creator and must remain research-required.");
      } else {
      if (x.poster_posted_at === undefined) throw new Error("Different creator requires the exact typed poster chronology.");
      const proof = x.evidence.some((item) => (item.kind === "explicit-credit" || item.kind === "earlier-exact-source") && item.reference_url && item.published_at !== undefined && item.published_at < x.poster_posted_at! && item.supports_source_digest === x.source_digest);
        if (sameName || explicitlySameProfile || x.review_status !== "creator-proven" || !proof) throw new Error("Different creator requires distinct identity and attributable earlier proof bound to the source digest.");
      }
    } else if (entry.kind === "alias") {
      digest(entry.identity_snapshot_digest, "Identity snapshot digest");
      required(entry.value.alias, "Alias", 160); required(entry.value.normalized_alias, "Normalized alias", 160);
      if (entry.value.normalized_alias !== entry.value.normalized_alias.trim().toLowerCase()) throw new Error("Normalized alias must be lowercase.");
    } else if (entry.kind === "avatar") {
      digest(entry.value.media_digest, "Avatar digest");
      if (entry.value.source_url) https(entry.value.source_url, "Avatar source URL");
      validateDeliveryShape(entry.value, "Avatar");
    } else if (entry.kind === "verification") {
      digest(entry.value.source_digest, "Verification source digest"); required(entry.value.rationale, "Verification rationale", 4_000);
      if (!Number.isInteger(entry.value.work_count_reviewed) || entry.value.work_count_reviewed < 0 || entry.value.work_count_reviewed > 100_000) throw new Error("Reviewed work count is invalid.");
      const contributions = entry.value.review_contributions;
      if (entry.projection.action === "reconcile-shared-profile-verification") {
        if (!contributions || contributions.length < 2 || contributions.length > MAX_EVIDENCE) throw new Error("Shared-profile verification reconciliation requires 2 to 32 review contributions.");
        const artistIds = contributions.map((item) => required(item.artist_id, "Review contribution artist ID"));
        if (new Set(artistIds).size !== artistIds.length || !equal(artistIds, [...artistIds].sort())) throw new Error("Review contributions must have unique artist IDs in deterministic order.");
        for (const item of contributions) {
          digest(item.source_digest, "Review contribution source digest");
          if (!Number.isInteger(item.work_count_reviewed) || item.work_count_reviewed < 0 || item.work_count_reviewed > 100_000) throw new Error("Review contribution work count is invalid.");
        }
        const statuses = contributions.map((item) => item.status);
        const expectedStatus = statuses.includes("verified") ? "verified" : statuses.includes("unclear") ? "unclear" : "not-verified";
        if (entry.value.status !== expectedStatus || entry.value.work_count_reviewed !== Math.max(...contributions.map((item) => item.work_count_reviewed))) throw new Error("Shared-profile verification aggregate must use status precedence and maximum reviewed work count.");
        const satisfied = entry.satisfied_item_operation_ids;
        if (!satisfied || satisfied.length !== contributions.length || new Set(satisfied).size !== satisfied.length || !equal(satisfied, [...satisfied].sort())) throw new Error("Shared-profile reconciliation must deterministically satisfy every contributing item operation ID.");
      } else if (contributions || entry.satisfied_item_operation_ids) throw new Error("Only shared-profile reconciliation may carry contribution satisfaction metadata.");
    } else {
      required(entry.value.entity_key, "Social entity key", 300); digest(entry.value.media_digest, "Social media digest"); digest(entry.value.source_digest, "Social source digest");
      if (entry.value.entity_kind === "replications" && !entry.value.replication_id) throw new Error("Replication social assets require replication_id.");
      if (entry.value.entity_kind !== "replications" && entry.value.replication_id) throw new Error("Only replication social assets may carry replication_id.");
      if (!Number.isInteger(entry.value.width) || !Number.isInteger(entry.value.height) || entry.value.width < 1 || entry.value.height < 1 || entry.value.width > 10_000 || entry.value.height > 10_000) throw new Error("Social dimensions are invalid.");
      if (!entry.value.mime_type.startsWith("image/")) throw new Error("Social assets require an image MIME type.");
      validateDeliveryShape(entry.value, "Social asset");
      if (entry.value.status === "ready" && entry.value.delivery_verification !== "verified") throw new Error("Ready social assets require verified delivery.");
    }
  }
}

export function isSkippedDecision(entry: IdentitySocialBatchEntry) {
  return (entry.kind === "attribution" && ["preserve-poster-as-creator", "preserve-poster-as-creator-no-write", "blocked-preserve-poster-no-verified-chronology"].includes(entry.projection.action)) ||
    (entry.kind === "alias" && ["preserve-existing-alias", "blocked-pending-owner-review", "blocked-merge-required-collision"].includes(entry.projection.action));
}

function validateProjectionMapping(entry: IdentitySocialBatchEntry) {
  const target = entry.projection.target as Record<string, unknown>;
  if (entry.kind === "attribution") {
    if (target.replicationId !== String(entry.value.replication_id)) throw new Error("Projection attribution target does not match the normalized value.");
    if (!["preserve-poster-as-creator", "preserve-poster-as-creator-no-write", "blocked-preserve-poster-no-verified-chronology", "set-proven-creator-with-verified-chronology"].includes(entry.projection.action)) throw new Error("Unsupported creator-attribution action.");
    if (entry.projection.action === "set-proven-creator-with-verified-chronology" && entry.value.creator_determination !== "proven-different-creator") throw new Error("Creator-change action does not match its normalized value.");
    if (["preserve-poster-as-creator", "preserve-poster-as-creator-no-write", "blocked-preserve-poster-no-verified-chronology"].includes(entry.projection.action) && entry.value.creator_determination === "proven-different-creator") throw new Error("Creator-preservation action cannot assign a different creator.");
  } else if (entry.kind === "verification") {
    if (!["record-reviewed-verification", "reconcile-shared-profile-verification"].includes(entry.projection.action)) throw new Error("Unsupported verification action.");
  } else if (entry.kind === "alias") {
    if (target.alias !== entry.value.alias) throw new Error("Projection alias target does not match the normalized value.");
    if (!["add-alias-preserve-source-history", "preserve-existing-alias", "blocked-pending-owner-review", "blocked-merge-required-collision"].includes(entry.projection.action)) throw new Error("Unsupported alias action.");
  } else if (entry.kind === "avatar") {
    if (!["propose-reviewed-avatar", "propose-provenance-improving-avatar-replacement"].includes(entry.projection.action)) throw new Error("Unsupported avatar action.");
  } else {
    if (entry.projection.action !== "upsert-generated-social-asset-metadata" || target.entityType !== entry.value.entity_kind || target.entityKey !== entry.value.entity_key) throw new Error("Projection social target/action does not match the normalized value.");
  }
}

export async function validateProjectionIdentity(entry: IdentitySocialBatchEntry) {
  const p = entry.projection;
  validateProjectionMapping(entry);
  if (await canonicalDigest(p.expectedBefore) !== p.expectedBeforeSha256) throw new Error("Projection expected-before digest does not match its canonical snapshot.");
  if (entry.kind === "verification" && p.action === "reconcile-shared-profile-verification") {
    const contributions = entry.value.review_contributions!;
    if (entry.value.source_digest !== await canonicalDigest({ schemaVersion: 1, contributions })) throw new Error("Shared-profile verification source digest is not derived from the ordered contributions.");
  }
  const core = { schemaVersion: ITEM_ID_VERSION, projection: p, target: targetOf(entry), value: entry.value, ...(entry.kind === "alias" ? { identity_snapshot_digest: entry.identity_snapshot_digest } : {}), ...(entry.satisfied_item_operation_ids ? { satisfied_item_operation_ids: entry.satisfied_item_operation_ids } : {}), base_projection_digest: entry.base_projection_digest, receipt_sidecar_digest: entry.receipt_sidecar_digest };
  const expectedId = `identity-social-item:v${ITEM_ID_VERSION}:${(await canonicalDigest(core)).slice(0, 24)}`;
  if (entry.item_operation_id !== expectedId) throw new Error("Item operation ID is not derived from canonical transformed content.");
}

export function equal(a: unknown, b: unknown) { return canonicalJson(a) === canonicalJson(b); }
