import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Id } from "@server/postgres/runtime/dataModel";
import type { MutationCtx, QueryCtx } from "@server/postgres/runtime/server";
import {
  applyIdentitySocialBatchHandler, applyProfileBindingBatchHandler, assertCreatedProfileHasNoRollbackReferences, canonicalBeforeForEntry, canonicalDigest, exportPinnedProfileSnapshotPageHandler,
  materializeIdentityTokenSnapshotHandler, reconcileAppliedProfileBindingBatchHandler, rollbackIdentitySocialOperationHandler, rollbackProfileBindingOperationHandler, validateIdentitySocialBatch,
} from "../../server/replicationIdentitySocial";
import type { IdentitySocialBatchEntry, ProfileBindingEntry } from "../../server/lib/replicationIdentitySocialValidators";

const RID = "k570001ahn17r642ptx0pr4hps8dgg0s" as Id<"replications">;
const PID = "j570001ahn17r642ptx0pr4hps8dgg0s" as Id<"contributorProfiles">;
const OTHER_PID = "j570001ahn17r642ptx0pr4hps8dgg0t" as Id<"contributorProfiles">;
const DIGEST = "a".repeat(64);
const OTHER = "b".repeat(64);
const TOKEN = "identity-social-test-token";
const ACTOR = "editor@example.test";
const POST_URL = "https://www.reddit.com/r/replications/comments/example/post/";
const PROFILE_URL = "https://www.reddit.com/user/ExamplePoster/";
const FULL_ALIAS_SNAPSHOT = "aea1bbeac1ce5a10e7e3a0981af17b40909c13ecf04fcf49299bbb32f66c2d8d";

async function projection(kind: "creator-attribution" | "replicator-verification" | "profile-alias" | "profile-avatar" | "social-asset", target: unknown, expectedBefore: unknown, after: unknown, action = "test-action", evidence: unknown = {}) {
  const expectedBeforeSha256 = await canonicalDigest(expectedBefore);
  const core = { kind, target, action, expectedBeforeSha256, after, evidence };
  return {
    operationId: `identity-social:${kind}:${(await canonicalDigest(core)).slice(0, 24)}`,
    value: { kind, target, action, expectedBefore, expectedBeforeSha256, after, evidence },
  };
}

function targetFor(entry: IdentitySocialBatchEntry) {
  if (entry.kind === "attribution") return { kind: "attribution", replication_id: entry.value.replication_id };
  if (entry.kind === "alias") return { kind: "alias", profile_id: entry.value.profile_id, normalized_alias: entry.value.normalized_alias };
  if (entry.kind === "avatar") return { kind: "avatar", profile_id: entry.value.profile_id, media_digest: entry.value.media_digest };
  if (entry.kind === "verification") return { kind: "verification", profile_id: entry.value.profile_id };
  return { kind: "social-asset", entity_kind: entry.value.entity_kind, entity_key: entry.value.entity_key, variant: entry.value.variant };
}

async function bindItemId(entry: IdentitySocialBatchEntry) {
  entry.base_projection_digest = DIGEST;
  entry.receipt_sidecar_digest = null;
  entry.item_operation_id = `identity-social-item:v1:${(await canonicalDigest({ schemaVersion: 1, projection: entry.projection, target: targetFor(entry), value: entry.value, ...(entry.kind === "alias" ? { identity_snapshot_digest: entry.identity_snapshot_digest } : {}), ...(entry.satisfied_item_operation_ids ? { satisfied_item_operation_ids: entry.satisfied_item_operation_ids } : {}), base_projection_digest: entry.base_projection_digest, receipt_sidecar_digest: entry.receipt_sidecar_digest })).slice(0, 24)}`;
  return entry;
}

const sourceHistory = {
  posterDisplayName: "ExamplePoster", posterProfileUrl: PROFILE_URL, sourcePostUrl: POST_URL,
  sourceUrl: "https://i.redd.it/example.jpg",
  sourceReferences: [{ reference_id: "example:0", post_id: "example", post_url: POST_URL, poster_display_name: "ExamplePoster", poster_profile_url: PROFILE_URL, source_url: "https://i.redd.it/example.jpg", role: "primary" }],
  sourceEraArtistDisplayName: "ExamplePoster",
};
const creatorBefore = { replicationId: RID, currentArtist: "ExamplePoster", attributionDisposition: "poster-as-artist-default", creditLine: null, sourceHistory };

async function attributionEntry(): Promise<IdentitySocialBatchEntry> {
  const p = await projection("creator-attribution", { replicationId: RID, slug: "example" }, creatorBefore, { creatorDisplayName: "ExamplePoster" }, "preserve-poster-as-creator");
  return await bindItemId({
    kind: "attribution", item_operation_id: "pending", expected_operation_id: null, projection: p.value,
    value: {
      replication_id: RID, poster_display_name: "ExamplePoster", poster_profile_id: PID, poster_profile_url: PROFILE_URL,
      poster_posted_at: Date.UTC(2024, 0, 1), creator_display_name: "ExamplePoster", creator_profile_id: PID,
      creator_determination: "poster-presumed-creator", review_status: "reviewed-no-obvious-conflict",
      evidence: [{ kind: "source-post", digest: DIGEST }], source_digest: DIGEST,
    },
  } as IdentitySocialBatchEntry);
}

type Row = Record<string, unknown> & { _id: string; _creationTime: number };
function context(registered = true) {
  const tables: Record<string, Row[]> = {
    memberships: registered ? [{ _id: "m1", _creationTime: 1, email: ACTOR, role: "editor" }] : [],
    contributorProfiles: [{ _id: PID, _creationTime: 1, key: "EXAMPLEPOSTER", displayName: "ExamplePoster", aliases: [], links: [{ label: "Reddit", url: PROFILE_URL }], avatarSha256: DIGEST, avatarUrl: PROFILE_URL, avatarProvenance: "profile-controlled" }],
    replicationSourceAttribution: [{ _id: "source-1", _creationTime: 1, replication_id: RID, disposition: "poster-as-artist-default", poster: { display_name: "ExamplePoster", profile_url: PROFILE_URL }, source_references: sourceHistory.sourceReferences }],
    replicationIdentityAttributions: [], contributorAliasEvidence: [], contributorAvatarHistory: [],
    contributorReplicatorVerifications: [], replicationSocialAssets: [],
    replicationIdentitySocialOperations: [], replicationIdentitySocialOperationItems: [], replicationIdentityProfileBindings: [],
    contributorIdentitySnapshotMaterializations: [{ _id: "snapshot-1", _creationTime: 1, snapshot_digest: FULL_ALIAS_SNAPSHOT, profile_count: 2119, profile_ids_digest: DIGEST, token_count: 2579, operation_id: "seed", created_at: 1 }],
    contributorIdentityTokenSnapshots: [
      { _id: "token-1", _creationTime: 1, snapshot_digest: OTHER, profile_count: 1, normalized_token: "oldhandle", owner_count: 0, owner_profile_ids: [], created_at: 1 },
      { _id: "token-2", _creationTime: 1, snapshot_digest: FULL_ALIAS_SNAPSHOT, profile_count: 2119, normalized_token: "exampleposter", owner_count: 1, owner_profile_ids: [PID], created_at: 1 },
    ],
  };
  const docs = new Map<string, Row>([
    [RID, { _id: RID, _creationTime: 1, slug: "example", artist: "ExamplePoster" }],
    [PID, tables.contributorProfiles[0]],
  ]);
  const writes: string[] = [];
  let serial = 10;
  const matches = (table: string, predicates: Array<[string, unknown]>) => (tables[table] ?? []).filter((row) => predicates.every(([field, value]) => row[field] === value));
  const query = (table: string) => ({
    take: async (count: number) => (tables[table] ?? []).slice(0, count),
    withIndex: (_name: string, apply: (builder: { eq: (field: string, value: unknown) => unknown }) => unknown) => {
      const predicates: Array<[string, unknown]> = [];
      const builder = { eq(field: string, value: unknown) { predicates.push([field, value]); return builder; } };
      apply(builder);
      return { unique: async () => matches(table, predicates)[0] ?? null, take: async (count: number) => matches(table, predicates).slice(0, count) };
    },
  });
  const ctx = {
    auth: { getUserIdentity: async () => null },
    storage: { getUrl: async (id: string) => id === "valid-storage" ? "https://storage.test/asset.webp" : null },
    db: {
      get: async (id: string) => docs.get(id) ?? null,
      query,
      insert: async (table: string, value: Record<string, unknown>) => { writes.push(`insert:${table}`); const id = `${table}-${serial++}`; (tables[table] ??= []).push({ _id: id, _creationTime: serial, ...value }); return id; },
      replace: async (id: string, value: Record<string, unknown>) => { writes.push(`replace:${id}`); for (const rows of Object.values(tables)) { const i = rows.findIndex((row) => row._id === id); if (i >= 0) rows[i] = { _id: id, _creationTime: rows[i]._creationTime, ...value }; } },
      patch: async (id: string, value: Record<string, unknown>) => { writes.push(`patch:${id}`); const row = docs.get(id); if (!row) throw new Error("missing patch row"); for (const [key, item] of Object.entries(value)) { if (item === undefined) delete row[key]; else row[key] = item; } },
      delete: async (id: string) => { writes.push(`delete:${id}`); for (const rows of Object.values(tables)) { const i = rows.findIndex((row) => row._id === id); if (i >= 0) rows.splice(i, 1); } },
    },
  } as unknown as MutationCtx;
  return { ctx, tables, writes };
}

function applyArgs(entry: IdentitySocialBatchEntry, operation_id = "batch-001") {
  return { apiKey: TOKEN, actor_email: ACTOR, operation_id, kind: entry.kind, dry_run: false, entries: [entry] };
}

async function socialEntry(entity_kind: "replications" | "contributors" | "effects" | "reports", entity_key: string, receiptDigest = "valid"): Promise<IdentitySocialBatchEntry> {
  const url = `https://cdn.example.test/media/${entity_key}.webp`;
  const receiptCore = { url, content_sha256: DIGEST, byte_size: 100, http_status: 200, verified_at: Date.UTC(2026, 7, 31), verifier: "delivery-executor-v1" };
  const receipt_digest = receiptDigest === "valid" ? await canonicalDigest(receiptCore) : OTHER;
  const p = await projection("social-asset", { entityType: entity_kind, entityKey: entity_key }, null, { sha256: DIGEST }, "upsert-generated-social-asset-metadata");
  return await bindItemId({
    kind: "social-asset", item_operation_id: "pending", expected_operation_id: null, projection: p.value,
    value: {
      entity_kind, entity_key, replication_id: entity_kind === "replications" ? RID : undefined,
      variant: "open-graph", public_url: url, width: 1200, height: 630, mime_type: "image/webp",
      media_digest: DIGEST, source_digest: DIGEST, status: "ready", delivery_verification: "verified",
      delivery_verified_at: receiptCore.verified_at, delivery_receipt: { ...receiptCore, receipt_digest },
    },
  } as IdentitySocialBatchEntry);
}

async function aliasEntry(action = "add-alias-preserve-source-history", alias = "OldHandle", expectedBefore: unknown = { currentState: "canonical profile exists; alias absent", normalizedAliasOwners: 0, collisionAuditProfileSnapshotCount: 1 }, identitySnapshotDigest = OTHER) {
  const p = await projection("profile-alias", { profileKey: "EXAMPLEPOSTER", alias }, expectedBefore, { alias, approved: action === "add-alias-preserve-source-history" }, action);
  return await bindItemId({
    kind: "alias", item_operation_id: "pending", expected_operation_id: null, identity_snapshot_digest: identitySnapshotDigest, projection: p.value,
    value: { profile_id: PID, alias, normalized_alias: alias.toLowerCase(), evidence: [{ kind: "editorial-review", digest: DIGEST }] },
  } as IdentitySocialBatchEntry);
}

async function avatarEntry() {
  const expectedBefore = { currentAvatarSha256: DIGEST, currentAvatarUrl: PROFILE_URL, currentAvatarProvenance: "profile-controlled" };
  const publicUrl = "https://cdn.example.test/media/new-avatar.webp";
  const receiptCore = { url: publicUrl, content_sha256: OTHER, byte_size: 200, http_status: 200, verified_at: Date.UTC(2026, 7, 31), verifier: "delivery-executor-v1" };
  const p = await projection("profile-avatar", { profileKey: "EXAMPLEPOSTER" }, expectedBefore, { derivativeSha256: OTHER }, "propose-provenance-improving-avatar-replacement");
  return await bindItemId({
    kind: "avatar", item_operation_id: "pending", expected_operation_id: null, projection: p.value,
    value: {
      profile_id: PID, provenance: "profile-controlled", public_url: publicUrl, source_url: PROFILE_URL,
      media_digest: OTHER, delivery_verification: "verified", delivery_verified_at: receiptCore.verified_at,
      delivery_receipt: { ...receiptCore, receipt_digest: await canonicalDigest(receiptCore) },
      evidence: [{ kind: "profile", reference_url: PROFILE_URL, digest: DIGEST }],
    },
  } as IdentitySocialBatchEntry);
}

describe("replication identity/social Postgres contract", () => {
  beforeEach(() => { process.env.DATA_ADMIN_TOKEN_REPLICATION_MAINTENANCE = TOKEN; process.env.IDENTITY_SOCIAL_TRUSTED_DELIVERY_EXECUTOR = "delivery-executor-v1"; });
  afterEach(() => { delete process.env.DATA_ADMIN_TOKEN_REPLICATION_MAINTENANCE; delete process.env.IDENTITY_SOCIAL_TRUSTED_DELIVERY_EXECUTOR; });

  it("reconstructs the exact creator expected-before shape and digest", async () => {
    const { ctx } = context(); const entry = await attributionEntry();
    const before = await canonicalBeforeForEntry(ctx, entry);
    expect(before).toEqual(creatorBefore);
    expect(await canonicalDigest(before)).toBe(entry.projection.expectedBeforeSha256);
  });

  it("reconstructs verification links/status and avatar SHA/provenance", async () => {
    const { ctx } = context();
    const verifyP = await projection("replicator-verification", { artistId: "example", profileKey: "EXAMPLEPOSTER" }, { profileKey: "EXAMPLEPOSTER", displayName: "ExamplePoster", verificationStatus: "unverified", aliases: [], profileLinks: [{ label: "Reddit", url: PROFILE_URL }] }, {}, "record-reviewed-verification");
    const verification = { kind: "verification", item_operation_id: verifyP.operationId, expected_operation_id: null, projection: verifyP.value, value: { profile_id: PID, status: "verified", basis: "artist-sheet-review", work_count_reviewed: 2, rationale: "reviewed", evidence: [{ kind: "editorial-review", digest: DIGEST }], source_digest: DIGEST } } as IdentitySocialBatchEntry;
    expect(await canonicalBeforeForEntry(ctx, verification)).toMatchObject({ verificationStatus: "unverified", profileLinks: [{ label: "Reddit", url: PROFILE_URL }] });
    const avatarP = await projection("profile-avatar", { profileKey: "EXAMPLEPOSTER" }, { currentAvatarSha256: DIGEST, currentAvatarUrl: PROFILE_URL, currentAvatarProvenance: "profile-controlled" }, {}, "propose-reviewed-avatar");
    const avatar = { kind: "avatar", item_operation_id: avatarP.operationId, expected_operation_id: null, projection: avatarP.value, value: { profile_id: PID, provenance: "profile-controlled", public_url: PROFILE_URL, source_url: PROFILE_URL, media_digest: OTHER, delivery_verification: "pending", evidence: [] } } as IdentitySocialBatchEntry;
    expect(await canonicalBeforeForEntry(ctx, avatar)).toEqual(avatarP.value.expectedBefore);
  });

  it("rejects item IDs not derived from canonical transformed content", async () => {
    const { ctx, writes } = context(); const entry = await attributionEntry(); entry.item_operation_id = "identity-social:creator-attribution:tampered";
    await expect(applyIdentitySocialBatchHandler(ctx, applyArgs(entry))).rejects.toThrow("not derived from canonical transformed content");
    expect(writes).toEqual([]);
  });

  it("requires registered delegated editor auth", async () => {
    const { ctx } = context(false); const entry = await attributionEntry();
    await expect(applyIdentitySocialBatchHandler(ctx, applyArgs(entry))).rejects.toThrow("Registered editor access required");
  });

  it("refuses identity-token materialization unless the exact 2,119-profile snapshot is supplied", async () => {
    const { ctx, writes } = context();
    await expect(materializeIdentityTokenSnapshotHandler(ctx, {
      apiKey: TOKEN, actor_email: ACTOR, operation_id: "seed-test", mode: "seed", dry_run: false,
      snapshot_digest: FULL_ALIAS_SNAPSHOT, profile_ids_digest: DIGEST, profile_ids: [PID], tokens: [],
    })).rejects.toThrow("exactly 2,119 unique profile IDs");
    expect(writes).toEqual([]);
  });

  it("journals unresolved profile binding without creating a profile or verification", async () => {
    const { ctx, tables } = context();
    const expectedBefore = { fullProductionProfileSetSha256: FULL_ALIAS_SNAPSHOT, expectedProfileCount: 2119, currentVerificationProfileKey: null };
    const p = await projection("profile-binding" as never, { artistId: "unresolved-artist", profileKey: null }, expectedBefore, { profileKey: null }, "preserve-unresolved-profile-binding-no-write");
    const core = { schemaVersion: 1, projection: p.value, artist_id: "unresolved-artist", decision: "unresolved", snapshot_digest: FULL_ALIAS_SNAPSHOT, snapshot_profile_count: 2119, profile_key: null, existing_profile_id: null, profile: null, verification: null, base_projection_digest: DIGEST, receipt_sidecar_digest: null };
    const entry = { kind: "profile-binding", item_operation_id: `identity-social-item:v1:${(await canonicalDigest(core)).slice(0, 24)}`, projection: p.value, artist_id: "unresolved-artist", decision: "unresolved", snapshot_digest: FULL_ALIAS_SNAPSHOT, snapshot_profile_count: 2119, base_projection_digest: DIGEST, receipt_sidecar_digest: null } as ProfileBindingEntry;
    await expect(applyProfileBindingBatchHandler(ctx, { apiKey: TOKEN, actor_email: ACTOR, operation_id: "binding-unresolved", dry_run: false, entries: [entry] })).resolves.toMatchObject({ changed: 0, unchanged: 1 });
    expect(tables.contributorProfiles).toHaveLength(1);
    expect(tables.contributorReplicatorVerifications).toHaveLength(0);
    expect(tables.replicationIdentityProfileBindings).toHaveLength(0);
    expect(tables.replicationIdentitySocialOperationItems[0]).toMatchObject({ kind: "profile-binding", changed: false, before: null, after: null });
  });

  it("creates a collision-free profile when the exact snapshot has no token owner", async () => {
    const { ctx, tables } = context();
    const expectedBefore = { fullProductionProfileSetSha256: FULL_ALIAS_SNAPSHOT, expectedProfileCount: 2119, profileKey: "NEWARTIST", existingProfile: null, currentVerificationProfileKey: null };
    const p = await projection("profile-binding" as never, { artistId: "new-artist", profileKey: "NEWARTIST" }, expectedBefore, { profile: { profileKey: "NEWARTIST" } }, "create-profile-then-bind-verification");
    const verification = { status: "verified", basis: "artist-sheet-review", work_count_reviewed: 1, rationale: "Reviewed exact artist sheet.", evidence: [{ kind: "editorial-review", digest: DIGEST }], source_digest: DIGEST };
    const profile = { display_name: "New Artist", aliases: [], links: [] };
    const core = { schemaVersion: 1, projection: p.value, artist_id: "new-artist", decision: "create", snapshot_digest: FULL_ALIAS_SNAPSHOT, snapshot_profile_count: 2119, profile_key: "NEWARTIST", existing_profile_id: null, profile, verification, base_projection_digest: DIGEST, receipt_sidecar_digest: null };
    const entry = { kind: "profile-binding", item_operation_id: `identity-social-item:v1:${(await canonicalDigest(core)).slice(0, 24)}`, projection: p.value, artist_id: "new-artist", decision: "create", snapshot_digest: FULL_ALIAS_SNAPSHOT, snapshot_profile_count: 2119, profile_key: "NEWARTIST", profile, verification, base_projection_digest: DIGEST, receipt_sidecar_digest: null } as ProfileBindingEntry;
    await expect(applyProfileBindingBatchHandler(ctx, { apiKey: TOKEN, actor_email: ACTOR, operation_id: "binding-create", dry_run: false, entries: [entry] })).resolves.toMatchObject({ changed: 1, unchanged: 0 });
    expect(tables.contributorProfiles.some((row) => row.key === "NEWARTIST")).toBe(true);
    expect(tables.replicationIdentityProfileBindings).toHaveLength(1);
    expect(tables.contributorReplicatorVerifications).toHaveLength(1);
  });

  it("reconciles an exact legacy profile-binding item into its canonical batch without rewriting state", async () => {
    const { ctx, tables, writes } = context();
    const expectedBefore = { fullProductionProfileSetSha256: FULL_ALIAS_SNAPSHOT, expectedProfileCount: 2119, existingProfile: { profileId: PID, profileKey: "EXAMPLEPOSTER", displayName: "ExamplePoster" }, currentVerificationProfileKey: null };
    const p = await projection("profile-binding" as never, { artistId: "example-poster", profileKey: "EXAMPLEPOSTER" }, expectedBefore, { profileId: PID, profileKey: "EXAMPLEPOSTER" }, "bind-existing-profile-then-apply-verification");
    const verification = { status: "verified" as const, basis: "artist-sheet-review" as const, work_count_reviewed: 3, rationale: "Reviewed exact artist sheet.", evidence: [{ kind: "editorial-review" as const, digest: DIGEST }], source_digest: DIGEST };
    const core = { schemaVersion: 1, projection: p.value, artist_id: "example-poster", decision: "bind", snapshot_digest: FULL_ALIAS_SNAPSHOT, snapshot_profile_count: 2119, profile_key: "EXAMPLEPOSTER", existing_profile_id: PID, profile: null, verification, base_projection_digest: DIGEST, receipt_sidecar_digest: null };
    const entry = { kind: "profile-binding", item_operation_id: `identity-social-item:v1:${(await canonicalDigest(core)).slice(0, 24)}`, projection: p.value, artist_id: "example-poster", decision: "bind", snapshot_digest: FULL_ALIAS_SNAPSHOT, snapshot_profile_count: 2119, profile_key: "EXAMPLEPOSTER", existing_profile_id: PID, verification, base_projection_digest: DIGEST, receipt_sidecar_digest: null } as ProfileBindingEntry;
    await applyProfileBindingBatchHandler(ctx, { apiKey: TOKEN, actor_email: ACTOR, operation_id: "legacy-small-batch", dry_run: false, entries: [entry] });
    const args = { apiKey: TOKEN, actor_email: ACTOR, operation_id: "canonical-full-batch", dry_run: false, entries: [entry] };
    tables.contributorReplicatorVerifications[0].work_count_reviewed = 999;
    await expect(reconcileAppliedProfileBindingBatchHandler(ctx, args)).rejects.toThrow("verification does not exactly match");
    expect(tables.replicationIdentitySocialOperations.some((row) => row.operation_id === "canonical-full-batch")).toBe(false);
    tables.contributorReplicatorVerifications[0].work_count_reviewed = 3;
    const writesBeforeDryRun = writes.length;
    await expect(reconcileAppliedProfileBindingBatchHandler(ctx, { ...args, dry_run: true })).resolves.toMatchObject({ changed: 0, unchanged: 1, dry_run: true });
    expect(writes).toHaveLength(writesBeforeDryRun);
    const writesBeforeReconcile = writes.length;
    await expect(reconcileAppliedProfileBindingBatchHandler(ctx, args)).resolves.toMatchObject({ changed: 0, unchanged: 1, idempotent_replay: false });
    expect(writes.slice(writesBeforeReconcile)).toEqual(["insert:replicationIdentitySocialOperationItems", "insert:replicationIdentitySocialOperations"]);
    expect(tables.replicationIdentitySocialOperationItems[tables.replicationIdentitySocialOperationItems.length - 1]).toMatchObject({ batch_operation_id: "canonical-full-batch", changed: false, satisfied_item_operation_ids: [entry.item_operation_id] });
    await expect(reconcileAppliedProfileBindingBatchHandler(ctx, args)).resolves.toMatchObject({ changed: 0, unchanged: 1, idempotent_replay: true });

    await expect(rollbackProfileBindingOperationHandler(ctx, { apiKey: TOKEN, actor_email: ACTOR, operation_id: "rollback-canonical-full", rollback_of: "canonical-full-batch", dry_run: false })).resolves.toMatchObject({ changed: 0, unchanged: 1 });
    expect(tables.replicationIdentityProfileBindings).toHaveLength(1);
    expect(tables.contributorReplicatorVerifications).toHaveLength(1);
    expect(tables.replicationIdentitySocialOperationItems[tables.replicationIdentitySocialOperationItems.length - 1]).toMatchObject({ batch_operation_id: "rollback-canonical-full", changed: false });
    await expect(reconcileAppliedProfileBindingBatchHandler(ctx, args)).rejects.toThrow("already rolled back");
  });

  it("fails closed when legacy profile-binding proof is missing, rolled back, or drifted", async () => {
    const { ctx, tables } = context();
    const expectedBefore = { fullProductionProfileSetSha256: FULL_ALIAS_SNAPSHOT, expectedProfileCount: 2119, currentVerificationProfileKey: null };
    const p = await projection("profile-binding" as never, { artistId: "unresolved-artist", profileKey: null }, expectedBefore, { profileKey: null }, "preserve-unresolved-profile-binding-no-write");
    const core = { schemaVersion: 1, projection: p.value, artist_id: "unresolved-artist", decision: "unresolved", snapshot_digest: FULL_ALIAS_SNAPSHOT, snapshot_profile_count: 2119, profile_key: null, existing_profile_id: null, profile: null, verification: null, base_projection_digest: DIGEST, receipt_sidecar_digest: null };
    const entry = { kind: "profile-binding", item_operation_id: `identity-social-item:v1:${(await canonicalDigest(core)).slice(0, 24)}`, projection: p.value, artist_id: "unresolved-artist", decision: "unresolved", snapshot_digest: FULL_ALIAS_SNAPSHOT, snapshot_profile_count: 2119, base_projection_digest: DIGEST, receipt_sidecar_digest: null } as ProfileBindingEntry;
    const args = { apiKey: TOKEN, actor_email: ACTOR, operation_id: "canonical-unresolved", dry_run: false, entries: [entry] };
    await expect(reconcileAppliedProfileBindingBatchHandler(ctx, args)).rejects.toThrow("not proven by an exact source journal");
    await applyProfileBindingBatchHandler(ctx, { ...args, operation_id: "legacy-unresolved" });
    await rollbackProfileBindingOperationHandler(ctx, { apiKey: TOKEN, actor_email: ACTOR, operation_id: "rollback-legacy-unresolved", rollback_of: "legacy-unresolved", dry_run: false });
    await expect(reconcileAppliedProfileBindingBatchHandler(ctx, args)).rejects.toThrow("source operation was rolled back");
    expect(tables.replicationIdentitySocialOperations.some((row) => row.operation_id === "canonical-unresolved")).toBe(false);
  });

  it("atomically binds two reviewed handles to one profile, aggregates verification without double-counting, and rolls back once", async () => {
    const { ctx, tables } = context();
    const expectedBefore = { fullProductionProfileSetSha256: FULL_ALIAS_SNAPSHOT, expectedProfileCount: 2119, existingProfile: { profileId: PID, profileKey: "EXAMPLEPOSTER", displayName: "ExamplePoster" }, currentVerificationProfileKey: null };
    const make = async (artistId: string, count: number, sourceDigest: string) => {
      const p = await projection("profile-binding" as never, { artistId, profileKey: "EXAMPLEPOSTER" }, expectedBefore, { profileId: PID, profileKey: "EXAMPLEPOSTER" }, "bind-existing-profile-then-apply-verification");
      return {
        kind: "profile-binding", item_operation_id: "pending", projection: p.value, artist_id: artistId, decision: "bind",
        snapshot_digest: FULL_ALIAS_SNAPSHOT, snapshot_profile_count: 2119, profile_key: "EXAMPLEPOSTER", existing_profile_id: PID,
        verification: { status: "verified", basis: "artist-sheet-review", work_count_reviewed: count, rationale: `Reviewed ${artistId}.`, evidence: [{ kind: "editorial-review", digest: sourceDigest }], source_digest: sourceDigest },
        base_projection_digest: DIGEST, receipt_sidecar_digest: null,
      } as ProfileBindingEntry;
    };
    const entries = [await make("josie", 2, DIGEST), await make("josikins", 21, OTHER)];
    const ordered = [...entries].sort((a, b) => a.artist_id.localeCompare(b.artist_id));
    const groupDigest = await canonicalDigest({ schemaVersion: 1, profile_key: "EXAMPLEPOSTER", existing_profile_id: PID, snapshot_digest: FULL_ALIAS_SNAPSHOT, contributions: ordered.map((entry) => ({ artist_id: entry.artist_id, verification: entry.verification })) });
    for (const entry of entries) {
      entry.shared_profile_group_digest = groupDigest; entry.shared_profile_group_size = 2;
      const core = { schemaVersion: 2, projection: entry.projection, artist_id: entry.artist_id, decision: entry.decision, snapshot_digest: entry.snapshot_digest, snapshot_profile_count: entry.snapshot_profile_count, profile_key: entry.profile_key, existing_profile_id: entry.existing_profile_id, profile: null, verification: entry.verification, shared_profile_group_digest: groupDigest, shared_profile_group_size: 2, base_projection_digest: DIGEST, receipt_sidecar_digest: null };
      entry.item_operation_id = `identity-social-item:v2:${(await canonicalDigest(core)).slice(0, 24)}`;
    }
    await expect(applyProfileBindingBatchHandler(ctx, { apiKey: TOKEN, actor_email: ACTOR, operation_id: "binding-shared", dry_run: false, entries })).resolves.toMatchObject({ changed: 2, unchanged: 0 });
    expect(tables.replicationIdentityProfileBindings.map((row) => row.artist_id).sort()).toEqual(["josie", "josikins"]);
    expect(tables.contributorReplicatorVerifications).toHaveLength(1);
    expect(tables.contributorReplicatorVerifications[0]).toMatchObject({ status: "verified", work_count_reviewed: 21 });
    expect((tables.contributorReplicatorVerifications[0].review_contributions as unknown[])).toHaveLength(2);
    expect(tables.replicationIdentitySocialOperationItems.filter((row) => row.verification_after)).toHaveLength(1);
    const reconciliationArgs = { apiKey: TOKEN, actor_email: ACTOR, operation_id: "binding-shared-canonical-receipt", dry_run: false, entries };
    tables.contributorReplicatorVerifications[0].work_count_reviewed = 20;
    await expect(reconcileAppliedProfileBindingBatchHandler(ctx, reconciliationArgs)).rejects.toThrow("verification does not exactly match");
    tables.contributorReplicatorVerifications[0].work_count_reviewed = 21;
    await expect(reconcileAppliedProfileBindingBatchHandler(ctx, reconciliationArgs)).resolves.toMatchObject({ changed: 0, unchanged: 2, idempotent_replay: false });
    const reconciled = tables.replicationIdentitySocialOperationItems.filter((row) => row.batch_operation_id === reconciliationArgs.operation_id);
    expect(reconciled).toHaveLength(2);
    expect(reconciled.filter((row) => row.verification_after)).toHaveLength(1);
    expect(tables.contributorReplicatorVerifications[0]).toMatchObject({ status: "verified", work_count_reviewed: 21 });
    await expect(reconcileAppliedProfileBindingBatchHandler(ctx, reconciliationArgs)).resolves.toMatchObject({ changed: 0, unchanged: 2, idempotent_replay: true });
    await expect(rollbackProfileBindingOperationHandler(ctx, { apiKey: TOKEN, actor_email: ACTOR, operation_id: "rollback-binding-shared-canonical-receipt", rollback_of: reconciliationArgs.operation_id, dry_run: false })).resolves.toMatchObject({ changed: 0, unchanged: 2 });
    expect(tables.contributorReplicatorVerifications[0]).toMatchObject({ status: "verified", work_count_reviewed: 21 });
    await expect(rollbackProfileBindingOperationHandler(ctx, { apiKey: TOKEN, actor_email: ACTOR, operation_id: "rollback-shared", rollback_of: "binding-shared", dry_run: false })).resolves.toMatchObject({ changed: 2, unchanged: 0 });
    expect(tables.replicationIdentityProfileBindings).toHaveLength(0);
    expect(tables.contributorReplicatorVerifications).toHaveLength(0);
  });

  it("reconciles an applied binding review with a standalone review, journals both as satisfied, replays, and rolls back exactly", async () => {
    const { ctx, tables } = context();
    const bindingItemId = "identity-social-item:v1:fa5b634cc4756ac898c93983";
    const standaloneItemId = "identity-social-item:v1:223f8f21e4c53911dcfbfcf6";
    tables.contributorReplicatorVerifications.push({
      _id: "verification-existing", _creationTime: 2, profile_id: PID, status: "verified", basis: "artist-sheet-review",
      work_count_reviewed: 1, rationale: "Reviewed sean-allum.", evidence: [{ kind: "editorial-review", digest: DIGEST }],
      source_digest: DIGEST, operation_id: bindingItemId, reviewed_at: 2,
    });
    const expectedBefore = { profileKey: "EXAMPLEPOSTER", displayName: "ExamplePoster", verificationStatus: "verified-replicator", aliases: [], profileLinks: [{ label: "Reddit", url: PROFILE_URL }] };
    const contributions = [
      { artist_id: "eloh-projects", status: "not-verified" as const, basis: "artist-sheet-review" as const, work_count_reviewed: 8, rationale: "Reviewed ELOH sheet.", evidence: [{ kind: "editorial-review" as const, digest: OTHER }], source_digest: OTHER },
      { artist_id: "sean-allum", status: "verified" as const, basis: "artist-sheet-review" as const, work_count_reviewed: 1, rationale: "Reviewed Sean sheet.", evidence: [{ kind: "editorial-review" as const, digest: DIGEST }], source_digest: DIGEST },
    ];
    const p = await projection("replicator-verification", { artistId: "eloh-projects", profileKey: "EXAMPLEPOSTER" }, expectedBefore, {}, "reconcile-shared-profile-verification", { reconciliation: "cross-kind-shared-profile", contributingItemOperationIds: [standaloneItemId, bindingItemId].sort() });
    const entry = await bindItemId({
      kind: "verification", item_operation_id: "pending", expected_operation_id: bindingItemId, projection: p.value,
      satisfied_item_operation_ids: [standaloneItemId, bindingItemId].sort(),
      value: {
        profile_id: PID, status: "verified", basis: "artist-sheet-review", work_count_reviewed: 8,
        rationale: contributions.map((item) => `[${item.artist_id}] ${item.rationale}`).join("\n\n"),
        evidence: contributions.flatMap((item) => item.evidence), source_digest: await canonicalDigest({ schemaVersion: 1, contributions }), review_contributions: contributions,
      },
    } as IdentitySocialBatchEntry);
    const args = applyArgs(entry, "reconcile-eloh");
    await expect(applyIdentitySocialBatchHandler(ctx, args)).resolves.toMatchObject({ changed: 1, idempotent_replay: false });
    expect(tables.contributorReplicatorVerifications[0]).toMatchObject({ status: "verified", work_count_reviewed: 8, operation_id: entry.item_operation_id });
    expect(tables.replicationIdentitySocialOperationItems[0]).toMatchObject({ satisfied_item_operation_ids: [standaloneItemId, bindingItemId].sort() });
    await expect(applyIdentitySocialBatchHandler(ctx, args)).resolves.toMatchObject({ changed: 1, idempotent_replay: true });
    await expect(rollbackIdentitySocialOperationHandler(ctx, { apiKey: TOKEN, actor_email: ACTOR, operation_id: "rollback-eloh", rollback_of: "reconcile-eloh", dry_run: false })).resolves.toMatchObject({ changed: 1 });
    expect(tables.contributorReplicatorVerifications[0]).toMatchObject({ status: "verified", work_count_reviewed: 1, operation_id: expect.stringContaining("identity-social:rollback:") });
  });

  it("blocks created-profile rollback when a contributor social asset references its key", async () => {
    const { ctx, tables } = context();
    tables.replicationSocialAssets.push({ _id: "social-profile", _creationTime: 2, entity_kind: "contributors", entity_key: "EXAMPLEPOSTER" });
    await expect(assertCreatedProfileHasNoRollbackReferences(ctx, PID, "EXAMPLEPOSTER")).rejects.toThrow("unrelated references");
  });

  it("exports at most 100 profiles without scanning or materializing the full table", async () => {
    const rows = Array.from({ length: 100 }, (_, index) => ({ _id: `profile-${index}`, _creationTime: index, key: `KEY${index}`, displayName: `Person ${index}`, aliases: [], bio: "", links: [], createdAt: "now", updatedAt: "now" }));
    let paginateCalls = 0;
    const ctx = {
      storage: { getUrl: async () => null },
      db: { query: () => ({
        take: async () => { throw new Error("full-table take must not be called"); },
        paginate: async ({ numItems }: { numItems: number }) => { paginateCalls += 1; expect(numItems).toBe(100); return { page: rows, isDone: false, continueCursor: "next" }; },
      }) },
    } as unknown as QueryCtx;
    const page = await exportPinnedProfileSnapshotPageHandler(ctx, { limit: 500 });
    expect(page.profiles).toHaveLength(100);
    expect(page.cursor).toBe("next");
    expect(paginateCalls).toBe(1);
  });

  it("journals unchanged poster preservation and replays after target verification", async () => {
    const { ctx, tables } = context(); const entry = await attributionEntry();
    if (entry.kind !== "attribution") throw new Error("Test fixture must be an attribution entry.");
    delete entry.value.poster_posted_at;
    await bindItemId(entry);
    await expect(applyIdentitySocialBatchHandler(ctx, applyArgs(entry))).resolves.toMatchObject({ changed: 0, unchanged: 1 });
    expect(tables.replicationIdentitySocialOperations[0]).not.toHaveProperty("changes");
    expect(tables.replicationIdentitySocialOperationItems).toHaveLength(1);
    expect(tables.replicationIdentitySocialOperationItems[0]).toMatchObject({ target: { kind: "attribution", replication_id: RID }, before: null, after: null, changed: false });
    expect(tables.replicationIdentityAttributions).toHaveLength(0);
    await expect(applyIdentitySocialBatchHandler(ctx, applyArgs(entry))).resolves.toMatchObject({ idempotent_replay: true });
  });

  it("reserves and replay-verifies unchanged item operations", async () => {
    const { ctx, tables } = context(); const entry = await attributionEntry();
    tables.replicationIdentityAttributions.push({ _id: "a1", _creationTime: 2, ...entry.value, operation_id: "prior-item", updated_at: 1 });
    entry.expected_operation_id = "prior-item";
    await expect(applyIdentitySocialBatchHandler(ctx, applyArgs(entry, "batch-unchanged"))).resolves.toMatchObject({ changed: 0, unchanged: 1 });
    expect(tables.replicationIdentitySocialOperationItems[0]).toMatchObject({ changed: false, item_operation_id: entry.item_operation_id });
    tables.replicationIdentityAttributions[0].creator_display_name = "drift";
    await expect(applyIdentitySocialBatchHandler(ctx, applyArgs(entry, "batch-unchanged"))).rejects.toThrow("target state has drifted");
  });

  it("rejects a mismatched executor delivery receipt", async () => {
    const { ctx, writes } = context(); const entry = await socialEntry("contributors", "example", "invalid");
    await expect(applyIdentitySocialBatchHandler(ctx, applyArgs(entry, "social-batch"))).rejects.toThrow("receipt digest is invalid");
    expect(writes).toEqual([]);
  });

  it("supports social metadata for all four projected entity kinds", async () => {
    for (const kind of ["replications", "contributors", "effects", "reports"] as const) {
      const entry = await socialEntry(kind, `${kind}-example`);
      expect(() => validateIdentitySocialBatch("social-asset", [entry], "batch")).not.toThrow();
    }
  });

  it("transactionally adds a public alias, journals the exact prior array, and restores it", async () => {
    const { ctx, tables } = context(); const entry = await aliasEntry();
    await applyIdentitySocialBatchHandler(ctx, applyArgs(entry, "alias-batch"));
    expect(tables.contributorProfiles[0].aliases).toEqual(["oldhandle"]);
    expect(tables.contributorAliasEvidence).toHaveLength(1);
    expect(tables.replicationIdentitySocialOperationItems[0]).toMatchObject({
      profile_before: { kind: "alias-profile", aliases: [] },
      profile_after: { kind: "alias-profile", aliases: ["oldhandle"] },
    });
    await rollbackIdentitySocialOperationHandler(ctx, { apiKey: TOKEN, actor_email: ACTOR, operation_id: "alias-rollback", rollback_of: "alias-batch", dry_run: false });
    expect(tables.contributorProfiles[0].aliases).toEqual([]);
  });

  it("journals preserve-existing and blocked alias decisions without profile/evidence writes", async () => {
    const { ctx, tables, writes } = context();
    tables.contributorProfiles[0].aliases = ["existing"];
    tables.contributorIdentityTokenSnapshots.push({ _id: "token-existing", _creationTime: 2, snapshot_digest: OTHER, profile_count: 1, normalized_token: "existing", owner_count: 1, owner_profile_ids: [PID], created_at: 1 });
    const preserve = await aliasEntry("preserve-existing-alias", "existing", { currentState: "alias already present as existing", normalizedAliasOwners: 1, collisionAuditProfileSnapshotCount: 1 });
    await applyIdentitySocialBatchHandler(ctx, applyArgs(preserve, "alias-preserve"));
    expect(tables.contributorAliasEvidence).toHaveLength(0);
    expect(tables.replicationIdentitySocialOperationItems[0]).toMatchObject({ changed: false });
    expect(writes.some((item) => item.startsWith("patch:"))).toBe(false);

    tables.contributorIdentityTokenSnapshots.push({ _id: "token-blocked", _creationTime: 3, snapshot_digest: OTHER, profile_count: 1, normalized_token: "candidate", owner_count: 0, owner_profile_ids: [], created_at: 1 });
    const blockedBefore = { currentState: "strong name correction exists; alias absent", normalizedAliasOwners: null, collisionAuditProfileSnapshotCount: null };
    const blocked = await aliasEntry("blocked-pending-owner-review", "candidate", blockedBefore);
    await applyIdentitySocialBatchHandler(ctx, applyArgs(blocked, "alias-blocked"));
    expect(tables.contributorAliasEvidence).toHaveLength(0);
    expect(tables.replicationIdentitySocialOperationItems[1]).toMatchObject({ changed: false });
  });

  it("refuses alias-only merging across profiles and journals an explicit blocked merge decision", async () => {
    const { ctx, tables } = context();
    tables.contributorIdentityTokenSnapshots.push({
      _id: "token-full-audit", _creationTime: 4, snapshot_digest: FULL_ALIAS_SNAPSHOT,
      profile_count: 2119, normalized_token: "wheresuede", owner_count: 1,
      owner_profile_ids: [OTHER_PID], created_at: Date.UTC(2026, 7, 31),
    });
    const expectedBefore = {
      currentState: "separate contributor profile requires a lossless profile merge",
      normalizedAliasOwners: 1,
      collisionAuditProfileSnapshotCount: 2119,
    };
    const add = await aliasEntry("add-alias-preserve-source-history", "wheresuede", expectedBefore, FULL_ALIAS_SNAPSHOT);
    await expect(applyIdentitySocialBatchHandler(ctx, applyArgs(add, "unsafe-alias-add"))).rejects.toThrow("separate profile requiring merge review");
    expect(tables.contributorAliasEvidence).toHaveLength(0);

    const blocked = await aliasEntry("blocked-merge-required-collision", "wheresuede", expectedBefore, FULL_ALIAS_SNAPSHOT);
    await expect(applyIdentitySocialBatchHandler(ctx, applyArgs(blocked, "blocked-profile-merge"))).resolves.toMatchObject({ changed: 0, unchanged: 1 });
    expect(tables.contributorAliasEvidence).toHaveLength(0);
    expect(tables.replicationIdentitySocialOperationItems[0]).toMatchObject({ changed: false });
  });

  it("transactionally projects a public avatar and restores every prior avatar field", async () => {
    const { ctx, tables } = context(); const entry = await avatarEntry();
    await applyIdentitySocialBatchHandler(ctx, applyArgs(entry, "avatar-batch"));
    expect(tables.contributorProfiles[0]).toMatchObject({ avatarUrl: "https://cdn.example.test/media/new-avatar.webp", avatarSha256: OTHER, avatarProvenance: "profile-controlled" });
    expect(tables.replicationIdentitySocialOperationItems[0]).toMatchObject({
      profile_before: { avatarUrl: PROFILE_URL, avatarSha256: DIGEST, avatarProvenance: "profile-controlled" },
      profile_after: { avatarUrl: "https://cdn.example.test/media/new-avatar.webp", avatarSha256: OTHER, avatarProvenance: "profile-controlled" },
    });
    await rollbackIdentitySocialOperationHandler(ctx, { apiKey: TOKEN, actor_email: ACTOR, operation_id: "avatar-rollback", rollback_of: "avatar-batch", dry_run: false });
    expect(tables.contributorProfiles[0]).toMatchObject({ avatarUrl: PROFILE_URL, avatarSha256: DIGEST, avatarProvenance: "profile-controlled" });
  });

  it("accepts the supported replacement action used by owner-directed avatar restoration during server dry-run", async () => {
    const { ctx, writes } = context();
    const entry = await avatarEntry();
    expect(entry.projection.action).toBe("propose-provenance-improving-avatar-replacement");
    await expect(applyIdentitySocialBatchHandler(ctx, { ...applyArgs(entry, "avatar-owner-restore-dry-run"), dry_run: true }))
      .resolves.toMatchObject({ changed: 1, dry_run: true });
    expect(writes).toEqual([]);
  });

  it("rolls back a journal-only preservation as a durable no-op", async () => {
    const { ctx, tables } = context(); const entry = await attributionEntry();
    await applyIdentitySocialBatchHandler(ctx, applyArgs(entry));
    const args = { apiKey: TOKEN, actor_email: ACTOR, operation_id: "rollback-001", rollback_of: "batch-001", dry_run: false };
    await expect(rollbackIdentitySocialOperationHandler(ctx, args)).resolves.toMatchObject({ changed: 0, unchanged: 1 });
    expect(tables.replicationIdentityAttributions).toHaveLength(0);
  });

  it("keeps maximum batches in separate bounded journal documents", async () => {
    const { ctx, tables } = context();
    const entries = await Promise.all(Array.from({ length: 50 }, (_, index) => socialEntry("contributors", `person-${index}`)));
    await expect(applyIdentitySocialBatchHandler(ctx, { apiKey: TOKEN, actor_email: ACTOR, operation_id: "batch-max-50", kind: "social-asset", dry_run: false, entries })).resolves.toMatchObject({ changed: 50 });
    expect(tables.replicationIdentitySocialOperationItems).toHaveLength(50);
    expect(tables.replicationIdentitySocialOperations[0]).not.toHaveProperty("changes");
    const extra = await socialEntry("contributors", "person-50");
    expect(() => validateIdentitySocialBatch("social-asset", [...entries, extra], "too-large")).toThrow("limited to 1 to 50");
  });
});
