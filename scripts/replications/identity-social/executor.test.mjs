import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { isTransientDataTransportError, parseArgs, runBatchWithTransportRecovery, runQueryWithTransportRecovery } from "./executor.mjs";
import { appendLedger, assertPreviewMatches, batchesAfterCanaries, bindSharedProfileGroups, buildExecutionPlan, completedBatchesForRollback, digest, indexProfiles, loadLedger, makeBatches, pendingBatches, reconcileCrossKindSharedProfileVerifications, rollbackManifest, selectCanaries, transformOperation, validatePinnedProfileSnapshot, verifyBaseProjection, verifyDeliveryReceiptSidecar } from "./executor-lib.mjs";

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
test("shared existing-profile bindings receive new immutable group IDs and never split", () => {
  const verification = (count, source) => ({ status: "verified", basis: "artist-sheet-review", work_count_reviewed: count, rationale: source, evidence: [], source_digest: digest(source) });
  const common = { kind: "profile-binding", projection: {}, decision: "bind", snapshot_digest: "a".repeat(64), snapshot_profile_count: 2119, profile_key: "JOSIE", existing_profile_id: "profile-josie", profile: null, base_projection_digest: "b".repeat(64), receipt_sidecar_digest: null };
  const original = [
    { ...common, artist_id: "josie", verification: verification(2, "josie"), item_operation_id: "identity-social-item:v1:historical" },
    { ...common, artist_id: "josikins", verification: verification(21, "josikins"), item_operation_id: "identity-social-item:v1:other" },
  ];
  const grouped = bindSharedProfileGroups(original);
  assert.equal(new Set(grouped.map((entry) => entry.shared_profile_group_digest)).size, 1);
  assert.ok(grouped.every((entry) => entry.shared_profile_group_size === 2 && entry.item_operation_id.startsWith("identity-social-item:v2:")));
  assert.ok(grouped.every((entry) => entry.item_operation_id !== original.find((old) => old.artist_id === entry.artist_id).item_operation_id));
  const batches = makeBatches([{ kind: "profile-binding", artist_id: "before", item_operation_id: "before", projection: {} }, ...grouped]);
  assert.ok(batches.some((batch) => grouped.every((entry) => batch.entries.includes(entry))));
  const groupedFirst = makeBatches([...grouped, { kind: "profile-binding", artist_id: "after", item_operation_id: "after", projection: {} }]);
  assert.deepEqual(selectCanaries(groupedFirst)[0].entries.map((entry) => entry.artist_id), ["josie", "josikins"]);
});
test("cross-kind shared-profile verification reconciles status, count, provenance, and originating item IDs", () => {
  const evidence = (note) => [{ kind: "editorial-review", note, digest: digest({ kind: "editorial-review", note }) }];
  const binding = { kind: "profile-binding", projection: {}, decision: "bind", snapshot_digest: "a".repeat(64), snapshot_profile_count: 2119, profile_key: "ELOHPROJECTS", existing_profile_id: "profile-eloh", artist_id: "sean-allum", item_operation_id: "identity-social-item:v1:fa5b634cc4756ac898c93983", verification: { status: "verified", basis: "artist-sheet-review", work_count_reviewed: 1, rationale: "Sean review", evidence: evidence("Sean sheet"), source_digest: digest("sean") } };
  const operation = base("replicator-verification", { artistId: "eloh-projects", profileKey: "ELOHPROJECTS" }, "record-reviewed-verification", { profileKey: "ELOHPROJECTS", displayName: "ELOH Projects", verificationStatus: "unverified", aliases: [], profileLinks: [] }, { verifiedReplicator: false, verdict: "not-verified", reviewTrail: [{ rationale: "ELOH review" }] }, { workCount: 8, sourceSheetBatch: 7 });
  const transformed = transformOperation(operation, { ...context(), profiles: indexProfiles([{ profileId: "profile-eloh", key: "ELOHPROJECTS" }]) }).entry;
  const standalone = { ...transformed, item_operation_id: "identity-social-item:v1:223f8f21e4c53911dcfbfcf6" };
  const reconciled = reconcileCrossKindSharedProfileVerifications([binding, standalone])[1];
  assert.equal(reconciled.projection.action, "reconcile-shared-profile-verification");
  assert.equal(reconciled.projection.expectedBefore.verificationStatus, "verified-replicator");
  assert.equal(reconciled.expected_operation_id, binding.item_operation_id);
  assert.equal(reconciled.value.status, "verified");
  assert.equal(reconciled.value.work_count_reviewed, 8);
  assert.deepEqual(reconciled.value.review_contributions.map((item) => item.artist_id), ["eloh-projects", "sean-allum"]);
  assert.deepEqual(reconciled.satisfied_item_operation_ids, [standalone.item_operation_id, binding.item_operation_id].sort());
  assert.equal(reconciled.value.source_digest, digest({ schemaVersion: 1, contributions: reconciled.value.review_contributions }));
  assert.ok(reconciled.item_operation_id.startsWith("identity-social-item:v1:"));
});
test("rollback order is reverse application order", () => assert.deepEqual(rollbackManifest([{ operation_id: "one" }, { operation_id: "two" }]).map((x) => x.rollback_of), ["two", "one"]));
test("rollback manifest excludes readback-verified rollbacks, retains replacements, and deduplicates retries", () => {
  const ledger = [
    { event: "batch-readback-verified", operation_id: "josie-singleton" },
    { event: "batch-readback-verified", operation_id: "other" },
    { event: "batch-readback-verified", operation_id: "josie-singleton" },
    { event: "rollback-applied", operation_id: "rollback-josie", rollback_of: "josie-singleton" },
    { event: "rollback-readback-verified", operation_id: "rollback-josie", rollback_of: "josie-singleton" },
    { event: "batch-readback-verified", operation_id: "josie-grouped" },
  ];
  const completed = completedBatchesForRollback(ledger);
  assert.deepEqual(completed.map((item) => item.operation_id), ["other", "josie-grouped"]);
  assert.deepEqual(rollbackManifest(completed).map((item) => item.rollback_of), ["josie-grouped", "other"]);
});
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

test("operation-kind selection is validated and client retry is bounded", () => {
  assert.equal(parseArgs(["--operation-kind=social-asset"]).operationKind, "social-asset");
  assert.equal(parseArgs(["--reconcile-applied-profile-bindings"]).reconcileAppliedProfileBindings, true);
  assert.equal(parseArgs(["--only-operation-id=batch-123"]).onlyOperationId, "batch-123");
  assert.equal(parseArgs(["--max-client-attempts=2"]).maxClientAttempts, 2);
  assert.throws(() => parseArgs(["--operation-kind=anything"]), /Unsupported/);
  assert.throws(() => parseArgs(["--max-client-attempts=0"]), /integer from 1 through 10/);
  assert.equal(isTransientDataTransportError(new Error("HTTP/2 GOAWAY")), true);
  assert.equal(isTransientDataTransportError(new Error("validation failed")), false);
});

test("transient mutation failure checks receipt before idempotent retry", async () => {
  const batch = { operation_id: "social-batch", entries: [{}, {}] };
  let mutations = 0; let receiptReads = 0; let recreations = 0;
  const recovered = await runBatchWithTransportRecovery({
    batch,
    mutateBatch: async () => { mutations += 1; throw new Error("HTTP/2 GOAWAY"); },
    readReceipt: async () => { receiptReads += 1; return { item_count: 2, payload_digest: "server-digest" }; },
    recreateClient: () => { recreations += 1; },
    maxAttempts: 4,
  });
  assert.deepEqual({ mutations, receiptReads, recreations }, { mutations: 1, receiptReads: 1, recreations: 1 });
  assert.equal(recovered.recovered, true);
  assert.equal(recovered.result.payload_digest, "server-digest");
});

test("missing receipt retries the same operation only within the bound", async () => {
  const batch = { operation_id: "social-batch", entries: [{}] };
  let mutations = 0; let recreations = 0;
  await assert.rejects(runBatchWithTransportRecovery({
    batch,
    mutateBatch: async () => { mutations += 1; throw Object.assign(new Error("fetch failed"), { code: "ECONNRESET" }); },
    readReceipt: async () => null,
    recreateClient: () => { recreations += 1; },
    maxAttempts: 3,
  }), /remained unavailable after 3 attempts/);
  assert.equal(mutations, 3);
  assert.equal(recreations, 3);
});

test("non-transport mutation failures are never retried", async () => {
  let mutations = 0; let recreations = 0;
  await assert.rejects(runBatchWithTransportRecovery({
    batch: { operation_id: "social-batch", entries: [{}] },
    mutateBatch: async () => { mutations += 1; throw new Error("CAS mismatch"); },
    readReceipt: async () => null,
    recreateClient: () => { recreations += 1; },
  }), /CAS mismatch/);
  assert.equal(mutations, 1);
  assert.equal(recreations, 0);
});

test("transient reads recreate the client within the same bound", async () => {
  let reads = 0; let recreations = 0;
  const result = await runQueryWithTransportRecovery({
    query: async () => { reads += 1; if (reads < 3) throw new Error("connection reset"); return "verified"; },
    recreateClient: () => { recreations += 1; },
    maxAttempts: 3,
    label: "receipt readback",
  });
  assert.equal(result, "verified");
  assert.deepEqual({ reads, recreations }, { reads: 3, recreations: 2 });
});
