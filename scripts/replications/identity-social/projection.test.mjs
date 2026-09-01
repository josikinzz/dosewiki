import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { run } from "./build-projection.mjs";
import { buildProjection, digest, validateProjection } from "./projection.mjs";

test("builds a deterministic, complete, dry-run-only projection", () => {
  const first = buildProjection();
  const second = buildProjection();
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  assert.equal(first.counts.creatorAttributionDecisions, 215);
  assert.equal(first.counts.creatorChanges, 6);
  assert.equal(first.counts.creatorPreservations, 209);
  assert.equal(first.counts.blockedCreatorChanges, 14);
  assert.equal(first.counts.profileBindingDecisions, 48);
  assert.equal(first.counts.profileCreates, 21);
  assert.equal(first.counts.profileBinds, 5);
  assert.equal(first.counts.profileBindingNoWrites, 22);
  assert.equal(first.counts.originalUnreviewedProfileBindingNoWrites, 17);
  assert.equal(first.counts.verificationDecisions, 2127);
  assert.equal(first.counts.replicationSocialAssets, 6655);
  assert.equal(first.counts.avatarProposals, 7);
  assert.equal(first.counts.avatarReplacements, 4);
  assert.equal(first.counts.approvedAliasAdds, 0);
  assert.equal(first.counts.mergeRequiredAliasBlocks, 2);
  assert.equal(first.counts.existingAliasNoWrite, 1);
  assert.equal(first.counts.blockedAliasCandidates, 2);
  assert.equal(first.counts.rejectedAvatarCandidates, 2);
  assert.equal(first.invariants.productionWrites, 0);
  assert.equal(first.invariants.posterRemainsCreatorByDefault, true);
  assert.equal(first.invariants.missingProofStyleMismatchAndSuspicionNeverChangeCreator, true);
  assert.equal(first.invariants.deliveryReceiptsIncluded, false);
  validateProjection(first);
});

test("retains only chronology-proven creator changes and journals blocked candidates as no-write", () => {
  const projection = buildProjection();
  const changes = projection.operations.filter((operation) => operation.action === "set-proven-creator-with-verified-chronology");
  assert.equal(changes.length, 6);
  for (const change of changes) {
    assert.ok(change.after.creatorDisplayName);
    assert.ok(change.after.posterAttribution.posterDisplayName);
    assert.ok(change.after.posterAttribution.sourcePostUrl);
    assert.ok(change.evidence.sources.some((source) => source.authority && source.publishedBeforeCurrentPost === true));
    assert.ok(Number.isSafeInteger(change.after.originalPublishedAt));
    assert.ok(Number.isSafeInteger(change.after.posterPostedAt));
    assert.ok(change.after.originalPublishedAt < change.after.posterPostedAt);
    assert.match(change.after.sourceDigest, /^[a-f0-9]{64}$/);
  }
  const blocked = projection.operations.filter((operation) => operation.action === "blocked-preserve-poster-no-verified-chronology");
  assert.equal(blocked.length, 14);
  for (const operation of blocked) assert.equal(operation.after.creatorDisplayName, operation.expectedBefore.currentArtist);
});

test("emits exact typed profile dispositions with verification dependencies and scope flags", () => {
  const projection = buildProjection();
  const bindings = projection.operations.filter((operation) => operation.kind === "profile-binding");
  assert.equal(bindings.length, 48);
  assert.equal(bindings.filter((operation) => operation.action === "create-profile-then-bind-verification").length, 21);
  assert.equal(bindings.filter((operation) => operation.action === "bind-existing-profile-then-apply-verification").length, 5);
  assert.equal(bindings.filter((operation) => operation.action === "preserve-unresolved-profile-binding-no-write").length, 22);
  assert.equal(bindings.filter((operation) => operation.evidence.originalUnreviewed).length, 17);
  for (const operation of bindings) {
    assert.equal(operation.expectedBefore.fullProductionProfileSetSha256, "aea1bbeac1ce5a10e7e3a0981af17b40909c13ecf04fcf49299bbb32f66c2d8d");
    assert.ok(operation.evidence.verificationDependency.verificationOperationId);
    assert.ok(operation.evidence.rollback.action);
  }
  const scoped = bindings.filter((operation) => operation.evidence.identityScopeFlags?.length);
  assert.ok(scoped.some((operation) => operation.evidence.identityScopeFlags.some((flag) => flag.kind === "scoped-joint-credit")));
  assert.ok(scoped.some((operation) => operation.evidence.identityScopeFlags.some((flag) => flag.kind === "pseudonymous-or-handle-only")));
});

test("unresolved, false-alarm, and confirmed-current decisions never change creator", () => {
  const projection = buildProjection();
  const preservations = projection.operations.filter((operation) => operation.action === "preserve-poster-as-creator-no-write");
  assert.equal(preservations.length, 195);
  assert.deepEqual(new Set(preservations.map((operation) => operation.after.resolution)), new Set(["unresolved", "false-alarm", "confirmed-current-creator"]));
  for (const operation of preservations) {
    assert.equal(operation.after.creatorDisplayName, operation.expectedBefore.currentArtist);
  }
});

test("all operation IDs and CAS hashes are content-derived and unique", () => {
  const projection = buildProjection();
  assert.equal(new Set(projection.operations.map((operation) => operation.operationId)).size, projection.operations.length);
  for (const operation of projection.operations) {
    assert.equal(operation.expectedBeforeSha256, digest(operation.expectedBefore));
    assert.equal(operation.cas.expectedBeforeSha256, operation.expectedBeforeSha256);
    assert.equal(operation.cas.onMismatch, "abort-without-write");
  }
});

test("validation rejects a rewritten immutable operation ID", () => {
  const projection = buildProjection();
  projection.operations[0].operationId = "identity-social:creator-attribution:tampered";
  const { projectionSha256: _oldDigest, ...core } = projection;
  projection.projectionSha256 = digest(core);
  assert.throws(() => validateProjection(projection), /operation ID is not derived/);
});

test("uses the seven authoritative avatar approvals and excludes both rejections", () => {
  const projection = buildProjection();
  const avatars = projection.operations.filter((operation) => operation.kind === "profile-avatar");
  assert.equal(avatars.length, 7);
  assert.equal(new Set(avatars.map((operation) => operation.target.profileKey)).size, 7);
  assert.ok(!avatars.some((operation) => operation.target.profileKey === "NERVEWING"));
  assert.ok(!avatars.some((operation) => operation.target.profileKey === "FISHCENTERNICOLE"));
  assert.deepEqual(
    avatars.map((operation) => operation.target.profileKey).sort(),
    ["JOHNARCHIBALDWHEELER", "JOHNTENNIEL", "JOSIE", "LOKA", "MIDJOURNEY", "PHOSFORM", "SYMMETRICVISION"],
  );
  const josie = avatars.find((operation) => operation.target.profileKey === "JOSIE");
  assert.equal(josie.action, "propose-provenance-improving-avatar-replacement");
  assert.equal(josie.expectedBefore.currentAvatarSha256, "81bb237d8653e5183678588df069b7e4c986817e5acea96c754c3ce7e20074b6");
  assert.equal(josie.expectedBeforeSha256, digest(josie.expectedBefore));
  const midjourney = avatars.find((operation) => operation.target.profileKey === "MIDJOURNEY");
  assert.deepEqual(midjourney.after.derivativeDimensions, [600, 600]);
  for (const profileKey of ["LOKA", "PHOSFORM", "SYMMETRICVISION"]) {
    const operation = avatars.find((avatar) => avatar.target.profileKey === profileKey);
    assert.equal(operation.action, "propose-provenance-improving-avatar-replacement");
    assert.ok(operation.expectedBefore.currentAvatarSha256);
  }
});

test("uses the full production audit to block merge-required aliases", () => {
  const projection = buildProjection();
  assert.ok(projection.sourceArtifacts.some((artifact) => artifact.relativePath.endsWith("approved-aliases-second-review.json")));
  const aliases = projection.operations.filter((operation) => operation.kind === "profile-alias");
  assert.equal(aliases.length, 5);
  assert.ok(projection.sourceArtifacts.some((artifact) => artifact.relativePath.endsWith("full-production-collision-audit.json")));
  assert.deepEqual(
    aliases.filter((operation) => operation.action === "blocked-merge-required-collision").map((operation) => operation.target.alias).sort(),
    ["Wooodfield", "wheressuede"],
  );
  const existing = aliases.find((operation) => operation.action === "preserve-existing-alias");
  assert.equal(existing.target.profileKey, "SYMMETRICVISION");
  assert.equal(existing.expectedBefore.fullProductionProfileSetSha256, "aea1bbeac1ce5a10e7e3a0981af17b40909c13ecf04fcf49299bbb32f66c2d8d");
  assert.deepEqual(
    aliases.filter((operation) => operation.action === "blocked-pending-owner-review").map((operation) => operation.target.profileKey).sort(),
    ["HYPERACTIVEFILLY", "SUNTERRYART"],
  );
  for (const operation of aliases) {
    assert.equal(operation.expectedBefore.collisionAuditProfileSnapshotCount, 2119);
    assert.equal(operation.expectedBefore.fullProductionProfileSetSha256, "aea1bbeac1ce5a10e7e3a0981af17b40909c13ecf04fcf49299bbb32f66c2d8d");
  }
});

test("CLI check is zero-write and dry-run writes a self-validating local artifact", () => {
  const checked = run(["--check"]);
  assert.equal(checked.productionWrites, 0);
  assert.equal(checked.networkCalls, 0);

  const dir = mkdtempSync(path.join(tmpdir(), "identity-social-projection-"));
  const output = path.join(dir, "projection.json");
  const dryRun = run(["--dry-run", "--out", output]);
  const parsed = JSON.parse(readFileSync(output, "utf8"));
  validateProjection(parsed);
  assert.equal(dryRun.projectionSha256, parsed.projectionSha256);
});
