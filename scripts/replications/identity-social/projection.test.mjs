import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { run } from "./build-projection.mjs";
import {
  APPROVED_AVATAR_KEYS,
  AVATAR_REPLACEMENT_KEYS,
  FULL_PRODUCTION_PROFILE_COUNT,
  FULL_PRODUCTION_PROFILE_SET_SHA256,
  REJECTED_AVATAR_KEYS,
  SOCIAL_CARDS,
  writeSyntheticCampaign,
} from "./fixtures/synthetic-campaign.mjs";
import { buildProjection, digest, validateProjection } from "./projection.mjs";

const campaign = writeSyntheticCampaign(mkdtempSync(path.join(tmpdir(), "identity-social-campaign-")));
const { campaignDir } = campaign;
const buildCampaignProjection = () => buildProjection({ campaignDir });

/** Copies the campaign, applies one artifact edit, and returns the mutated copy's directory. */
function mutatedCampaign(relativePath, mutate) {
  const copy = writeSyntheticCampaign(mkdtempSync(path.join(tmpdir(), "identity-social-mutated-"))).campaignDir;
  const absolutePath = path.join(copy, relativePath);
  const value = JSON.parse(readFileSync(absolutePath, "utf8"));
  mutate(value);
  writeFileSync(absolutePath, `${JSON.stringify(value, null, 2)}\n`);
  return copy;
}

test("fails closed when campaign artifacts are unavailable", () => {
  const campaignDir = mkdtempSync(path.join(tmpdir(), "identity-social-empty-campaign-"));
  assert.throws(
    () => buildProjection({ campaignDir }),
    /Missing campaign artifact:/,
  );
});

test("builds a deterministic, complete, dry-run-only projection", () => {
  const first = buildCampaignProjection();
  const second = buildCampaignProjection();
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
  assert.equal(first.counts.replicationSocialAssets, SOCIAL_CARDS.replications.length);
  assert.equal(first.counts.socialAssets, SOCIAL_CARDS.replications.length + SOCIAL_CARDS.substances.length);
  assert.equal(first.counts.avatarProposals, 7);
  assert.equal(first.counts.avatarReplacements, AVATAR_REPLACEMENT_KEYS.length);
  assert.equal(first.counts.approvedAliasAdds, 0);
  assert.equal(first.counts.mergeRequiredAliasBlocks, 2);
  assert.equal(first.counts.existingAliasNoWrite, 1);
  assert.equal(first.counts.blockedAliasCandidates, 2);
  assert.equal(first.counts.rejectedAvatarCandidates, 2);
  assert.equal(first.counts.operations, first.operations.length);
  assert.equal(first.invariants.productionWrites, 0);
  assert.equal(first.invariants.posterRemainsCreatorByDefault, true);
  assert.equal(first.invariants.missingProofStyleMismatchAndSuspicionNeverChangeCreator, true);
  assert.equal(first.invariants.deliveryReceiptsIncluded, false);
  assert.equal(first.target.convexDeployment, "prod:glad-minnow-656");
  assert.equal(first.sourceArtifacts.length, 13);
  for (const artifact of first.sourceArtifacts) {
    assert.equal(artifact.sha256, digest(readFileSync(path.join(campaignDir, artifact.relativePath))));
  }
  validateProjection(first);
});

test("retains only chronology-proven creator changes and journals blocked candidates as no-write", () => {
  const projection = buildCampaignProjection();
  const changes = projection.operations.filter((operation) => operation.action === "set-proven-creator-with-verified-chronology");
  assert.equal(changes.length, 6);
  for (const change of changes) {
    assert.ok(change.after.creatorDisplayName);
    assert.notEqual(change.after.creatorDisplayName, change.expectedBefore.currentArtist);
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
  for (const operation of blocked) {
    assert.equal(operation.after.creatorDisplayName, operation.expectedBefore.currentArtist);
    assert.ok(operation.after.blockedProposedCreator);
    assert.equal(operation.after.resolution, "no-write-preservation");
  }
  assert.equal(projection.operations.filter((operation) => operation.action === "set-proven-creator-preserve-poster").length, 0);
});

test("rejects a chronology that is not strictly earlier or that is keyed to a rewritten operation", () => {
  const chronologyPath = "review-results/creator-attribution/creator-change-typed-fields-merged.json";
  const laterOriginal = mutatedCampaign(chronologyPath, (chronology) => {
    const retained = chronology.records.find((record) => record.decision === "retain-change");
    retained.originalPublishedAt = retained.posterPostedAt;
  });
  assert.throws(() => buildProjection({ campaignDir: laterOriginal }), /retained chronology is not strictly earlier/);

  const rekeyed = mutatedCampaign(chronologyPath, (chronology) => {
    chronology.records[0].operationId = "identity-social:creator-attribution:000000000000000000000000";
  });
  assert.throws(() => buildProjection({ campaignDir: rekeyed }), /missing final creator chronology review/);

  const posterMismatch = mutatedCampaign(chronologyPath, (chronology) => {
    chronology.records[0].currentPoster = "someone else";
  });
  assert.throws(() => buildProjection({ campaignDir: posterMismatch }), /chronology poster mismatch/);
});

test("refuses creator changes that lack an allowed signal or attributable earlier evidence", () => {
  const researchPath = "review-results/obvious-repost-research/research-merged.json";
  const weakSignal = mutatedCampaign(researchPath, (research) => {
    research.records[0].sourceFlag.flag.signal = "style-mismatch-suspicion";
  });
  assert.throws(() => buildProjection({ campaignDir: weakSignal }), /lacks an allowed obvious item-specific signal/);

  const noEarlierSource = mutatedCampaign(researchPath, (research) => {
    research.records[0].evidence[0].publishedBeforeCurrentPost = false;
  });
  assert.throws(() => buildProjection({ campaignDir: noEarlierSource }), /lacks attributable earlier-source evidence/);
});

test("emits exact typed profile dispositions with verification dependencies and scope flags", () => {
  const projection = buildCampaignProjection();
  const bindings = projection.operations.filter((operation) => operation.kind === "profile-binding");
  assert.equal(bindings.length, 48);
  assert.equal(bindings.filter((operation) => operation.action === "create-profile-then-bind-verification").length, 21);
  assert.equal(bindings.filter((operation) => operation.action === "bind-existing-profile-then-apply-verification").length, 5);
  assert.equal(bindings.filter((operation) => operation.action === "preserve-unresolved-profile-binding-no-write").length, 22);
  assert.equal(bindings.filter((operation) => operation.evidence.originalUnreviewed).length, 17);
  const verificationIds = new Set(projection.operations.filter((operation) => operation.kind === "replicator-verification").map((operation) => operation.operationId));
  for (const operation of bindings) {
    assert.equal(operation.expectedBefore.fullProductionProfileSetSha256, FULL_PRODUCTION_PROFILE_SET_SHA256);
    assert.equal(operation.expectedBefore.expectedProfileCount, FULL_PRODUCTION_PROFILE_COUNT);
    assert.ok(verificationIds.has(operation.evidence.verificationDependency.verificationOperationId));
    assert.ok(operation.evidence.rollback.action);
  }
  const scoped = bindings.filter((operation) => operation.evidence.identityScopeFlags?.length);
  assert.ok(scoped.some((operation) => operation.evidence.identityScopeFlags.some((flag) => flag.kind === "scoped-joint-credit")));
  assert.ok(scoped.some((operation) => operation.evidence.identityScopeFlags.some((flag) => flag.kind === "pseudonymous-or-handle-only")));
});

test("rejects profile-binding reviews that drift from the full production snapshot or the verification queue", () => {
  const reviewPath = "review-results/profile-binding/profile-binding-reviewed.json";
  const staleSnapshot = mutatedCampaign(reviewPath, (review) => {
    review.fullProductionBaseline.liveCanonicalProfileSetSha256 = "0".repeat(64);
  });
  assert.throws(() => buildProjection({ campaignDir: staleSnapshot }), /full-set CAS digest drifted/);

  const wrongArtist = mutatedCampaign(reviewPath, (review) => {
    review.records[0].artistId = "artist-9999";
  });
  assert.throws(() => buildProjection({ campaignDir: wrongArtist }), /profile review artist mismatch/);

  const doubleDisposition = mutatedCampaign("review-results/profile-binding/profile-binding-reviewed-validation.json", (validation) => {
    const review = JSON.parse(readFileSync(path.join(campaignDir, reviewPath), "utf8"));
    validation.originalUnresolvedNoWrite.push({ operationId: review.records[0].operationId, artistId: review.records[0].artistId });
  });
  assert.throws(() => buildProjection({ campaignDir: doubleDisposition }), /exactly one final disposition source/);
});

test("unresolved, false-alarm, and confirmed-current decisions never change creator", () => {
  const projection = buildCampaignProjection();
  const preservations = projection.operations.filter((operation) => operation.action === "preserve-poster-as-creator-no-write");
  assert.equal(preservations.length, 195);
  assert.deepEqual(new Set(preservations.map((operation) => operation.after.resolution)), new Set(["unresolved", "false-alarm", "confirmed-current-creator"]));
  for (const operation of preservations) {
    assert.equal(operation.after.creatorDisplayName, operation.expectedBefore.currentArtist);
    assert.equal(operation.after.attributionDisposition, "poster-as-artist-default");
  }
});

test("all operation IDs and CAS hashes are content-derived and unique", () => {
  const projection = buildCampaignProjection();
  assert.equal(new Set(projection.operations.map((operation) => operation.operationId)).size, projection.operations.length);
  for (const operation of projection.operations) {
    assert.equal(operation.expectedBeforeSha256, digest(operation.expectedBefore));
    assert.equal(operation.cas.expectedBeforeSha256, operation.expectedBeforeSha256);
    assert.equal(operation.cas.onMismatch, "abort-without-write");
  }
});

test("validation rejects a rewritten immutable operation ID", () => {
  const projection = buildCampaignProjection();
  projection.operations[0].operationId = "identity-social:creator-attribution:tampered";
  const { projectionSha256: _oldDigest, ...core } = projection;
  projection.projectionSha256 = digest(core);
  assert.throws(() => validateProjection(projection), /operation ID is not derived/);
});

test("validation rejects a projection whose content digest no longer matches its body", () => {
  const projection = buildCampaignProjection();
  projection.operations[0].after = { ...projection.operations[0].after, creatorDisplayName: "tampered" };
  assert.throws(() => validateProjection(projection), /content digest mismatch/);
});

test("uses the seven authoritative avatar approvals and excludes both rejections", () => {
  const projection = buildCampaignProjection();
  const avatars = projection.operations.filter((operation) => operation.kind === "profile-avatar");
  assert.equal(avatars.length, 7);
  assert.equal(new Set(avatars.map((operation) => operation.target.profileKey)).size, 7);
  for (const rejected of REJECTED_AVATAR_KEYS) assert.ok(!avatars.some((operation) => operation.target.profileKey === rejected));
  assert.deepEqual(avatars.map((operation) => operation.target.profileKey).sort(), [...APPROVED_AVATAR_KEYS].sort());
  for (const profileKey of AVATAR_REPLACEMENT_KEYS) {
    const operation = avatars.find((avatar) => avatar.target.profileKey === profileKey);
    assert.equal(operation.action, "propose-provenance-improving-avatar-replacement");
    assert.equal(operation.expectedBefore.currentAvatarSha256, campaign.currentAvatarSha256[profileKey]);
    assert.equal(operation.expectedBeforeSha256, digest(operation.expectedBefore));
  }
  for (const operation of avatars) {
    if (AVATAR_REPLACEMENT_KEYS.includes(operation.target.profileKey)) continue;
    assert.equal(operation.action, "propose-reviewed-avatar");
    assert.equal(operation.expectedBefore.currentAvatarSha256, null);
  }
  const midjourney = avatars.find((operation) => operation.target.profileKey === "MIDJOURNEY");
  assert.deepEqual(midjourney.after.derivativeDimensions, [600, 600]);
  for (const operation of avatars) {
    const derivative = readFileSync(path.join(campaignDir, "avatars", `${operation.target.profileKey.toLowerCase()}.png`));
    assert.equal(operation.after.derivativeSha256, digest(derivative));
    assert.equal(operation.after.derivativeByteSize, derivative.length);
  }
});

test("rejects an approved avatar whose staged derivative bytes drifted from the review", () => {
  const drifted = writeSyntheticCampaign(mkdtempSync(path.join(tmpdir(), "identity-social-avatar-drift-"))).campaignDir;
  writeFileSync(path.join(drifted, "avatars/josie.png"), Buffer.from("replaced bytes"));
  assert.throws(() => buildProjection({ campaignDir: drifted }), /JOSIE: approved avatar derivative digest mismatch/);

  const unapproved = mutatedCampaign("review-results/avatar-research/avatar-candidate-second-review.json", (review) => {
    review.records.find((record) => record.profileKey === "NERVEWING").decision = "approve";
  });
  assert.throws(() => buildProjection({ campaignDir: unapproved }), /Nervewing must remain rejected/);
});

test("uses the full production audit to block merge-required aliases", () => {
  const projection = buildCampaignProjection();
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
  assert.equal(existing.expectedBefore.normalizedAliasOwners, 1);
  assert.deepEqual(
    aliases.filter((operation) => operation.action === "blocked-pending-owner-review").map((operation) => operation.target.profileKey).sort(),
    ["HYPERACTIVEFILLY", "SUNTERRYART"],
  );
  for (const operation of aliases) {
    assert.equal(operation.after.approved, false);
    assert.equal(operation.expectedBefore.collisionAuditProfileSnapshotCount, FULL_PRODUCTION_PROFILE_COUNT);
    assert.equal(operation.expectedBefore.fullProductionProfileSetSha256, FULL_PRODUCTION_PROFILE_SET_SHA256);
  }
});

test("rejects alias reviews whose collision audit or owner counts are inconsistent", () => {
  const auditPath = "review-results/alias-research/full-production-collision-audit.json";
  const collisions = mutatedCampaign(auditPath, (audit) => {
    audit.globalIdentityCollisionAudit.normalizedWholeNameCrossProfileCollisionCount = 1;
  });
  assert.throws(() => buildProjection({ campaignDir: collisions }), /unresolved current collisions/);

  const missingMapping = mutatedCampaign(auditPath, (audit) => {
    audit.blockedMappings = audit.blockedMappings.filter((mapping) => mapping.source !== "Xanny");
  });
  assert.throws(() => buildProjection({ campaignDir: missingMapping }), /Xanny: missing from full production collision audit/);

  const ownerMismatch = mutatedCampaign("review-results/alias-research/approved-aliases-second-review.json", (review) => {
    review.mappings.find((mapping) => mapping.alias === "Symmetric Vision").absenceOfConflict.existingOwnersOfNormalizedAlias = 0;
  });
  assert.throws(() => buildProjection({ campaignDir: ownerMismatch }), /reviewed owner count is inconsistent/);
});

test("binds every social-card asset by digest and requires manifest coverage to match the rollout audit", () => {
  const projection = buildCampaignProjection();
  const assets = projection.operations.filter((operation) => operation.kind === "social-asset");
  assert.equal(assets.length, SOCIAL_CARDS.replications.length + SOCIAL_CARDS.substances.length);
  for (const operation of assets) {
    const bytes = readFileSync(path.join(campaignDir, operation.after.localManifestPath.replace(/^\/local\/social-cards\//, "social-cards/assets/")));
    assert.equal(operation.after.sha256, digest(bytes));
    assert.equal(operation.after.byteSize, bytes.length);
    assert.equal(operation.expectedBefore, null);
  }

  const incomplete = mutatedCampaign("p7-rollout-contract-audit-2026-08-31.json", (rollout) => {
    rollout.production.publicationEligibleReplications += 1;
  });
  assert.throws(() => buildProjection({ campaignDir: incomplete }), /social-card coverage is incomplete/);
});

test("CLI check is zero-write and dry-run writes a self-validating local artifact", () => {
  const checked = run(["--check", "--campaign-dir", campaignDir]);
  assert.equal(checked.productionWrites, 0);
  assert.equal(checked.networkCalls, 0);

  const dir = mkdtempSync(path.join(tmpdir(), "identity-social-projection-"));
  const output = path.join(dir, "projection.json");
  const dryRun = run(["--dry-run", "--campaign-dir", campaignDir, "--out", output]);
  const parsed = JSON.parse(readFileSync(output, "utf8"));
  validateProjection(parsed);
  assert.equal(dryRun.projectionSha256, parsed.projectionSha256);
  assert.equal(dryRun.projectionSha256, buildCampaignProjection().projectionSha256);
});
