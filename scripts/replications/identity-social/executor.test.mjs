import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { appendLedger, assertPreviewMatches, batchesAfterCanaries, buildExecutionPlan, digest, indexProfiles, loadLedger, makeBatches, pendingBatches, rollbackManifest, selectCanaries, transformOperation, validatePinnedProfileSnapshot, verifyBaseProjection, verifyDeliveryReceiptSidecar } from "./executor-lib.mjs";

const profiles = indexProfiles([{ profileId: "profile-1", key: "ARTIST" }, { profileId: "profile-2", key: "LOKA" }]);
const base = (kind, target, action, expectedBefore, after = {}, evidence = {}) => {
  const operation = { kind, target, action, expectedBefore, after, evidence };
  operation.expectedBeforeSha256 = digest(expectedBefore);
  operation.operationId = `identity-social:${kind}:${digest({ kind, target, action, expectedBeforeSha256: operation.expectedBeforeSha256, after, evidence }).slice(0,24)}`;
  operation.cas = { expectedBeforeSha256: operation.expectedBeforeSha256, onMismatch: "abort-without-write" };
  return operation;
};
const receipt = (sha) => { const core = { url: `https://media.example/${sha}`, content_sha256: sha, byte_size: 10, http_status: 200, verified_at: 1, verifier: "test" }; return { r2_key: `media/sha256/${sha.slice(0,2)}/${sha}.jpg`, receipt: { ...core, receipt_digest: digest(core) } }; };
const projectionDoc = (items) => {
  const core = { artifactType: "replication-identity-social-local-projection", schemaVersion: 1, target: { convexDeployment: "glad-minnow-656" }, operations: items };
  return { ...core, projectionSha256: digest(core) };
};
const creatorBefore = { replicationId: "rep-1", currentArtist: "Poster", attributionDisposition: null, creditLine: null, sourceHistory: { posterDisplayName: "Poster", posterProfileUrl: null, sourcePostUrl: "https://reddit.test/post", sourceUrl: null, sourceReferences: [], sourceEraArtistDisplayName: "Poster" } };
const operations = [
  base("creator-attribution", { replicationId: "rep-1", slug: "one" }, "preserve-poster-as-creator-no-write", creatorBefore, { creatorDisplayName: "Poster", resolution: "confirmed-current-creator", posterAttribution: creatorBefore.sourceHistory }, { rationale: "Reviewed." }),
  base("replicator-verification", { artistId: "artist", profileKey: "ARTIST" }, "record-reviewed-verification", { profileKey: "ARTIST", displayName: "Artist", verificationStatus: "unverified", aliases: [], profileLinks: [] }, { verifiedReplicator: true, verdict: "verified-replicator", reviewTrail: [{ rationale: "Work is attributable." }] }, { workCount: 2, sourceSheetBatch: 1 }),
  base("profile-alias", { profileKey: "LOKA", alias: "old" }, "add-alias-preserve-source-history", { currentState: "canonical profile exists; alias absent", normalizedAliasOwners: 0, collisionAuditProfileSnapshotCount: 2 }, {}, { identityConclusion: "Owner-confirmed rename." }),
  base("profile-avatar", { profileKey: "ARTIST" }, "propose-reviewed-avatar", { currentAvatarSha256: null, currentAvatarUrl: null, currentAvatarProvenance: "none" }, { derivativeSha256: "a".repeat(64), sourcePage: "https://profile.example/a" }, { rationale: "Controlled profile." }),
  base("social-asset", { entityType: "replications", entityKey: "rep-1" }, "upsert-generated-social-asset-metadata", null, { sha256: "b".repeat(64) }),
];
const context = (receipts = {}) => ({ profiles, receipts, receiptSidecarDigest: null, expectedProjectionDigest: "f".repeat(64), attributionDates: { "rep-1": { poster_posted_at: 2 } }, creatorProof: {}, replicationIds: { "rep-1": "rep-1" } });

test("transforms every operation kind", () => {
  const receipts = { [operations[3].operationId]: receipt("a".repeat(64)), [operations[4].operationId]: receipt("b".repeat(64)) };
  assert.deepEqual(operations.map((x) => transformOperation(x, context(receipts)).entry.kind), ["attribution", "verification", "alias", "avatar", "social-asset"]);
});
test("receipt absence creates explicit no-writes", () => {
  assert.equal(transformOperation(operations[3], context()).reason, "verified-delivery-receipt-required");
  assert.equal(transformOperation(operations[4], context()).reason, "verified-delivery-receipt-required");
});
test("creator reassignment requires an attributable earlier exact original", () => {
  const candidate = structuredClone(operations[0]);
  candidate.action = "set-proven-creator-with-verified-chronology";
  candidate.after.creatorDisplayName = "Someone Else";
  assert.equal(transformOperation(candidate, context()).reason, "typed-creator-chronology-invalid");
  candidate.after.originalPublishedAt = 1; candidate.after.posterPostedAt = 2; candidate.after.sourceDigest = digest({ exact: "earlier-original" });
  candidate.evidence = { sources: [{ url: "https://creator.example/original", authority: "creator-controlled-or-attributable-original", finding: "Earlier exact original." }] };
  const result = transformOperation(candidate, context());
  assert.equal(result.entry.value.creator_determination, "proven-different-creator");
  assert.equal(result.entry.value.poster_posted_at, 2); assert.equal(result.entry.value.source_digest, candidate.after.sourceDigest);
});
test("batches stay bounded and canaries cover every class", () => {
  const receipts = { [operations[3].operationId]: receipt("a".repeat(64)), [operations[4].operationId]: receipt("b".repeat(64)) };
  const projection = projectionDoc(operations);
  const plan = buildExecutionPlan(projection, { ...context(receipts), expectedProjectionDigest: projection.projectionSha256 });
  assert.ok(plan.batches.every((x) => x.entries.length <= 50 && x.bytes <= 512000));
  assert.deepEqual(selectCanaries(plan.batches).map((x) => x.kind), ["attribution", "alias", "avatar", "verification", "social-asset"]);
  const canaryIds = new Set(selectCanaries(plan.batches).flatMap((x) => x.entries.map((e) => e.item_operation_id)));
  assert.ok(batchesAfterCanaries(plan.batches).flatMap((x) => x.entries).every((x) => !canaryIds.has(x.item_operation_id)));
});
test("resume requires verified readback", () => {
  const file = path.join(mkdtempSync(path.join(tmpdir(), "identity-ledger-")), "ledger.jsonl");
  const batches = makeBatches([transformOperation(operations[0], context()).entry]);
  appendLedger(file, { event: "batch-applied", operation_id: batches[0].operation_id }); assert.equal(pendingBatches(batches, loadLedger(file)).length, 1);
  appendLedger(file, { event: "batch-readback-verified", operation_id: batches[0].operation_id }); assert.equal(pendingBatches(batches, loadLedger(file)).length, 0);
});
test("CAS mismatch aborts", () => {
  const entry = transformOperation(operations[0], context()).entry;
  assert.throws(() => assertPreviewMatches(entry, { matches: false, digest: "0".repeat(64) }), /CAS mismatch/);
  assert.doesNotThrow(() => assertPreviewMatches(entry, { matches: true, digest: digest(creatorBefore) }));
});
test("poster preservation is journaled without invented chronology", () => {
  const result = transformOperation(operations[0], { ...context(), attributionDates: {} });
  assert.equal(result.disposition, "actionable");
  assert.equal(result.entry.value.poster_posted_at, undefined);
  const projection = projectionDoc([operations[0]]);
  const plan = buildExecutionPlan(projection, { ...context(), attributionDates: {}, expectedProjectionDigest: projection.projectionSha256 });
  assert.equal(plan.entries.length, 1);
});
test("an unresolved obvious signal preserves the poster and remains research-marked", () => {
  const unresolved = structuredClone(operations[0]);
  unresolved.after.resolution = "unresolved";
  const result = transformOperation(unresolved, { ...context(), attributionDates: {} });
  assert.equal(result.entry.value.creator_display_name, result.entry.value.poster_display_name);
  assert.equal(result.entry.value.creator_determination, "unresolved");
  assert.equal(result.entry.value.review_status, "obvious-conflict-needs-research");
  assert.equal(result.entry.value.poster_posted_at, undefined);
});
test("blocked and preservation alias actions remain journal submissions", () => {
  const blocked = structuredClone(operations[2]);
  blocked.action = "blocked-merge-required-collision";
  const result = transformOperation(blocked, context());
  assert.equal(result.disposition, "journal-only");
  assert.equal(result.entry.projection.action, "blocked-merge-required-collision");
});
test("profile creates bind their dependent verification atomically and unresolved decisions remain journal-only", () => {
  const verification = base("replicator-verification", { artistId: "new-artist", profileKey: null }, "record-reviewed-verification", { profileKey: null, displayName: "New Artist", verificationStatus: "unbound", aliases: [], profileLinks: [] }, { verifiedReplicator: true, verdict: "verified-replicator", reviewTrail: [{ rationale: "Exact work credit." }] }, { workCount: 1, sourceSheetBatch: 3 });
  const dependency = { verificationOperationId: verification.operationId, verdict: "verified-replicator", verifiedReplicator: true, sequencing: "profile-create-or-bind-must-succeed-before-verification-write" };
  const create = base("profile-binding", { artistId: "new-artist", profileKey: "NEWARTIST" }, "create-profile-then-bind-verification", { fullProductionProfileSetSha256: "a".repeat(64), expectedProfileCount: 2119, profileKey: "NEWARTIST", existingProfile: null, currentVerificationProfileKey: null }, { profile: { profileKey: "NEWARTIST", displayName: "New Artist", aliases: [], links: [] }, verificationDependency: dependency }, {});
  const unresolved = base("profile-binding", { artistId: "unknown", profileKey: null }, "preserve-unresolved-profile-binding-no-write", { fullProductionProfileSetSha256: "a".repeat(64), expectedProfileCount: 2119, currentVerificationProfileKey: null }, { profileKey: null, verificationDependency: { ...dependency, verificationOperationId: verification.operationId, sequencing: "verification-remains-unbound-no-write" } }, {});
  const projection = projectionDoc([verification, create, unresolved]);
  const plan = buildExecutionPlan(projection, { ...context(), expectedProjectionDigest: projection.projectionSha256 });
  const bindingEntries = plan.entries.filter((entry) => entry.kind === "profile-binding");
  assert.equal(bindingEntries.length, 2);
  assert.equal(bindingEntries[0].decision, "create");
  assert.equal(bindingEntries[0].verification.status, "verified");
  assert.deepEqual(bindingEntries[0].profile, { display_name: "New Artist", aliases: [], links: [] });
  assert.equal(bindingEntries[1].decision, "unresolved");
  assert.equal(bindingEntries[1].verification, undefined);
  assert.ok(plan.noWrites.some((item) => item.reason === "verification-submitted-with-profile-binding"));
});
test("48 profile bindings use execution-safe batches and resume after a one-item canary", () => {
  const entries = Array.from({ length: 48 }, (_, index) => ({ kind: "profile-binding", item_operation_id: `binding-${index}`, projection: {}, artist_id: `artist-${index}` }));
  const batches = makeBatches(entries);
  assert.deepEqual(batches.map((batch) => batch.entries.length), [10, 10, 10, 10, 8]);
  const canaries = selectCanaries(batches);
  assert.equal(canaries[0].entries.length, 1);
  assert.deepEqual(batchesAfterCanaries(batches, canaries).map((batch) => batch.entries.length), [10, 10, 10, 10, 7]);
});
test("rollback order is reverse application order", () => assert.deepEqual(rollbackManifest([{ operation_id: "one" }, { operation_id: "two" }]).map((x) => x.rollback_of), ["two", "one"]));
test("identity ambiguity fails closed", () => assert.throws(() => indexProfiles([{ profileId: "one", key: "A" }, { profileId: "two", key: "a" }]), /ambiguity/));
test("stale or incomplete profile snapshots fail before planning", () => assert.throws(() => validatePinnedProfileSnapshot({ profiles: [{ profileId: "one", key: "A" }] }), /exactly 2,119/));

test("two-phase receipt sidecar binds independently without changing operation IDs", () => {
  const projection = projectionDoc(operations); const operationIds = projection.operations.map((item) => item.operationId);
  assert.equal(verifyBaseProjection(projection, projection.projectionSha256), projection.projectionSha256);
  const receipts = { [operations[3].operationId]: receipt("a".repeat(64)), [operations[4].operationId]: receipt("b".repeat(64)) };
  for (const [operationId, wrapper] of Object.entries(receipts)) Object.assign(wrapper, { operation_id: operationId, projection_sha256: projection.projectionSha256 });
  const sidecarCore = { artifactType: "identity-social-production-delivery-receipt-sidecar", schemaVersion: 2, baseProjectionSha256: projection.projectionSha256, baseProjectionOperationCount: projection.operations.length, verifier: "test", counts: { receipts: 2 }, receipts };
  const sidecar = { ...sidecarCore, receiptSidecarSha256: digest(sidecarCore) };
  const verified = verifyDeliveryReceiptSidecar(projection, sidecar, sidecar.receiptSidecarSha256);
  const plan = buildExecutionPlan(projection, { ...context(verified.receipts), expectedProjectionDigest: projection.projectionSha256, receiptSidecarDigest: verified.receiptSidecarSha256 });
  assert.equal(plan.receipt_sidecar_digest, sidecar.receiptSidecarSha256);
  assert.deepEqual(projection.operations.map((item) => item.operationId), operationIds);
  const tampered = structuredClone(sidecar); tampered.receipts[operations[3].operationId].projection_sha256 = "0".repeat(64);
  assert.throws(() => verifyDeliveryReceiptSidecar(projection, tampered, sidecar.receiptSidecarSha256), /sidecar digest mismatch/);
});
