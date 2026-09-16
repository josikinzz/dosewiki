import { type Infer, v } from "../lib/postgres/runtime/values";
import type { MutationCtx, QueryCtx } from "../lib/postgres/runtime/server";
import type { Id } from "../lib/postgres/runtime/dataModel";
import { internalQuery, query } from "../lib/postgres/runtime/server";
import { mutation } from "./lib/indexedMutation";
import { requireRegisteredDelegatedEditorWrite } from "./lib/auth";
import { isValidR2Key, replicationMediaBaseUrl } from "./lib/replicationUrls";
import { normalizeProfileAliases } from "../lib/contributorProfileIdentity";
import { materializeProfile } from "./lib/contributorProfiles";
import {
  contributorAliasEvidenceValidator, contributorAvatarHistoryValidator,
  contributorReplicatorVerificationValidator, identitySocialBatchEntryValidator,
  identitySocialOperationKindValidator, replicationIdentityAttributionValidator,
  replicationIdentitySocialOperationItemValidator, replicationIdentitySocialOperationValidator,
  replicationSocialAssetValidator, creatorExpectedBeforeValidator, verificationExpectedBeforeValidator,
  avatarExpectedBeforeValidator, aliasExpectedBeforeValidator, type IdentitySocialBatchEntry,
  type IdentitySocialStoredValue, type IdentitySocialTarget,
  profileBindingEntryValidator, type ProfileBindingEntry,
} from "./lib/replicationIdentitySocialValidators";

const SHA256 = /^[a-f0-9]{64}$/;
const MAX_BATCH = 50;
const MAX_EVIDENCE = 32;
const MAX_PAYLOAD_BYTES = 512_000;
const ITEM_ID_VERSION = 1;
const PINNED_IDENTITY_PROFILE_COUNT = 2_119;
const PINNED_IDENTITY_SNAPSHOT_DIGEST = "aea1bbeac1ce5a10e7e3a0981af17b40909c13ecf04fcf49299bbb32f66c2d8d";
const encoder = new TextEncoder();
type Ctx = MutationCtx | QueryCtx;
type StoredRecord = IdentitySocialStoredValue & { _id: string; _creationTime: number };
type StoredVerificationValue = Infer<typeof contributorReplicatorVerificationValidator>;
type ProfileProjectionState =
  | { kind: "alias-profile"; profile_id: Id<"contributorProfiles">; aliases: string[] }
  | { kind: "avatar-profile"; profile_id: Id<"contributorProfiles">; avatarUrl: string | null; avatarR2Key: string | null; avatarStorageId: string | null; avatarSha256: string | null; avatarProvenance: string | null };

const storedAttribution = v.object({ _id: v.id("replicationIdentityAttributions"), _creationTime: v.number(), ...replicationIdentityAttributionValidator.fields });
const storedAlias = v.object({ _id: v.id("contributorAliasEvidence"), _creationTime: v.number(), ...contributorAliasEvidenceValidator.fields });
const storedAvatar = v.object({ _id: v.id("contributorAvatarHistory"), _creationTime: v.number(), ...contributorAvatarHistoryValidator.fields });
const storedVerification = v.object({ _id: v.id("contributorReplicatorVerifications"), _creationTime: v.number(), ...contributorReplicatorVerificationValidator.fields });
const storedSocial = v.object({ _id: v.id("replicationSocialAssets"), _creationTime: v.number(), ...replicationSocialAssetValidator.fields });
const storedOperation = v.object({ _id: v.id("replicationIdentitySocialOperations"), _creationTime: v.number(), ...replicationIdentitySocialOperationValidator.fields });
const storedOperationItem = v.object({ _id: v.id("replicationIdentitySocialOperationItems"), _creationTime: v.number(), ...replicationIdentitySocialOperationItemValidator.fields });
const resultValidator = v.object({ operation_id: v.string(), payload_digest: v.string(), changed: v.number(), unchanged: v.number(), idempotent_replay: v.boolean(), dry_run: v.boolean() });
const snapshotTokenInputValidator = v.object({
  normalized_token: v.string(),
  owner_profile_ids: v.array(v.id("contributorProfiles")),
});
const snapshotMaterializationResultValidator = v.object({
  operation_id: v.string(), snapshot_digest: v.string(), profile_count: v.number(),
  profile_ids_digest: v.string(), token_count: v.number(), changed: v.number(),
  idempotent_noop: v.boolean(), rolled_back: v.boolean(), dry_run: v.boolean(),
});
const PROFILE_BINDING_BATCH_MAX = 25;

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
function required(value: string, label: string, max = 200) {
  const clean = value.trim();
  if (!clean) throw new Error(`${label} is required.`);
  if (encoder.encode(clean).length > max) throw new Error(`${label} exceeds ${max} bytes.`);
  return clean;
}
function digest(value: string, label: string) { if (!SHA256.test(value)) throw new Error(`${label} must be a lowercase SHA-256 digest.`); }
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

function targetOf(entry: IdentitySocialBatchEntry): IdentitySocialTarget {
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

function isSkippedDecision(entry: IdentitySocialBatchEntry) {
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

async function validateProjectionIdentity(entry: IdentitySocialBatchEntry) {
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

function strip(record: StoredRecord | null): IdentitySocialStoredValue | null {
  if (!record) return null;
  const { _id: _id, _creationTime: _creationTime, ...value } = record;
  return value;
}
function equal(a: unknown, b: unknown) { return canonicalJson(a) === canonicalJson(b); }

async function existingByTarget(ctx: Ctx, target: IdentitySocialTarget): Promise<StoredRecord | null> {
  if (target.kind === "attribution") return await ctx.db.query("replicationIdentityAttributions").withIndex("by_replication_id", (q) => q.eq("replication_id", target.replication_id)).unique() as StoredRecord | null;
  if (target.kind === "alias") return await ctx.db.query("contributorAliasEvidence").withIndex("by_profile_id_and_normalized_alias", (q) => q.eq("profile_id", target.profile_id).eq("normalized_alias", target.normalized_alias)).unique() as StoredRecord | null;
  if (target.kind === "avatar") return await ctx.db.query("contributorAvatarHistory").withIndex("by_profile_id_and_media_digest", (q) => q.eq("profile_id", target.profile_id).eq("media_digest", target.media_digest)).unique() as StoredRecord | null;
  if (target.kind === "verification") return await ctx.db.query("contributorReplicatorVerifications").withIndex("by_profile_id", (q) => q.eq("profile_id", target.profile_id)).unique() as StoredRecord | null;
  if (target.kind === "profile-binding") return await ctx.db.query("replicationIdentityProfileBindings").withIndex("by_artist_id", (q) => q.eq("artist_id", target.artist_id)).unique() as StoredRecord | null;
  return await ctx.db.query("replicationSocialAssets").withIndex("by_entity_kind_and_entity_key_and_variant", (q) => q.eq("entity_kind", target.entity_kind).eq("entity_key", target.entity_key).eq("variant", target.variant)).unique() as StoredRecord | null;
}

async function currentCreatorBefore(ctx: Ctx, entry: Extract<IdentitySocialBatchEntry, { kind: "attribution" }>) {
  const row = await ctx.db.get(entry.value.replication_id);
  if (!row) throw new Error("Replication does not exist.");
  const attr = await ctx.db.query("replicationSourceAttribution").withIndex("by_replication_id", (q) => q.eq("replication_id", entry.value.replication_id)).unique();
  const first = attr?.source_references[0];
  const sourceHistory = {
    posterDisplayName: attr?.poster.display_name ?? row.artist,
    posterProfileUrl: attr?.poster.profile_url ?? null,
    sourcePostUrl: first?.post_url ?? row.source_url ?? null,
    sourceUrl: first?.source_url ?? row.source_url ?? null,
    sourceReferences: attr?.source_references ?? [],
    sourceEraArtistDisplayName: attr?.poster.display_name ?? row.artist,
  };
  return { replicationId: String(row._id), currentArtist: row.artist, attributionDisposition: attr?.disposition ?? null, creditLine: row.credit_line ?? null, sourceHistory };
}

function verificationStatus(row: StoredRecord | null) {
  if (!row || !("status" in row)) return "unverified";
  return row.status === "verified" ? "verified-replicator" : row.status;
}

async function currentProfileBefore(ctx: Ctx, profileId: Id<"contributorProfiles">, mode: "verification" | "avatar") {
  const profile = await ctx.db.get(profileId);
  if (!profile) throw new Error("Contributor profile does not exist.");
  if (mode === "verification") {
    const verification = await ctx.db.query("contributorReplicatorVerifications").withIndex("by_profile_id", (q) => q.eq("profile_id", profile._id)).unique() as StoredRecord | null;
    return { profileKey: profile.key, displayName: profile.displayName, verificationStatus: verificationStatus(verification), aliases: profile.aliases ?? [], profileLinks: profile.links ?? [] };
  }
  let avatarUrl = profile.avatarUrl ?? null;
  if (!avatarUrl && profile.avatarR2Key && replicationMediaBaseUrl() && isValidR2Key(profile.avatarR2Key)) avatarUrl = `${replicationMediaBaseUrl()}/${profile.avatarR2Key}`;
  if (!avatarUrl && profile.avatarStorageId) avatarUrl = await ctx.storage.getUrl(profile.avatarStorageId);
  return { currentAvatarSha256: profile.avatarSha256 ?? null, currentAvatarUrl: avatarUrl, currentAvatarProvenance: profile.avatarProvenance ?? "none" };
}

async function currentAliasBefore(ctx: Ctx, entry: Extract<IdentitySocialBatchEntry, { kind: "alias" }>) {
  const profile = await ctx.db.get(entry.value.profile_id);
  if (!profile) throw new Error("Contributor profile does not exist.");
  if (entry.projection.action === "blocked-pending-owner-review" || entry.projection.action === "blocked-merge-required-collision") return entry.projection.expectedBefore;
  const alias = entry.value.normalized_alias;
  const token = await ctx.db.query("contributorIdentityTokenSnapshots")
    .withIndex("by_snapshot_digest_and_normalized_token", (q) => q.eq("snapshot_digest", entry.identity_snapshot_digest).eq("normalized_token", alias)).unique();
  if (!token) throw new Error("Pinned complete identity snapshot token is missing.");
  if (token.profile_count < 1 || token.profile_count > 100_000 || token.owner_count !== token.owner_profile_ids.length) throw new Error("Pinned identity snapshot token is invalid.");
  if (entry.projection.action === "add-alias-preserve-source-history" && token.owner_profile_ids.some((id) => id !== entry.value.profile_id)) {
    throw new Error("Alias-only write refused: normalized identity belongs to a separate profile requiring merge review.");
  }
  const owners = token.owner_count;
  const linked = (profile.links ?? []).some((link) => link.url.toLowerCase().includes(alias));
  const currentState = owners > 0 ? `alias already present as ${alias}` : linked ? `canonical profile links to @${entry.value.alias} but alias absent` : "canonical profile exists; alias absent";
  return { currentState, normalizedAliasOwners: owners, collisionAuditProfileSnapshotCount: token.profile_count };
}

export async function canonicalBeforeForEntry(ctx: Ctx, entry: IdentitySocialBatchEntry) {
  if (entry.kind === "attribution") return await currentCreatorBefore(ctx, entry);
  if (entry.kind === "verification") return await currentProfileBefore(ctx, entry.value.profile_id, "verification");
  if (entry.kind === "avatar") return await currentProfileBefore(ctx, entry.value.profile_id, "avatar");
  if (entry.kind === "alias") return await currentAliasBefore(ctx, entry);
  return null;
}

function authoritativeBeforeMatches(entry: IdentitySocialBatchEntry, before: unknown) {
  if (equal(before, entry.projection.expectedBefore)) return true;
  if (!before || typeof before !== "object") return false;
  const current = before as Record<string, unknown>;
  const expected = entry.projection.expectedBefore as Record<string, unknown>;
  if (entry.kind === "avatar") {
    return current.currentAvatarUrl === expected.currentAvatarUrl
      && current.currentAvatarSha256 === null
      && current.currentAvatarProvenance === "none"
      && typeof expected.currentAvatarSha256 === "string"
      && typeof expected.currentAvatarProvenance === "string"
      && expected.currentAvatarProvenance !== "none";
  }
  if (entry.kind === "verification") {
    const normalizeAliases = (value: unknown) => Array.isArray(value)
      ? [...new Set(value.map((item) => String(item).trim().toLowerCase()).filter(Boolean))].sort()
      : [];
    const verificationIdentity = (value: Record<string, unknown>) => ({
      profileKey: value.profileKey,
      displayName: value.displayName,
      verificationStatus: value.verificationStatus,
      aliases: normalizeAliases(value.aliases),
    });
    return equal(verificationIdentity(current), verificationIdentity(expected));
  }
  if (entry.kind !== "attribution") return false;
  if (current.attributionDisposition !== null || !["existing-reviewed-credit", "poster-as-artist-default"].includes(String(expected.attributionDisposition))) return false;
  return equal({ ...current, attributionDisposition: expected.attributionDisposition }, expected);
}

async function verifyAuthoritativeBefore(ctx: Ctx, entry: IdentitySocialBatchEntry) {
  const before = await canonicalBeforeForEntry(ctx, entry);
  // Poster-preserving and blocked decisions are journals only: they deliberately
  // make no domain-row change. Requiring an exact historical source-shape CAS
  // would suppress the reviewed no-write when legacy URL fields normalize, while
  // adding no safety. The read above still proves that the target exists.
  if (isSkippedDecision(entry)) return;
  if (!authoritativeBeforeMatches(entry, before)) throw new Error("Authoritative expected-before CAS failed.");
  if (entry.kind === "attribution") for (const id of [entry.value.poster_profile_id, entry.value.creator_profile_id]) if (id && !(await ctx.db.get(id))) throw new Error("Contributor profile does not exist.");
}

async function validateReceipt(ctx: Ctx, entry: IdentitySocialBatchEntry) {
  if (entry.kind !== "avatar" && entry.kind !== "social-asset") return;
  const x = entry.value;
  const possible: string[] = [];
  if (x.storage_id) { const url = await ctx.storage.getUrl(x.storage_id); if (!url) throw new Error("Storage delivery reference does not resolve."); possible.push(url); }
  const base = replicationMediaBaseUrl();
  if (x.r2_key) { if (!base) throw new Error("R2 delivery requires configured media base URL."); possible.push(`${base}/${x.r2_key}`); }
  if (x.public_url) possible.push(x.public_url);
  if (x.delivery_verification !== "verified") return;
  const receipt = x.delivery_receipt;
  const trustedExecutor = process.env.IDENTITY_SOCIAL_TRUSTED_DELIVERY_EXECUTOR;
  if (!trustedExecutor || !receipt || receipt.verifier !== trustedExecutor || x.delivery_verified_at !== receipt.verified_at || !possible.includes(receipt.url) || receipt.content_sha256 !== x.media_digest || ![200, 206].includes(receipt.http_status) || !Number.isInteger(receipt.byte_size) || receipt.byte_size < 1) throw new Error("Verified delivery receipt does not match the trusted executor or published asset.");
  const { receipt_digest, ...core } = receipt;
  if (await canonicalDigest(core) !== receipt_digest) throw new Error("Verified delivery receipt digest is invalid.");
}

function desired(entry: IdentitySocialBatchEntry, now: number): IdentitySocialStoredValue {
  if (entry.kind === "attribution") return { ...entry.value, operation_id: entry.item_operation_id, updated_at: now };
  if (entry.kind === "alias") return { ...entry.value, operation_id: entry.item_operation_id, recorded_at: now };
  if (entry.kind === "avatar") return { ...entry.value, operation_id: entry.item_operation_id, recorded_at: now };
  if (entry.kind === "verification") return { ...entry.value, operation_id: entry.item_operation_id, reviewed_at: now };
  return { ...entry.value, operation_id: entry.item_operation_id, generated_at: now };
}
function material(value: IdentitySocialStoredValue | null) {
  if (!value) return null;
  const copy = { ...value } as Record<string, unknown>;
  for (const key of ["operation_id", "updated_at", "recorded_at", "reviewed_at", "generated_at"]) delete copy[key];
  return copy;
}
async function write(ctx: MutationCtx, target: IdentitySocialTarget, existing: StoredRecord | null, value: IdentitySocialStoredValue | null) {
  if (!value) { if (existing) await ctx.db.delete(existing._id as never); return; }
  if (existing) { await ctx.db.replace(existing._id as never, value as never); return; }
  if (target.kind === "attribution") await ctx.db.insert("replicationIdentityAttributions", value as never);
  else if (target.kind === "alias") await ctx.db.insert("contributorAliasEvidence", value as never);
  else if (target.kind === "avatar") await ctx.db.insert("contributorAvatarHistory", value as never);
  else if (target.kind === "verification") await ctx.db.insert("contributorReplicatorVerifications", value as never);
  else await ctx.db.insert("replicationSocialAssets", value as never);
}

async function profileProjectionBefore(ctx: Ctx, entry: IdentitySocialBatchEntry): Promise<ProfileProjectionState | undefined> {
  if (entry.kind !== "alias" && entry.kind !== "avatar") return undefined;
  const profile = await ctx.db.get(entry.value.profile_id);
  if (!profile) throw new Error("Contributor profile does not exist.");
  if (entry.kind === "alias") return { kind: "alias-profile", profile_id: profile._id, aliases: [...(profile.aliases ?? [])] };
  return {
    kind: "avatar-profile", profile_id: profile._id,
    avatarUrl: profile.avatarUrl ?? null, avatarR2Key: profile.avatarR2Key ?? null,
    avatarStorageId: profile.avatarStorageId ?? null, avatarSha256: profile.avatarSha256 ?? null,
    avatarProvenance: profile.avatarProvenance ?? null,
  };
}

function profileProjectionAfter(entry: IdentitySocialBatchEntry, before: ProfileProjectionState | undefined): ProfileProjectionState | undefined {
  if (entry.kind === "alias" && before?.kind === "alias-profile") {
    return { ...before, aliases: normalizeProfileAliases([...before.aliases, entry.value.alias]) };
  }
  if (entry.kind === "avatar" && before?.kind === "avatar-profile") {
    return {
      kind: "avatar-profile", profile_id: before.profile_id,
      avatarUrl: entry.value.public_url ?? null,
      avatarR2Key: entry.value.r2_key ?? null,
      avatarStorageId: entry.value.storage_id ?? null,
      avatarSha256: entry.value.media_digest,
      avatarProvenance: entry.value.provenance,
    };
  }
  return undefined;
}

async function writeProfileProjection(ctx: MutationCtx, state: ProfileProjectionState) {
  if (state.kind === "alias-profile") {
    await ctx.db.patch(state.profile_id, { aliases: state.aliases });
    return;
  }
  await ctx.db.patch(state.profile_id, {
    avatarUrl: state.avatarUrl ?? undefined,
    avatarR2Key: state.avatarR2Key ?? undefined,
    avatarStorageId: state.avatarStorageId ?? undefined,
    avatarSha256: state.avatarSha256 ?? undefined,
    avatarProvenance: state.avatarProvenance ?? undefined,
  });
}

async function profileProjectionForTarget(ctx: Ctx, target: IdentitySocialTarget) {
  if (target.kind === "alias") {
    return await profileProjectionBefore(ctx, { kind: "alias", value: { profile_id: target.profile_id } } as IdentitySocialBatchEntry);
  }
  if (target.kind === "avatar") {
    return await profileProjectionBefore(ctx, { kind: "avatar", value: { profile_id: target.profile_id } } as IdentitySocialBatchEntry);
  }
  return undefined;
}

async function operationItems(ctx: Ctx, operationId: string, expected: number) {
  const rows = await ctx.db.query("replicationIdentitySocialOperationItems").withIndex("by_batch_operation_id", (q) => q.eq("batch_operation_id", operationId)).take(MAX_BATCH + 1);
  if (rows.length !== expected || rows.length > MAX_BATCH) throw new Error("Operation item journal is incomplete or oversized.");
  return rows;
}
async function verifyReplay(ctx: Ctx, operation: { operation_id: string; record_count: number }) {
  const items = await operationItems(ctx, operation.operation_id, operation.record_count);
  for (const item of items) {
    if (!equal(strip(await existingByTarget(ctx, item.target)), item.after)) throw new Error("Idempotent replay target state has drifted.");
    if (item.profile_after) {
      const current = await profileProjectionForTarget(ctx, item.target);
      if (!equal(current, item.profile_after)) throw new Error("Idempotent replay public profile state has drifted.");
    }
  }
}

export async function applyIdentitySocialBatchHandler(ctx: MutationCtx, args: { apiKey: string; actor_email: string; operation_id: string; kind: IdentitySocialBatchEntry["kind"]; dry_run: boolean; entries: IdentitySocialBatchEntry[] }) {
  const actor = await requireRegisteredDelegatedEditorWrite(ctx, { apiKey: args.apiKey, actorEmail: args.actor_email, adminIntent: "replicationMaintenance" });
  const operationId = required(args.operation_id, "Batch operation ID");
  validateIdentitySocialBatch(args.kind, args.entries, operationId);
  for (const entry of args.entries) await validateProjectionIdentity(entry);
  const payloadDigest = await canonicalDigest({ operation_id: operationId, kind: args.kind, entries: args.entries });
  const prior = await ctx.db.query("replicationIdentitySocialOperations").withIndex("by_operation_id", (q) => q.eq("operation_id", operationId)).unique();
  if (prior) {
    if (prior.payload_digest !== payloadDigest || prior.kind !== args.kind || prior.rollback_of) throw new Error("Batch operation ID collision.");
    await verifyReplay(ctx, prior);
    return { operation_id: operationId, payload_digest: payloadDigest, changed: prior.changed_count, unchanged: prior.unchanged_count, idempotent_replay: true, dry_run: false };
  }
  const now = Date.now();
  const items = [];
  for (const entry of args.entries) {
    const used = await ctx.db.query("replicationIdentitySocialOperationItems").withIndex("by_item_operation_id", (q) => q.eq("item_operation_id", entry.item_operation_id)).unique();
    if (used) throw new Error("Item operation ID collision.");
    await verifyAuthoritativeBefore(ctx, entry); await validateReceipt(ctx, entry);
    const target = targetOf(entry); const existing = await existingByTarget(ctx, target);
    if ((existing?.operation_id ?? null) !== entry.expected_operation_id) throw new Error("Projection row CAS precondition failed.");
    const before = strip(existing); const proposed = desired(entry, now);
    const skipped = isSkippedDecision(entry);
    const recordChanged = !skipped && !equal(material(before), material(proposed));
    const profileBefore = await profileProjectionBefore(ctx, entry);
    const profileAfter = skipped ? profileBefore : profileProjectionAfter(entry, profileBefore);
    const profileChanged = !equal(profileBefore, profileAfter);
    const changed = recordChanged || profileChanged;
    items.push({ entry, target, existing, before, after: recordChanged ? proposed : before, recordChanged, profileBefore, profileAfter, profileChanged, changed });
  }
  const changed = items.filter((item) => item.changed).length;
  if (!args.dry_run) {
    for (const item of items) {
      if (item.recordChanged) await write(ctx, item.target, item.existing, item.after);
      if (item.profileChanged && item.profileAfter) await writeProfileProjection(ctx, item.profileAfter);
    }
    for (const item of items) await ctx.db.insert("replicationIdentitySocialOperationItems", { item_operation_id: item.entry.item_operation_id, batch_operation_id: operationId, kind: args.kind, target: item.target, before: item.before, after: item.after, changed: item.changed, profile_before: item.profileBefore, profile_after: item.profileAfter, ...(item.entry.satisfied_item_operation_ids ? { satisfied_item_operation_ids: item.entry.satisfied_item_operation_ids } : {}), created_at: now });
    await ctx.db.insert("replicationIdentitySocialOperations", { operation_id: operationId, kind: args.kind, payload_digest: payloadDigest, actor_email: actor.email, record_count: items.length, changed_count: changed, unchanged_count: items.length - changed, created_at: now });
  }
  return { operation_id: operationId, payload_digest: payloadDigest, changed, unchanged: items.length - changed, idempotent_replay: false, dry_run: args.dry_run };
}

function restored(before: IdentitySocialStoredValue | null, itemId: string, now: number) {
  if (!before) return null;
  if ("updated_at" in before) return { ...before, operation_id: itemId, updated_at: now };
  if ("reviewed_at" in before) return { ...before, operation_id: itemId, reviewed_at: now };
  if ("generated_at" in before) return { ...before, operation_id: itemId, generated_at: now };
  return { ...before, operation_id: itemId, recorded_at: now };
}
export async function rollbackIdentitySocialOperationHandler(ctx: MutationCtx, args: { apiKey: string; actor_email: string; operation_id: string; rollback_of: string; dry_run: boolean }) {
  const actor = await requireRegisteredDelegatedEditorWrite(ctx, { apiKey: args.apiKey, actorEmail: args.actor_email, adminIntent: "replicationMaintenance" });
  const operationId = required(args.operation_id, "Rollback operation ID"); const rollbackOf = required(args.rollback_of, "Rollback target");
  if (operationId === rollbackOf) throw new Error("Rollback ID must differ from its target.");
  const payloadDigest = await canonicalDigest({ operation_id: operationId, rollback_of: rollbackOf });
  const replay = await ctx.db.query("replicationIdentitySocialOperations").withIndex("by_operation_id", (q) => q.eq("operation_id", operationId)).unique();
  if (replay) { if (replay.payload_digest !== payloadDigest || replay.rollback_of !== rollbackOf) throw new Error("Rollback operation ID collision."); await verifyReplay(ctx, replay); return { operation_id: operationId, payload_digest: payloadDigest, changed: replay.changed_count, unchanged: replay.unchanged_count, idempotent_replay: true, dry_run: false }; }
  const original = await ctx.db.query("replicationIdentitySocialOperations").withIndex("by_operation_id", (q) => q.eq("operation_id", rollbackOf)).unique();
  if (!original) throw new Error("Rollback target not found.");
  const originals = await operationItems(ctx, rollbackOf, original.record_count); const now = Date.now(); const items = [];
  for (const source of originals) {
    const existing = await existingByTarget(ctx, source.target);
    if (!equal(strip(existing), source.after)) throw new Error("Rollback target state drifted or was recreated.");
    if (source.profile_after) {
      const currentProfile = await profileProjectionForTarget(ctx, source.target);
      if (!equal(currentProfile, source.profile_after)) throw new Error("Rollback public profile state drifted.");
    }
    const itemId = `identity-social:rollback:${(await canonicalDigest({ operationId, sourceItemId: source.item_operation_id, target: source.target, before: source.before })).slice(0, 24)}`;
    if (await ctx.db.query("replicationIdentitySocialOperationItems").withIndex("by_item_operation_id", (q) => q.eq("item_operation_id", itemId)).unique()) throw new Error("Rollback item operation ID collision.");
    const recordChanged = !equal(source.before, source.after);
    const profileChanged = !equal(source.profile_before, source.profile_after);
    const after = recordChanged ? restored(source.before, itemId, now) : source.after;
    items.push({ source, existing, itemId, after, recordChanged, profileChanged, changed: recordChanged || profileChanged });
  }
  const changed = items.filter((item) => item.changed).length;
  if (!args.dry_run) {
    for (const item of items) {
      if (item.recordChanged) await write(ctx, item.source.target, item.existing, item.after);
      if (item.profileChanged && item.source.profile_before) await writeProfileProjection(ctx, item.source.profile_before);
    }
    for (const item of items) await ctx.db.insert("replicationIdentitySocialOperationItems", { item_operation_id: item.itemId, batch_operation_id: operationId, kind: original.kind, target: item.source.target, before: item.source.after, after: item.after, changed: item.changed, profile_before: item.source.profile_after, profile_after: item.source.profile_before, created_at: now });
    await ctx.db.insert("replicationIdentitySocialOperations", { operation_id: operationId, kind: original.kind, payload_digest: payloadDigest, actor_email: actor.email, record_count: items.length, changed_count: changed, unchanged_count: items.length - changed, rollback_of: rollbackOf, created_at: now });
  }
  return { operation_id: operationId, payload_digest: payloadDigest, changed, unchanged: items.length - changed, idempotent_replay: false, dry_run: args.dry_run };
}

export async function materializeIdentityTokenSnapshotHandler(ctx: MutationCtx, args: {
  apiKey: string; actor_email: string; operation_id: string; mode: "seed" | "rollback"; dry_run: boolean;
  snapshot_digest: string; profile_ids_digest: string; profile_ids: Id<"contributorProfiles">[];
  tokens: Array<{ normalized_token: string; owner_profile_ids: Id<"contributorProfiles">[] }>;
}) {
  await requireRegisteredDelegatedEditorWrite(ctx, { apiKey: args.apiKey, actorEmail: args.actor_email, adminIntent: "replicationMaintenance" });
  const operationId = required(args.operation_id, "Snapshot materialization operation ID");
  if (args.snapshot_digest !== PINNED_IDENTITY_SNAPSHOT_DIGEST) throw new Error("Only the reviewed 2,119-profile identity snapshot may be materialized.");
  digest(args.profile_ids_digest, "Profile ID digest");
  if (args.profile_ids.length !== PINNED_IDENTITY_PROFILE_COUNT || new Set(args.profile_ids).size !== PINNED_IDENTITY_PROFILE_COUNT) throw new Error("Identity snapshot must contain exactly 2,119 unique profile IDs.");
  const sortedProfileIds = [...args.profile_ids].map(String).sort();
  if (await canonicalDigest(sortedProfileIds) !== args.profile_ids_digest) throw new Error("Profile ID digest does not match the submitted snapshot IDs.");
  const profileSet = new Set(args.profile_ids.map(String));
  for (const profileId of args.profile_ids) if (!(await ctx.db.get(profileId))) throw new Error(`Snapshot profile ID does not exist: ${profileId}.`);
  const tokenNames = new Set<string>();
  for (const token of args.tokens) {
    const normalized = token.normalized_token.trim().toLowerCase();
    if (!normalized || normalized !== token.normalized_token || tokenNames.has(normalized)) throw new Error("Snapshot tokens must be unique, non-empty, and normalized.");
    tokenNames.add(normalized);
    if (new Set(token.owner_profile_ids).size !== token.owner_profile_ids.length || token.owner_profile_ids.some((id) => !profileSet.has(String(id)))) throw new Error("Snapshot token owner IDs must be unique members of the exact profile snapshot.");
  }
  const existing = await ctx.db.query("contributorIdentityTokenSnapshots")
    .withIndex("by_snapshot_digest_and_normalized_token", (q) => q.eq("snapshot_digest", args.snapshot_digest))
    .take(8_001);
  if (existing.length > 8_000) throw new Error("Identity snapshot token materialization is unexpectedly oversized.");
  const owned = existing.filter((row) => row.materialization_operation_id === operationId);
  const marker = await ctx.db.query("contributorIdentitySnapshotMaterializations").withIndex("by_snapshot_digest", (q) => q.eq("snapshot_digest", args.snapshot_digest)).unique();
  if (args.mode === "rollback") {
    if (existing.some((row) => row.materialization_operation_id && row.materialization_operation_id !== operationId)) throw new Error("Rollback refused because the snapshot contains rows from another materialization operation.");
    if (marker && (marker.operation_id !== operationId || marker.profile_ids_digest !== args.profile_ids_digest || marker.token_count !== args.tokens.length)) throw new Error("Snapshot materialization rollback marker does not match the exact operation payload.");
    if (!args.dry_run) { for (const row of owned) await ctx.db.delete(row._id); if (marker) await ctx.db.delete(marker._id); }
    const changed = owned.length + (marker ? 1 : 0);
    return { operation_id: operationId, snapshot_digest: args.snapshot_digest, profile_count: PINNED_IDENTITY_PROFILE_COUNT, profile_ids_digest: args.profile_ids_digest, token_count: args.tokens.length, changed, idempotent_noop: changed === 0, rolled_back: true, dry_run: args.dry_run };
  }
  const expected = new Map(args.tokens.map((token) => [token.normalized_token, [...token.owner_profile_ids].map(String).sort()]));
  if (existing.length) {
    const exact = existing.length === expected.size && marker?.operation_id === operationId && marker.profile_ids_digest === args.profile_ids_digest && marker.token_count === args.tokens.length && existing.every((row) => row.profile_count === PINNED_IDENTITY_PROFILE_COUNT && row.owner_count === row.owner_profile_ids.length && row.materialization_operation_id === operationId && equal([...row.owner_profile_ids].map(String).sort(), expected.get(row.normalized_token)));
    if (!exact) throw new Error("Identity snapshot already exists with different materialization content or ownership.");
    return { operation_id: operationId, snapshot_digest: args.snapshot_digest, profile_count: PINNED_IDENTITY_PROFILE_COUNT, profile_ids_digest: args.profile_ids_digest, token_count: args.tokens.length, changed: 0, idempotent_noop: true, rolled_back: false, dry_run: args.dry_run };
  }
  if (!args.dry_run) {
    const now = Date.now();
    for (const token of args.tokens) await ctx.db.insert("contributorIdentityTokenSnapshots", { snapshot_digest: args.snapshot_digest, profile_count: PINNED_IDENTITY_PROFILE_COUNT, normalized_token: token.normalized_token, owner_count: token.owner_profile_ids.length, owner_profile_ids: token.owner_profile_ids, materialization_operation_id: operationId, created_at: now });
    await ctx.db.insert("contributorIdentitySnapshotMaterializations", { snapshot_digest: args.snapshot_digest, profile_count: PINNED_IDENTITY_PROFILE_COUNT, profile_ids_digest: args.profile_ids_digest, token_count: args.tokens.length, operation_id: operationId, created_at: now });
  }
  return { operation_id: operationId, snapshot_digest: args.snapshot_digest, profile_count: PINNED_IDENTITY_PROFILE_COUNT, profile_ids_digest: args.profile_ids_digest, token_count: args.tokens.length, changed: args.tokens.length, idempotent_noop: false, rolled_back: false, dry_run: args.dry_run };
}

function profileMaterial(profile: Record<string, unknown>) {
  const { _id: _id, _creationTime: _creationTime, ...rest } = profile;
  return rest;
}

export async function assertCreatedProfileHasNoRollbackReferences(ctx: Ctx, profileId: Id<"contributorProfiles">, profileKey: string) {
  const [aliases, avatars, posterRefs, creatorRefs, socialRefs] = await Promise.all([
    ctx.db.query("contributorAliasEvidence").withIndex("by_profile_id", (q) => q.eq("profile_id", profileId)).take(1),
    ctx.db.query("contributorAvatarHistory").withIndex("by_profile_id", (q) => q.eq("profile_id", profileId)).take(1),
    ctx.db.query("replicationIdentityAttributions").withIndex("by_poster_profile_id", (q) => q.eq("poster_profile_id", profileId)).take(1),
    ctx.db.query("replicationIdentityAttributions").withIndex("by_creator_profile_id", (q) => q.eq("creator_profile_id", profileId)).take(1),
    ctx.db.query("replicationSocialAssets").withIndex("by_entity_kind_and_entity_key", (q) => q.eq("entity_kind", "contributors").eq("entity_key", profileKey)).take(1),
  ]);
  if (aliases.length || avatars.length || posterRefs.length || creatorRefs.length || socialRefs.length) throw new Error("Operation-created profile has unrelated references and cannot be deleted.");
}

async function assertPinnedProfileBindingSnapshot(ctx: Ctx, entry: ProfileBindingEntry) {
  if (await canonicalDigest(entry.projection.expectedBefore) !== entry.projection.expectedBeforeSha256) throw new Error("Profile-binding expected-before digest is invalid.");
  if (entry.snapshot_digest !== PINNED_IDENTITY_SNAPSHOT_DIGEST || entry.snapshot_profile_count !== PINNED_IDENTITY_PROFILE_COUNT) throw new Error("Profile binding is not pinned to the reviewed 2,119-profile snapshot.");
  if (entry.decision === "unresolved") {
    if (entry.profile_key || entry.existing_profile_id || entry.profile || entry.verification) throw new Error("Unresolved profile bindings cannot create, bind, or verify a profile.");
    return;
  }
  const materialization = await ctx.db.query("contributorIdentitySnapshotMaterializations").withIndex("by_snapshot_digest", (q) => q.eq("snapshot_digest", entry.snapshot_digest)).unique();
  if (!materialization || materialization.profile_count !== PINNED_IDENTITY_PROFILE_COUNT || materialization.token_count < PINNED_IDENTITY_PROFILE_COUNT || !SHA256.test(materialization.profile_ids_digest)) throw new Error("Complete pinned identity-token snapshot materialization is required before profile binding.");
  if (!entry.profile_key || !entry.verification) throw new Error("Resolved profile binding requires an exact profile key and verification payload.");
  const key = entry.profile_key.trim().toUpperCase();
  if (!key || key !== entry.profile_key) throw new Error("Profile binding key must be canonical uppercase.");
  const token = await ctx.db.query("contributorIdentityTokenSnapshots")
    .withIndex("by_snapshot_digest_and_normalized_token", (q) => q.eq("snapshot_digest", entry.snapshot_digest).eq("normalized_token", key.toLowerCase())).unique();
  if (token && (token.profile_count !== PINNED_IDENTITY_PROFILE_COUNT || token.owner_count !== token.owner_profile_ids.length)) throw new Error("Exact identity-token snapshot row is invalid for profile binding.");
  const live = await ctx.db.query("contributorProfiles").withIndex("by_key", (q) => q.eq("key", key)).unique();
  if (entry.decision === "create") {
    if (!entry.profile || entry.existing_profile_id || (token?.owner_count ?? 0) !== 0 || live || entry.projection.expectedBefore.existingProfile !== null || entry.projection.expectedBefore.profileKey !== key) throw new Error("Profile create collision detected against the pinned snapshot or live key index.");
  } else {
    if (entry.profile || !entry.existing_profile_id || !live || live._id !== entry.existing_profile_id || !token || token.owner_count !== 1 || token.owner_profile_ids[0] !== entry.existing_profile_id) throw new Error("Existing-profile binding does not exactly match the pinned snapshot and live profile.");
    const expected = entry.projection.expectedBefore.existingProfile;
    if (!expected || !equal(expected, { profileId: String(live._id), profileKey: live.key, displayName: live.displayName })) throw new Error("Existing-profile binding expected-before row has drifted.");
    const verification = await ctx.db.query("contributorReplicatorVerifications").withIndex("by_profile_id", (q) => q.eq("profile_id", live._id)).unique();
    if (entry.projection.expectedBefore.currentVerificationProfileKey !== null || verification) throw new Error("Existing-profile verification state no longer matches the reviewed null expected-before state.");
  }
}

async function sharedProfileGroupDigest(entries: ProfileBindingEntry[]) {
  const ordered = [...entries].sort((a, b) => a.artist_id.localeCompare(b.artist_id));
  return await canonicalDigest({
    schemaVersion: 1,
    profile_key: ordered[0]?.profile_key,
    existing_profile_id: ordered[0]?.existing_profile_id,
    snapshot_digest: ordered[0]?.snapshot_digest,
    contributions: ordered.map((entry) => ({ artist_id: entry.artist_id, verification: entry.verification })),
  });
}

async function aggregateProfileBindingVerification(entries: ProfileBindingEntry[], profileId: Id<"contributorProfiles">, now: number): Promise<StoredVerificationValue> {
  const ordered = [...entries].sort((a, b) => a.artist_id.localeCompare(b.artist_id));
  const contributions = ordered.map((entry) => ({ artist_id: entry.artist_id, ...entry.verification! }));
  const statuses = contributions.map((item) => item.status);
  const status = statuses.includes("verified") ? "verified" as const : statuses.includes("unclear") ? "unclear" as const : "not-verified" as const;
  const groupDigest = entries[0].shared_profile_group_digest!;
  return {
    profile_id: profileId,
    status,
    basis: contributions.every((item) => item.basis === contributions[0].basis) ? contributions[0].basis : "editorial-review",
    // The reviewed sheets can overlap after identities are unified. Max preserves
    // the strongest observed corpus size without falsely claiming their sum is unique.
    work_count_reviewed: Math.max(...contributions.map((item) => item.work_count_reviewed)),
    rationale: contributions.map((item) => `[${item.artist_id}] ${item.rationale}`).join("\n\n"),
    evidence: contributions.flatMap((item) => item.evidence),
    source_digest: await canonicalDigest({ schemaVersion: 1, contributions }),
    operation_id: `identity-social:shared-profile-verification:${groupDigest.slice(0, 24)}`,
    reviewed_at: now,
    review_contributions: contributions,
  };
}

async function assertCanonicalProfileBindingEntry(entry: ProfileBindingEntry) {
  required(entry.artist_id, "Profile-binding artist ID");
  digest(entry.base_projection_digest, "Base projection digest");
  if (entry.receipt_sidecar_digest) digest(entry.receipt_sidecar_digest, "Receipt sidecar digest");
  if (entry.snapshot_digest !== PINNED_IDENTITY_SNAPSHOT_DIGEST || entry.snapshot_profile_count !== PINNED_IDENTITY_PROFILE_COUNT) throw new Error("Profile binding is not pinned to the reviewed 2,119-profile snapshot.");
  if (await canonicalDigest(entry.projection.expectedBefore) !== entry.projection.expectedBeforeSha256) throw new Error("Profile-binding expected-before digest is invalid.");
  const itemVersion = entry.shared_profile_group_digest ? 2 : 1;
  const expectedItemId = `identity-social-item:v${itemVersion}:${(await canonicalDigest({ schemaVersion: itemVersion, projection: entry.projection, artist_id: entry.artist_id, decision: entry.decision, snapshot_digest: entry.snapshot_digest, snapshot_profile_count: entry.snapshot_profile_count, profile_key: entry.profile_key ?? null, existing_profile_id: entry.existing_profile_id ?? null, profile: entry.profile ?? null, verification: entry.verification ?? null, ...(entry.shared_profile_group_digest ? { shared_profile_group_digest: entry.shared_profile_group_digest, shared_profile_group_size: entry.shared_profile_group_size } : {}), base_projection_digest: entry.base_projection_digest, receipt_sidecar_digest: entry.receipt_sidecar_digest })).slice(0, 24)}`;
  if (entry.item_operation_id !== expectedItemId) throw new Error("Profile-binding item operation ID is not derived from canonical transformed content.");
}

async function validateProfileBindingBatchShape(entries: ProfileBindingEntry[]) {
  if (entries.length < 1 || entries.length > PROFILE_BINDING_BATCH_MAX) throw new Error("Profile-binding batches are limited to 1 to 25 records.");
  const sharedGroups = new Map<string, ProfileBindingEntry[]>();
  for (const entry of entries) if (entry.shared_profile_group_digest) {
    const group = sharedGroups.get(entry.shared_profile_group_digest) ?? [];
    group.push(entry); sharedGroups.set(entry.shared_profile_group_digest, group);
  }
  for (const [groupDigest, group] of sharedGroups) {
    if (!SHA256.test(groupDigest) || group.length < 2 || group.some((entry) => entry.decision !== "bind" || entry.shared_profile_group_size !== group.length || entry.profile_key !== group[0].profile_key || entry.existing_profile_id !== group[0].existing_profile_id || entry.snapshot_digest !== group[0].snapshot_digest)) throw new Error("Shared profile-binding group is incomplete or inconsistent.");
    if (await sharedProfileGroupDigest(group) !== groupDigest) throw new Error("Shared profile-binding group digest is invalid.");
  }
  const seenArtists = new Set<string>(); const seenKeys = new Map<string, ProfileBindingEntry>();
  for (const entry of entries) {
    await assertCanonicalProfileBindingEntry(entry);
    if (seenArtists.has(entry.artist_id)) throw new Error("Duplicate artist ID in profile-binding batch.");
    seenArtists.add(entry.artist_id);
    if (entry.profile_key) {
      const prior = seenKeys.get(entry.profile_key);
      if (prior && (!entry.shared_profile_group_digest || entry.shared_profile_group_digest !== prior.shared_profile_group_digest || entry.decision !== "bind" || prior.decision !== "bind" || entry.existing_profile_id !== prior.existing_profile_id)) throw new Error("Duplicate profile key in profile-binding batch is allowed only for one exact reviewed existing-profile group.");
      seenKeys.set(entry.profile_key, entry);
    }
  }
}

export async function applyProfileBindingBatchHandler(ctx: MutationCtx, args: { apiKey: string; actor_email: string; operation_id: string; dry_run: boolean; entries: ProfileBindingEntry[] }) {
  const actor = await requireRegisteredDelegatedEditorWrite(ctx, { apiKey: args.apiKey, actorEmail: args.actor_email, adminIntent: "replicationMaintenance" });
  const operationId = required(args.operation_id, "Profile-binding batch operation ID");
  await validateProfileBindingBatchShape(args.entries);
  const payloadDigest = await canonicalDigest({ operation_id: operationId, entries: args.entries });
  const replay = await ctx.db.query("replicationIdentitySocialOperations").withIndex("by_operation_id", (q) => q.eq("operation_id", operationId)).unique();
  if (replay) {
    if (replay.kind !== "profile-binding" || replay.payload_digest !== payloadDigest || replay.rollback_of) throw new Error("Profile-binding batch operation ID collision.");
    const replayItems = await operationItems(ctx, operationId, replay.record_count);
    for (const item of replayItems) {
      const artistId = item.target.kind === "profile-binding" ? item.target.artist_id : null;
      const binding = artistId ? await ctx.db.query("replicationIdentityProfileBindings").withIndex("by_artist_id", (q) => q.eq("artist_id", artistId)).unique() : null;
      if (!equal(strip(binding as StoredRecord | null), item.after)) throw new Error("Profile-binding replay state has drifted.");
      if (item.verification_after && "profile_id" in item.verification_after) {
        const verification = await ctx.db.query("contributorReplicatorVerifications").withIndex("by_profile_id", (q) => q.eq("profile_id", item.verification_after!.profile_id)).unique();
        if (!equal(strip(verification as StoredRecord | null), item.verification_after)) throw new Error("Profile-binding verification replay state has drifted.");
      }
    }
    return { operation_id: operationId, payload_digest: payloadDigest, changed: replay.changed_count, unchanged: replay.unchanged_count, idempotent_replay: true, dry_run: false };
  }
  const sharedGroups = new Map<string, ProfileBindingEntry[]>();
  for (const entry of args.entries) if (entry.shared_profile_group_digest) {
    const group = sharedGroups.get(entry.shared_profile_group_digest) ?? [];
    group.push(entry); sharedGroups.set(entry.shared_profile_group_digest, group);
  }
  for (const entry of args.entries) {
    if (await ctx.db.query("replicationIdentitySocialOperationItems").withIndex("by_item_operation_id", (q) => q.eq("item_operation_id", entry.item_operation_id)).unique()) throw new Error("Item operation ID collision.");
    if (await ctx.db.query("replicationIdentityProfileBindings").withIndex("by_artist_id", (q) => q.eq("artist_id", entry.artist_id)).unique()) throw new Error("Artist already has a profile binding.");
    await assertPinnedProfileBindingSnapshot(ctx, entry);
  }
  if (args.dry_run) {
    const changed = args.entries.filter((entry) => entry.decision !== "unresolved").length;
    return { operation_id: operationId, payload_digest: payloadDigest, changed, unchanged: args.entries.length - changed, idempotent_replay: false, dry_run: true };
  }
  const now = Date.now(); const createdAt = new Date(now).toISOString(); let changed = 0;
  const writtenSharedGroups = new Set<string>();
  for (const entry of args.entries) {
    const target = { kind: "profile-binding" as const, artist_id: entry.artist_id };
    if (entry.decision === "unresolved") {
      await ctx.db.insert("replicationIdentitySocialOperationItems", { item_operation_id: entry.item_operation_id, batch_operation_id: operationId, kind: "profile-binding", target, before: null, after: null, changed: false, created_at: now });
      continue;
    }
    let profileId = entry.existing_profile_id;
    let createdProfileSnapshot: Record<string, unknown> | undefined;
    if (entry.decision === "create") {
      const value = { key: entry.profile_key!, displayName: entry.profile!.display_name, aliases: entry.profile!.aliases, bio: "", role: "Replication Artist", links: entry.profile!.links, createdAt, updatedAt: createdAt, updatedBy: actor.email };
      profileId = await ctx.db.insert("contributorProfiles", value);
      createdProfileSnapshot = value;
    }
    const isSharedLeader = Boolean(entry.shared_profile_group_digest && !writtenSharedGroups.has(entry.shared_profile_group_digest));
    const isSharedFollower = Boolean(entry.shared_profile_group_digest && !isSharedLeader);
    const verificationBeforeRow = isSharedFollower ? null : await ctx.db.query("contributorReplicatorVerifications").withIndex("by_profile_id", (q) => q.eq("profile_id", profileId!)).unique();
    const verificationBefore = isSharedFollower ? undefined : strip(verificationBeforeRow as StoredRecord | null) as StoredVerificationValue | null;
    const verificationAfter = isSharedFollower ? undefined : entry.shared_profile_group_digest
      ? await aggregateProfileBindingVerification(sharedGroups.get(entry.shared_profile_group_digest)!, profileId!, now)
      : { ...entry.verification!, profile_id: profileId!, operation_id: entry.item_operation_id, reviewed_at: now };
    if (verificationAfter) {
      if (verificationBeforeRow) await ctx.db.replace(verificationBeforeRow._id, verificationAfter); else await ctx.db.insert("contributorReplicatorVerifications", verificationAfter);
      if (entry.shared_profile_group_digest) writtenSharedGroups.add(entry.shared_profile_group_digest);
    }
    const binding = { artist_id: entry.artist_id, profile_id: profileId!, profile_key: entry.profile_key!, decision: entry.decision === "create" ? "created-profile" as const : "bound-existing-profile" as const, snapshot_digest: entry.snapshot_digest, operation_id: entry.item_operation_id, bound_at: now };
    await ctx.db.insert("replicationIdentityProfileBindings", binding);
    await ctx.db.insert("replicationIdentitySocialOperationItems", { item_operation_id: entry.item_operation_id, batch_operation_id: operationId, kind: "profile-binding", target, before: null, after: binding, changed: true, created_profile_id: entry.decision === "create" ? profileId : undefined, created_profile_snapshot: createdProfileSnapshot, ...(isSharedFollower ? {} : { verification_before: verificationBefore, verification_after: verificationAfter }), created_at: now });
    changed += 1;
  }
  await ctx.db.insert("replicationIdentitySocialOperations", { operation_id: operationId, kind: "profile-binding", payload_digest: payloadDigest, actor_email: actor.email, record_count: args.entries.length, changed_count: changed, unchanged_count: args.entries.length - changed, created_at: now });
  return { operation_id: operationId, payload_digest: payloadDigest, changed, unchanged: args.entries.length - changed, idempotent_replay: false, dry_run: false };
}

function sameProfileBindingVerificationMaterial(current: StoredVerificationValue, expected: ProfileBindingEntry["verification"]) {
  if (!expected) return false;
  return equal(
    { status: current.status, basis: current.basis, work_count_reviewed: current.work_count_reviewed, rationale: current.rationale, evidence: current.evidence, source_digest: current.source_digest },
    expected,
  );
}

/**
 * Records a canonical batch receipt for profile bindings that were already
 * applied under smaller legacy batches. This never rewrites public state. The
 * canonical receipt is created only when each canonical item ID points to an
 * unrolled-back source journal and all current state still exactly matches it.
 */
export async function reconcileAppliedProfileBindingBatchHandler(ctx: MutationCtx, args: { apiKey: string; actor_email: string; operation_id: string; dry_run: boolean; entries: ProfileBindingEntry[] }) {
  const actor = await requireRegisteredDelegatedEditorWrite(ctx, { apiKey: args.apiKey, actorEmail: args.actor_email, adminIntent: "replicationMaintenance" });
  const operationId = required(args.operation_id, "Profile-binding reconciliation operation ID");
  await validateProfileBindingBatchShape(args.entries);
  const payloadDigest = await canonicalDigest({ operation_id: operationId, entries: args.entries });
  const replay = await ctx.db.query("replicationIdentitySocialOperations").withIndex("by_operation_id", (q) => q.eq("operation_id", operationId)).unique();
  if (replay) {
    if (replay.kind !== "profile-binding" || replay.payload_digest !== payloadDigest || replay.rollback_of) throw new Error("Profile-binding reconciliation operation ID collision.");
    if ((await ctx.db.query("replicationIdentitySocialOperations").withIndex("by_rollback_of", (q) => q.eq("rollback_of", operationId)).take(1)).length) throw new Error("Profile-binding reconciliation operation was already rolled back.");
    const replayItems = await operationItems(ctx, operationId, replay.record_count);
    for (const item of replayItems) {
      const target = item.target;
      if (target.kind !== "profile-binding") throw new Error("Profile-binding reconciliation replay journal target is invalid.");
      const artistId = target.artist_id;
      if (!equal(strip(await ctx.db.query("replicationIdentityProfileBindings").withIndex("by_artist_id", (q) => q.eq("artist_id", artistId)).unique() as StoredRecord | null), item.after)) throw new Error("Profile-binding reconciliation replay state has drifted.");
      if (item.verification_after && "profile_id" in item.verification_after) {
        const current = await ctx.db.query("contributorReplicatorVerifications").withIndex("by_profile_id", (q) => q.eq("profile_id", item.verification_after!.profile_id)).unique();
        if (!equal(strip(current as StoredRecord | null), item.verification_after)) throw new Error("Profile-binding reconciliation verification replay state has drifted.");
      }
    }
    return { operation_id: operationId, payload_digest: payloadDigest, changed: replay.changed_count, unchanged: replay.unchanged_count, idempotent_replay: true, dry_run: false };
  }

  const sourceByItemId = new Map<string, Infer<typeof replicationIdentitySocialOperationItemValidator>>();
  for (const entry of args.entries) {
    const source = await ctx.db.query("replicationIdentitySocialOperationItems").withIndex("by_item_operation_id", (q) => q.eq("item_operation_id", entry.item_operation_id)).unique();
    if (!source || source.kind !== "profile-binding" || source.target.kind !== "profile-binding" || source.target.artist_id !== entry.artist_id) throw new Error(`Canonical profile-binding item is not proven by an exact source journal: ${entry.artist_id}.`);
    sourceByItemId.set(entry.item_operation_id, source);
  }
  const sharedGroups = new Map<string, ProfileBindingEntry[]>();
  for (const entry of args.entries) if (entry.shared_profile_group_digest) {
    const group = sharedGroups.get(entry.shared_profile_group_digest) ?? [];
    group.push(entry); sharedGroups.set(entry.shared_profile_group_digest, group);
  }
  const sharedVerificationLeaders = new Map<string, Infer<typeof replicationIdentitySocialOperationItemValidator>>();
  for (const [groupDigest, group] of sharedGroups) {
    const sources = group.map((entry) => sourceByItemId.get(entry.item_operation_id)!);
    const leaders = sources.filter((source) => source.verification_after);
    if (leaders.length !== 1 || sources.some((source) => source.batch_operation_id !== leaders[0].batch_operation_id)) throw new Error("Shared profile-binding reconciliation requires one exact source verification leader from one source batch.");
    sharedVerificationLeaders.set(groupDigest, leaders[0]);
  }

  const proven: Array<{ entry: ProfileBindingEntry; source: Infer<typeof replicationIdentitySocialOperationItemValidator>; binding: IdentitySocialStoredValue | null; verification?: StoredVerificationValue }> = [];
  for (const entry of args.entries) {
    const source = sourceByItemId.get(entry.item_operation_id)!;
    const sourceOperation = await ctx.db.query("replicationIdentitySocialOperations").withIndex("by_operation_id", (q) => q.eq("operation_id", source.batch_operation_id)).unique();
    if (!sourceOperation || sourceOperation.kind !== "profile-binding" || sourceOperation.rollback_of) throw new Error(`Canonical profile-binding source operation is missing or invalid: ${entry.artist_id}.`);
    const rolledBack = await ctx.db.query("replicationIdentitySocialOperations").withIndex("by_rollback_of", (q) => q.eq("rollback_of", source.batch_operation_id)).take(1);
    if (rolledBack.length) throw new Error(`Canonical profile-binding source operation was rolled back: ${entry.artist_id}.`);
    const bindingRow = await ctx.db.query("replicationIdentityProfileBindings").withIndex("by_artist_id", (q) => q.eq("artist_id", entry.artist_id)).unique();
    const binding = strip(bindingRow as StoredRecord | null);
    if (!equal(binding, source.after) || !equal(source.before, null)) throw new Error(`Canonical profile-binding live binding does not match its source journal: ${entry.artist_id}.`);
    if (entry.decision === "unresolved") {
      if (source.changed || source.after !== null || bindingRow) throw new Error(`Unresolved profile-binding reconciliation is not an exact journal-only state: ${entry.artist_id}.`);
      proven.push({ entry, source, binding: null });
      continue;
    }
    if (!source.changed || !bindingRow || !entry.profile_key || !entry.verification || bindingRow.profile_key !== entry.profile_key || bindingRow.operation_id !== entry.item_operation_id) throw new Error(`Resolved profile-binding reconciliation state is incomplete: ${entry.artist_id}.`);
    if (entry.decision === "create") {
      if (!entry.profile || source.created_profile_id !== bindingRow.profile_id || !source.created_profile_snapshot) throw new Error(`Created-profile reconciliation provenance is incomplete: ${entry.artist_id}.`);
      const created = source.created_profile_snapshot as Record<string, unknown>;
      if (!equal({ display_name: created.displayName, aliases: created.aliases, links: created.links }, entry.profile) || created.key !== entry.profile_key) throw new Error(`Created-profile reconciliation snapshot does not match the canonical entry: ${entry.artist_id}.`);
    } else if (entry.existing_profile_id !== bindingRow.profile_id || source.created_profile_id) throw new Error(`Existing-profile reconciliation identity does not match the canonical entry: ${entry.artist_id}.`);
    const profile = await ctx.db.get(bindingRow.profile_id);
    if (!profile || profile.key !== entry.profile_key) throw new Error(`Profile-binding reconciliation live profile identity has drifted: ${entry.artist_id}.`);
    const verificationRow = await ctx.db.query("contributorReplicatorVerifications").withIndex("by_profile_id", (q) => q.eq("profile_id", bindingRow.profile_id)).unique();
    const verification = strip(verificationRow as StoredRecord | null) as StoredVerificationValue | null;
    const sharedLeader = entry.shared_profile_group_digest ? sharedVerificationLeaders.get(entry.shared_profile_group_digest) : undefined;
    const sourceVerification = sharedLeader?.verification_after ?? source.verification_after;
    const canonicalVerificationMatches = verification && entry.shared_profile_group_digest
      ? equal(verification, await aggregateProfileBindingVerification(sharedGroups.get(entry.shared_profile_group_digest)!, bindingRow.profile_id, verification.reviewed_at))
      : verification ? sameProfileBindingVerificationMaterial(verification, entry.verification) : false;
    if (!verification || !sourceVerification || !equal(verification, sourceVerification) || !canonicalVerificationMatches) throw new Error(`Profile-binding reconciliation verification does not exactly match the canonical review: ${entry.artist_id}.`);
    // Preserve the source batch's single-leader journal shape. Recording the
    // aggregate on every grouped constituent would create multiple rollback
    // leaders for one profile and make the canonical receipt unrollable.
    proven.push({ entry, source, binding, ...(source.verification_after ? { verification } : {}) });
  }

  if (!args.dry_run) {
    const now = Date.now();
    for (const item of proven) {
      const journalId = `identity-social:reconcile-profile-binding:${(await canonicalDigest({ operation_id: operationId, source_item_operation_id: item.source.item_operation_id })).slice(0, 24)}`;
      if (await ctx.db.query("replicationIdentitySocialOperationItems").withIndex("by_item_operation_id", (q) => q.eq("item_operation_id", journalId)).unique()) throw new Error("Profile-binding reconciliation journal item collision.");
      await ctx.db.insert("replicationIdentitySocialOperationItems", {
        item_operation_id: journalId, batch_operation_id: operationId, kind: "profile-binding",
        target: item.source.target, before: item.binding, after: item.binding, changed: false,
        ...(item.verification ? { verification_before: item.verification, verification_after: item.verification } : {}),
        satisfied_item_operation_ids: [item.source.item_operation_id], created_at: now,
      });
    }
    await ctx.db.insert("replicationIdentitySocialOperations", { operation_id: operationId, kind: "profile-binding", payload_digest: payloadDigest, actor_email: actor.email, record_count: proven.length, changed_count: 0, unchanged_count: proven.length, created_at: now });
  }
  return { operation_id: operationId, payload_digest: payloadDigest, changed: 0, unchanged: proven.length, idempotent_replay: false, dry_run: args.dry_run };
}

export async function rollbackProfileBindingOperationHandler(ctx: MutationCtx, args: { apiKey: string; actor_email: string; operation_id: string; rollback_of: string; dry_run: boolean }) {
  const actor = await requireRegisteredDelegatedEditorWrite(ctx, { apiKey: args.apiKey, actorEmail: args.actor_email, adminIntent: "replicationMaintenance" });
  const operationId = required(args.operation_id, "Profile-binding rollback operation ID"); const rollbackOf = required(args.rollback_of, "Profile-binding rollback target");
  const original = await ctx.db.query("replicationIdentitySocialOperations").withIndex("by_operation_id", (q) => q.eq("operation_id", rollbackOf)).unique();
  if (!original || original.kind !== "profile-binding") throw new Error("Profile-binding rollback target not found.");
  const payloadDigest = await canonicalDigest({ operation_id: operationId, rollback_of: rollbackOf });
  const prior = await ctx.db.query("replicationIdentitySocialOperations").withIndex("by_operation_id", (q) => q.eq("operation_id", operationId)).unique();
  if (prior) {
    if (prior.payload_digest !== payloadDigest || prior.rollback_of !== rollbackOf) throw new Error("Profile-binding rollback operation ID collision.");
    return { operation_id: operationId, payload_digest: payloadDigest, changed: prior.changed_count, unchanged: prior.unchanged_count, idempotent_replay: true, dry_run: false };
  }
  const items = await operationItems(ctx, rollbackOf, original.record_count);
  const verificationLeaders = new Map<string, typeof items[number]>();
  for (const item of items) {
    if (item.target.kind !== "profile-binding") throw new Error("Profile-binding rollback journal target is invalid.");
    const artistId = item.target.artist_id;
    const binding = await ctx.db.query("replicationIdentityProfileBindings").withIndex("by_artist_id", (q) => q.eq("artist_id", artistId)).unique();
    if (!equal(strip(binding as StoredRecord | null), item.after)) throw new Error("Profile-binding rollback target has drifted.");
    const verificationAfter = item.verification_after;
    if (verificationAfter && "profile_id" in verificationAfter) {
      const profileId = String(verificationAfter.profile_id);
      if (verificationLeaders.has(profileId)) throw new Error("Profile-binding rollback journal has multiple verification leaders for one profile.");
      verificationLeaders.set(profileId, item);
      const verification = await ctx.db.query("contributorReplicatorVerifications").withIndex("by_profile_id", (q) => q.eq("profile_id", verificationAfter.profile_id)).unique();
      if (!equal(strip(verification as StoredRecord | null), verificationAfter)) throw new Error("Profile-binding rollback verification has drifted.");
    }
    if (!item.changed) continue;
    if (item.created_profile_id) {
      const profile = await ctx.db.get(item.created_profile_id);
      if (!profile || !equal(profileMaterial(profile as Record<string, unknown>), item.created_profile_snapshot)) throw new Error("Operation-created profile has drifted and cannot be deleted.");
      const createdKey = String((item.created_profile_snapshot as Record<string, unknown> | undefined)?.key ?? "");
      await assertCreatedProfileHasNoRollbackReferences(ctx, item.created_profile_id, createdKey);
    }
  }
  for (const item of items) {
    if (!item.changed || !item.after || !("profile_id" in item.after)) continue;
    if (!verificationLeaders.has(String(item.after.profile_id))) throw new Error("Profile-binding rollback journal is missing the profile verification leader.");
  }
  const changed = items.filter((item) => item.changed).length;
  if (!args.dry_run) {
    const now = Date.now();
    for (const item of items) {
      if (item.target.kind !== "profile-binding") continue;
      const rollbackItemId = `identity-social:rollback:${(await canonicalDigest({ operationId, source: item.item_operation_id })).slice(0, 24)}`;
      if (!item.changed) {
        await ctx.db.insert("replicationIdentitySocialOperationItems", { item_operation_id: rollbackItemId, batch_operation_id: operationId, kind: "profile-binding", target: item.target, before: item.after, after: item.after, changed: false, ...(item.verification_after ? { verification_before: item.verification_after, verification_after: item.verification_after } : {}), created_at: now });
        continue;
      }
      const artistId = item.target.artist_id;
      const binding = await ctx.db.query("replicationIdentityProfileBindings").withIndex("by_artist_id", (q) => q.eq("artist_id", artistId)).unique();
      if (binding) await ctx.db.delete(binding._id);
      if (item.created_profile_id) await ctx.db.delete(item.created_profile_id);
      await ctx.db.insert("replicationIdentitySocialOperationItems", { item_operation_id: rollbackItemId, batch_operation_id: operationId, kind: "profile-binding", target: item.target, before: item.after, after: null, changed: true, ...(item.verification_after ? { verification_before: item.verification_after, verification_after: item.verification_before ?? null } : {}), created_at: now });
    }
    for (const item of verificationLeaders.values()) {
      const verificationAfter = item.verification_after!;
      const verification = await ctx.db.query("contributorReplicatorVerifications").withIndex("by_profile_id", (q) => q.eq("profile_id", verificationAfter.profile_id)).unique();
      if (verification) { if (item.verification_before) await ctx.db.replace(verification._id, item.verification_before); else await ctx.db.delete(verification._id); }
    }
    await ctx.db.insert("replicationIdentitySocialOperations", { operation_id: operationId, kind: "profile-binding", payload_digest: payloadDigest, actor_email: actor.email, record_count: items.length, changed_count: changed, unchanged_count: items.length - changed, rollback_of: rollbackOf, created_at: now });
  }
  return { operation_id: operationId, payload_digest: payloadDigest, changed, unchanged: items.length - changed, idempotent_replay: false, dry_run: args.dry_run };
}

export const applyBatch = mutation({ args: { apiKey: v.string(), actor_email: v.string(), operation_id: v.string(), kind: identitySocialOperationKindValidator, dry_run: v.boolean(), entries: v.array(identitySocialBatchEntryValidator) }, returns: resultValidator, handler: applyIdentitySocialBatchHandler });
export const rollbackOperation = mutation({ args: { apiKey: v.string(), actor_email: v.string(), operation_id: v.string(), rollback_of: v.string(), dry_run: v.boolean() }, returns: resultValidator, handler: rollbackIdentitySocialOperationHandler });
export const materializeIdentityTokenSnapshot = mutation({
  args: { apiKey: v.string(), actor_email: v.string(), operation_id: v.string(), mode: v.union(v.literal("seed"), v.literal("rollback")), dry_run: v.boolean(), snapshot_digest: v.string(), profile_ids_digest: v.string(), profile_ids: v.array(v.id("contributorProfiles")), tokens: v.array(snapshotTokenInputValidator) },
  returns: snapshotMaterializationResultValidator,
  handler: materializeIdentityTokenSnapshotHandler,
});
export const applyProfileBindingBatch = mutation({ args: { apiKey: v.string(), actor_email: v.string(), operation_id: v.string(), dry_run: v.boolean(), entries: v.array(profileBindingEntryValidator) }, returns: resultValidator, handler: applyProfileBindingBatchHandler });
export const reconcileAppliedProfileBindingBatch = mutation({ args: { apiKey: v.string(), actor_email: v.string(), operation_id: v.string(), dry_run: v.boolean(), entries: v.array(profileBindingEntryValidator) }, returns: resultValidator, handler: reconcileAppliedProfileBindingBatchHandler });
export const rollbackProfileBindingOperation = mutation({ args: { apiKey: v.string(), actor_email: v.string(), operation_id: v.string(), rollback_of: v.string(), dry_run: v.boolean() }, returns: resultValidator, handler: rollbackProfileBindingOperationHandler });
const authenticatedReadArgs = { apiKey: v.string(), actor_email: v.string() };
export const previewCanonicalBeforeAuthenticated = query({
  args: { ...authenticatedReadArgs, entry: identitySocialBatchEntryValidator },
  returns: v.object({ matches: v.boolean(), digest: v.string(), error: v.optional(v.string()) }),
  handler: async (ctx, args) => {
    await requireRegisteredDelegatedEditorWrite(ctx, { apiKey: args.apiKey, actorEmail: args.actor_email, adminIntent: "replicationMaintenance" });
    try {
      const before = await canonicalBeforeForEntry(ctx, args.entry);
      const matches = authoritativeBeforeMatches(args.entry, before);
      const digest = matches ? args.entry.projection.expectedBeforeSha256 : await canonicalDigest(before);
      return { matches, digest };
    } catch (error) {
      return { matches: false, digest: "", error: error instanceof Error ? error.message : "Canonical preflight failed." };
    }
  },
});
export const preflightBatchEntryAuthenticated = query({
  args: { ...authenticatedReadArgs, entry: identitySocialBatchEntryValidator },
  returns: v.object({ matches: v.boolean(), error: v.optional(v.string()) }),
  handler: async (ctx, args) => {
    await requireRegisteredDelegatedEditorWrite(ctx, { apiKey: args.apiKey, actorEmail: args.actor_email, adminIntent: "replicationMaintenance" });
    try {
      validateIdentitySocialBatch(args.entry.kind, [args.entry], "preflight");
      await validateProjectionIdentity(args.entry);
      await verifyAuthoritativeBefore(ctx, args.entry);
      await validateReceipt(ctx, args.entry);
      return { matches: true };
    } catch (error) {
      return { matches: false, error: error instanceof Error ? error.message : "Identity/social batch preflight failed." };
    }
  },
});
export const getOperationReceiptAuthenticated = query({
  args: { ...authenticatedReadArgs, operation_id: v.string() },
  returns: v.union(v.object({ operation_id: v.string(), payload_digest: v.string(), record_count: v.number(), changed_count: v.number(), unchanged_count: v.number(), item_count: v.number() }), v.null()),
  handler: async (ctx, args) => {
    await requireRegisteredDelegatedEditorWrite(ctx, { apiKey: args.apiKey, actorEmail: args.actor_email, adminIntent: "replicationMaintenance" });
    const operation = await ctx.db.query("replicationIdentitySocialOperations").withIndex("by_operation_id", (q) => q.eq("operation_id", args.operation_id)).unique();
    if (!operation) return null;
    const items = await operationItems(ctx, operation.operation_id, operation.record_count);
    return { operation_id: operation.operation_id, payload_digest: operation.payload_digest, record_count: operation.record_count, changed_count: operation.changed_count, unchanged_count: operation.unchanged_count, item_count: items.length };
  },
});
const completionReceiptItemValidator = v.object({
  item_operation_id: v.string(),
  kind: identitySocialOperationKindValidator,
  changed: v.boolean(),
  live_matches: v.boolean(),
  expected_after_digest: v.string(),
  current_digest: v.string(),
  profile_live_matches: v.optional(v.boolean()),
  verification_live_matches: v.optional(v.boolean()),
  satisfied_item_operation_ids: v.array(v.string()),
  error: v.optional(v.string()),
});
export const getOperationCompletionReceiptAuthenticated = query({
  args: { ...authenticatedReadArgs, operation_id: v.string() },
  returns: v.union(v.object({
    operation_id: v.string(), kind: identitySocialOperationKindValidator,
    payload_digest: v.string(), record_count: v.number(), changed_count: v.number(),
    unchanged_count: v.number(), rollback_of: v.union(v.string(), v.null()),
    item_count: v.number(), all_live_match: v.boolean(),
    items_digest: v.string(), items: v.array(completionReceiptItemValidator),
  }), v.null()),
  handler: async (ctx, args) => {
    await requireRegisteredDelegatedEditorWrite(ctx, { apiKey: args.apiKey, actorEmail: args.actor_email, adminIntent: "replicationMaintenance" });
    const operation = await ctx.db.query("replicationIdentitySocialOperations").withIndex("by_operation_id", (q) => q.eq("operation_id", args.operation_id)).unique();
    if (!operation) return null;
    const journal = await operationItems(ctx, operation.operation_id, operation.record_count);
    const items = [];
    for (const item of journal) {
      try {
        let current: IdentitySocialStoredValue | null;
        let profileLiveMatches: boolean | undefined;
        let verificationLiveMatches: boolean | undefined;
        const target = item.target;
        if (target.kind === "profile-binding") {
          const binding = await ctx.db.query("replicationIdentityProfileBindings").withIndex("by_artist_id", (q) => q.eq("artist_id", target.artist_id)).unique();
          current = strip(binding as StoredRecord | null);
          if (item.verification_after && "profile_id" in item.verification_after) {
            const verification = await ctx.db.query("contributorReplicatorVerifications").withIndex("by_profile_id", (q) => q.eq("profile_id", item.verification_after!.profile_id)).unique();
            verificationLiveMatches = equal(strip(verification as StoredRecord | null), item.verification_after);
          }
        } else {
          current = strip(await existingByTarget(ctx, target));
          if (item.profile_after) profileLiveMatches = equal(await profileProjectionForTarget(ctx, target), item.profile_after);
        }
        const recordMatches = equal(current, item.after);
        const liveMatches = recordMatches && profileLiveMatches !== false && verificationLiveMatches !== false;
        items.push({
          item_operation_id: item.item_operation_id, kind: item.kind, changed: item.changed,
          live_matches: liveMatches, expected_after_digest: await canonicalDigest(item.after),
          current_digest: await canonicalDigest(current),
          ...(profileLiveMatches === undefined ? {} : { profile_live_matches: profileLiveMatches }),
          ...(verificationLiveMatches === undefined ? {} : { verification_live_matches: verificationLiveMatches }),
          satisfied_item_operation_ids: item.satisfied_item_operation_ids ?? [],
        });
      } catch (error) {
        items.push({
          item_operation_id: item.item_operation_id, kind: item.kind, changed: item.changed,
          live_matches: false, expected_after_digest: await canonicalDigest(item.after), current_digest: "",
          satisfied_item_operation_ids: item.satisfied_item_operation_ids ?? [],
          error: error instanceof Error ? error.message : "Completion readback failed.",
        });
      }
    }
    return {
      operation_id: operation.operation_id, kind: operation.kind, payload_digest: operation.payload_digest,
      record_count: operation.record_count, changed_count: operation.changed_count, unchanged_count: operation.unchanged_count,
      rollback_of: operation.rollback_of ?? null, item_count: items.length,
      all_live_match: items.every((item) => item.live_matches), items_digest: await canonicalDigest(items), items,
    };
  },
});
export const preflightProfileBindingAuthenticated = query({
  args: { ...authenticatedReadArgs, entry: profileBindingEntryValidator },
  returns: v.object({ matches: v.boolean(), digest: v.string(), error: v.optional(v.string()) }),
  handler: async (ctx, args) => {
    await requireRegisteredDelegatedEditorWrite(ctx, { apiKey: args.apiKey, actorEmail: args.actor_email, adminIntent: "replicationMaintenance" });
    try {
      await assertPinnedProfileBindingSnapshot(ctx, args.entry);
      return { matches: true, digest: await canonicalDigest({ snapshot_digest: args.entry.snapshot_digest, snapshot_profile_count: args.entry.snapshot_profile_count, artist_id: args.entry.artist_id, decision: args.entry.decision, profile_key: args.entry.profile_key ?? null }) };
    } catch (error) {
      return { matches: false, digest: "", error: error instanceof Error ? error.message : "Profile binding preflight failed." };
    }
  },
});
const exportedProfileValidator = v.object({
  profileId: v.id("contributorProfiles"), key: v.string(), displayName: v.string(), aliases: v.array(v.string()),
  avatarUrl: v.union(v.string(), v.null()), bio: v.string(), links: v.array(v.object({ label: v.string(), url: v.string() })),
  hasCustomBio: v.boolean(), replicationOrder: v.array(v.string()), reportOrder: v.array(v.string()), role: v.union(v.string(), v.null()),
});
export async function exportPinnedProfileSnapshotPageHandler(ctx: QueryCtx, args: { cursor?: string; limit: number }) {
  const limit = Math.min(Math.max(Math.floor(args.limit), 1), 100);
  const page = await ctx.db.query("contributorProfiles").paginate({ cursor: args.cursor ?? null, numItems: limit });
  const profiles = await Promise.all(page.page.map(async (stored) => {
    const profile = await materializeProfile(ctx, stored);
    return { profileId: stored._id, key: profile.key, displayName: profile.displayName, aliases: profile.aliases, avatarUrl: profile.avatarUrl ?? null, bio: profile.bio, links: profile.links, hasCustomBio: profile.hasCustomBio, replicationOrder: profile.replicationOrder ?? [], reportOrder: profile.reportOrder ?? [], role: profile.role ?? null };
  }));
  return { profiles, cursor: page.isDone ? null : page.continueCursor, isDone: page.isDone, profile_count: PINNED_IDENTITY_PROFILE_COUNT, canonical_profile_set_sha256: PINNED_IDENTITY_SNAPSHOT_DIGEST };
}
export const exportPinnedProfileSnapshotPageAuthenticated = query({
  args: { ...authenticatedReadArgs, cursor: v.optional(v.string()), limit: v.number() },
  returns: v.object({ profiles: v.array(exportedProfileValidator), cursor: v.union(v.string(), v.null()), isDone: v.boolean(), profile_count: v.number(), canonical_profile_set_sha256: v.string() }),
  handler: async (ctx, args) => {
    await requireRegisteredDelegatedEditorWrite(ctx, { apiKey: args.apiKey, actorEmail: args.actor_email, adminIntent: "replicationMaintenance" });
    return await exportPinnedProfileSnapshotPageHandler(ctx, args);
  },
});
export const getIdentityTokenMaterializationReceiptAuthenticated = query({
  args: { ...authenticatedReadArgs, snapshot_digest: v.string() },
  returns: v.union(v.object({ snapshot_digest: v.string(), profile_count: v.number(), profile_ids_digest: v.string(), token_count: v.number(), operation_id: v.string() }), v.null()),
  handler: async (ctx, args) => {
    await requireRegisteredDelegatedEditorWrite(ctx, { apiKey: args.apiKey, actorEmail: args.actor_email, adminIntent: "replicationMaintenance" });
    const marker = await ctx.db.query("contributorIdentitySnapshotMaterializations").withIndex("by_snapshot_digest", (q) => q.eq("snapshot_digest", args.snapshot_digest)).unique();
    if (!marker) return null;
    return { snapshot_digest: marker.snapshot_digest, profile_count: marker.profile_count, profile_ids_digest: marker.profile_ids_digest, token_count: marker.token_count, operation_id: marker.operation_id };
  },
});
export const getProfileCurationReadbackAuthenticated = query({
  args: { ...authenticatedReadArgs, profile_id: v.id("contributorProfiles"), history_digests: v.array(v.string()) },
  returns: v.union(v.object({
    profile: v.object({
      _id: v.id("contributorProfiles"), key: v.string(), displayName: v.string(),
      avatarUrl: v.union(v.string(), v.null()), avatarR2Key: v.union(v.string(), v.null()),
      avatarStorageId: v.union(v.string(), v.null()), avatarSha256: v.union(v.string(), v.null()),
      avatarProvenance: v.union(v.string(), v.null()), links: v.array(v.object({ label: v.string(), url: v.string() })),
    }),
    avatarHistory: v.array(storedAvatar),
  }), v.null()),
  handler: async (ctx, args) => {
    await requireRegisteredDelegatedEditorWrite(ctx, { apiKey: args.apiKey, actorEmail: args.actor_email, adminIntent: "replicationMaintenance" });
    if (args.history_digests.length < 1 || args.history_digests.length > 10 || new Set(args.history_digests).size !== args.history_digests.length) {
      throw new Error("Profile curation readback requires 1 to 10 unique avatar history digests.");
    }
    const profile = await ctx.db.get(args.profile_id);
    if (!profile) return null;
    const avatarHistory = (await Promise.all(args.history_digests.map((mediaDigest) => ctx.db
      .query("contributorAvatarHistory")
      .withIndex("by_profile_id_and_media_digest", (q) => q.eq("profile_id", args.profile_id).eq("media_digest", mediaDigest))
      .unique()))).filter((row) => row !== null);
    return {
      profile: {
        _id: profile._id, key: profile.key, displayName: profile.displayName,
        avatarUrl: profile.avatarUrl ?? null, avatarR2Key: profile.avatarR2Key ?? null,
        avatarStorageId: profile.avatarStorageId ?? null, avatarSha256: profile.avatarSha256 ?? null,
        avatarProvenance: profile.avatarProvenance ?? null, links: profile.links ?? [],
      },
      avatarHistory,
    };
  },
});
export const previewCanonicalBefore = internalQuery({ args: { entry: identitySocialBatchEntryValidator }, returns: v.object({ before: v.union(creatorExpectedBeforeValidator, verificationExpectedBeforeValidator, avatarExpectedBeforeValidator, aliasExpectedBeforeValidator, v.null()), digest: v.string() }), handler: async (ctx, args) => { const before = await canonicalBeforeForEntry(ctx, args.entry); return { before, digest: await canonicalDigest(before) }; } });
export const getAttributionsByReplicationIds = internalQuery({ args: { replication_ids: v.array(v.id("replications")) }, returns: v.array(storedAttribution), handler: async (ctx, args) => { if (args.replication_ids.length > MAX_BATCH) throw new Error("Readback limited to 50."); const rows = []; for (const id of args.replication_ids) { const row = await ctx.db.query("replicationIdentityAttributions").withIndex("by_replication_id", (q) => q.eq("replication_id", id)).unique(); if (row) rows.push(row); } return rows; } });
const pageMeta = { cursor: v.union(v.string(), v.null()), isDone: v.boolean(), hasMore: v.boolean() };
export const getProfileAliasesPage = internalQuery({ args: { profile_id: v.id("contributorProfiles"), cursor: v.optional(v.string()), limit: v.number() }, returns: v.object({ items: v.array(storedAlias), ...pageMeta }), handler: async (ctx, args) => { const page = await ctx.db.query("contributorAliasEvidence").withIndex("by_profile_id", (q) => q.eq("profile_id", args.profile_id)).paginate({ cursor: args.cursor ?? null, numItems: Math.min(Math.max(Math.floor(args.limit), 1), 50) }); return { items: page.page, cursor: page.isDone ? null : page.continueCursor, isDone: page.isDone, hasMore: !page.isDone }; } });
export const getProfileAvatarsPage = internalQuery({ args: { profile_id: v.id("contributorProfiles"), cursor: v.optional(v.string()), limit: v.number() }, returns: v.object({ items: v.array(storedAvatar), ...pageMeta }), handler: async (ctx, args) => { const page = await ctx.db.query("contributorAvatarHistory").withIndex("by_profile_id", (q) => q.eq("profile_id", args.profile_id)).paginate({ cursor: args.cursor ?? null, numItems: Math.min(Math.max(Math.floor(args.limit), 1), 50) }); return { items: page.page, cursor: page.isDone ? null : page.continueCursor, isDone: page.isDone, hasMore: !page.isDone }; } });
export const getProfileIdentityBundle = internalQuery({ args: { profile_id: v.id("contributorProfiles") }, returns: v.object({ verification: v.union(storedVerification, v.null()) }), handler: async (ctx, args) => ({ verification: await ctx.db.query("contributorReplicatorVerifications").withIndex("by_profile_id", (q) => q.eq("profile_id", args.profile_id)).unique() }) });
export const getSocialAssetsPage = internalQuery({ args: { entity_kind: replicationSocialAssetValidator.fields.entity_kind, entity_key: v.string(), cursor: v.optional(v.string()), limit: v.number() }, returns: v.object({ items: v.array(storedSocial), ...pageMeta }), handler: async (ctx, args) => { const page = await ctx.db.query("replicationSocialAssets").withIndex("by_entity_kind_and_entity_key", (q) => q.eq("entity_kind", args.entity_kind).eq("entity_key", args.entity_key)).paginate({ cursor: args.cursor ?? null, numItems: Math.min(Math.max(Math.floor(args.limit), 1), 8) }); return { items: page.page, cursor: page.isDone ? null : page.continueCursor, isDone: page.isDone, hasMore: !page.isDone }; } });
export const getOperation = internalQuery({ args: { operation_id: v.string() }, returns: v.union(storedOperation, v.null()), handler: async (ctx, args) => await ctx.db.query("replicationIdentitySocialOperations").withIndex("by_operation_id", (q) => q.eq("operation_id", args.operation_id)).unique() });
export const getOperationItems = internalQuery({ args: { operation_id: v.string() }, returns: v.array(storedOperationItem), handler: async (ctx, args) => await ctx.db.query("replicationIdentitySocialOperationItems").withIndex("by_batch_operation_id", (q) => q.eq("batch_operation_id", args.operation_id)).take(MAX_BATCH + 1) });
