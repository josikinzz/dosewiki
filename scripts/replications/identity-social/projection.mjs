import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export const SCHEMA_VERSION = 1;
export const DEFAULT_CAMPAIGN_DIR =
  "/Users/josie/Documents/Dose Wiki Media Review/Data/Replication Identity and Social Pass 2026-08-31";

const INPUTS = {
  research: "review-results/obvious-repost-research/research-merged.json",
  avatarsAliases: "avatar-alias-audit-2026-08-31.json",
  primary: "review-results/artist-verification/primary-review-merged.json",
  secondary: "review-results/artist-verification/secondary-review-merged.json",
  third: "review-results/artist-verification/third-review-merged.json",
  social: "social-cards/entity-social-card-local-manifest.json",
  rollout: "p7-rollout-contract-audit-2026-08-31.json",
  avatarSecondReview: "review-results/avatar-research/avatar-candidate-second-review.json",
  aliasSecondReview: "review-results/alias-research/approved-aliases-second-review.json",
  fullAliasCollisionAudit: "review-results/alias-research/full-production-collision-audit.json",
  creatorChronology: "review-results/creator-attribution/creator-change-typed-fields-merged.json",
  profileBindings: "review-results/profile-binding/profile-binding-reviewed.json",
  profileBindingValidation: "review-results/profile-binding/profile-binding-reviewed-validation.json",
};

const ALLOWED_CREATOR_CHANGE_SIGNALS = new Set(["explicit-repost-language", "known-third-party-credit", "visible-watermark-mismatch", "exact-earlier-attributable-original"]);

function required(condition, message) {
  if (!condition) throw new Error(message);
}

export function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
    .join(",")}}`;
}

export function digest(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(typeof value === "string" ? value : stableStringify(value));
  return createHash("sha256").update(bytes).digest("hex");
}

function jsonValue(value) {
  return JSON.parse(JSON.stringify(value));
}

function readArtifact(campaignDir, relativePath) {
  const absolutePath = path.join(campaignDir, relativePath);
  required(existsSync(absolutePath), `Missing campaign artifact: ${absolutePath}`);
  const bytes = readFileSync(absolutePath);
  return {
    relativePath,
    sha256: digest(bytes),
    value: JSON.parse(bytes.toString("utf8")),
  };
}

function makeOperation(kind, target, action, expectedBefore, after, evidence) {
  target = jsonValue(target);
  expectedBefore = jsonValue(expectedBefore);
  after = jsonValue(after);
  evidence = jsonValue(evidence);
  const expectedBeforeSha256 = digest(expectedBefore);
  const operationCore = { kind, target, action, expectedBeforeSha256, after, evidence };
  return {
    operationId: `identity-social:${kind}:${digest(operationCore).slice(0, 24)}`,
    ...operationCore,
    expectedBefore,
    cas: {
      comparison: "canonical-json-sha256",
      expectedBeforeSha256,
      onMismatch: "abort-without-write",
    },
  };
}

function creatorDecision(record) {
  const work = record.sourceFlag?.work;
  required(work?.id === record.workId, `Research record ${record.workId} does not contain its matching source work.`);
  const sourceHistory = {
    posterDisplayName: work.posterName ?? work.sourceArtistDisplayName ?? work.artist,
    posterProfileUrl: work.posterUrl ?? null,
    sourcePostUrl: work.sourcePostUrl ?? work.sourceReferences?.[0]?.post_url ?? null,
    sourceUrl: work.sourceUrl ?? null,
    sourceReferences: work.sourceReferences ?? [],
    sourceEraArtistDisplayName: work.sourceArtistDisplayName ?? work.artist,
  };
  const expectedBefore = {
    replicationId: record.workId,
    currentArtist: work.artist,
    attributionDisposition: work.attributionDisposition ?? null,
    creditLine: work.creditLine ?? null,
    sourceHistory,
  };
  const evidence = {
    outcome: record.outcome,
    rationale: record.rationale,
    researcher: record.researcher,
    methods: record.methods ?? [],
    sources: record.evidence ?? [],
    sourceFlag: record.sourceFlag?.flag ?? null,
  };

  if (record.creatorChangeProposed) {
    required(record.outcome === "confirmed-repost", `${record.workId}: creator change is not a confirmed repost.`);
    required(typeof record.provenCreator === "string" && record.provenCreator.trim(), `${record.workId}: missing proven creator.`);
    required(
      ALLOWED_CREATOR_CHANGE_SIGNALS.has(record.sourceFlag?.flag?.signal),
      `${record.workId}: creator change lacks an allowed obvious item-specific signal.`,
    );
    required(
      record.evidence?.some((item) => item.authority === "creator-controlled-or-attributable-original" && item.publishedBeforeCurrentPost === true),
      `${record.workId}: creator change lacks attributable earlier-source evidence.`,
    );
    return makeOperation(
      "creator-attribution",
      { replicationId: record.workId, slug: work.slug },
      "set-proven-creator-preserve-poster",
      expectedBefore,
      {
        creatorDisplayName: record.provenCreator.trim(),
        attributionDisposition: "proven-creator-with-poster-preserved",
        posterAttribution: sourceHistory,
      },
      evidence,
    );
  }

  required(
    ["unresolved", "false-alarm", "confirmed-current-creator"].includes(record.outcome),
    `${record.workId}: unsupported no-change research outcome ${record.outcome}.`,
  );
  return makeOperation(
    "creator-attribution",
    { replicationId: record.workId, slug: work.slug },
    "preserve-poster-as-creator-no-write",
    expectedBefore,
    {
      creatorDisplayName: work.artist,
      attributionDisposition: "poster-as-artist-default",
      posterAttribution: sourceHistory,
      resolution: record.outcome,
      confirmedCreatorDetail: record.outcome === "confirmed-current-creator" ? record.provenCreator : null,
    },
    evidence,
  );
}

function applyCreatorChronology(creatorOperations, chronology) {
  required(chronology.artifactType === "identity-social-creator-change-typed-fields-merged", "Unexpected creator chronology artifact.");
  required(chronology.counts?.records === 20 && chronology.records?.length === 20, "Creator chronology must cover exactly 20 prior change candidates.");
  required(chronology.counts?.retainChange === 6 && chronology.counts?.blocked === 14, "Creator chronology must retain six changes and block fourteen.");
  required(chronology.productionWrites === 0 && chronology.counts.productionWrites === 0, "Creator chronology reports production writes.");
  required(chronology.validation?.exactQueueCoverage && chronology.validation?.retainedChronologyStrictlyEarlier, "Creator chronology validation is incomplete.");
  const byOperationId = new Map(chronology.records.map((record) => [record.operationId, record]));
  required(byOperationId.size === 20, "Creator chronology contains duplicate operation IDs.");
  return creatorOperations.map((operation) => {
    if (operation.action !== "set-proven-creator-preserve-poster") return operation;
    const reviewed = byOperationId.get(operation.operationId);
    required(reviewed, `${operation.operationId}: missing final creator chronology review.`);
    if (reviewed.replicationId != null) required(reviewed.replicationId === operation.target.replicationId, `${operation.operationId}: chronology replication ID mismatch.`);
    if (reviewed.currentPoster != null) required(reviewed.currentPoster === operation.expectedBefore.currentArtist, `${operation.operationId}: chronology poster mismatch.`);
    if (reviewed.proposedCreator != null) required(reviewed.proposedCreator === operation.after.creatorDisplayName, `${operation.operationId}: chronology creator mismatch.`);
    if (reviewed.decision === "retain-change") {
      required(Number.isSafeInteger(reviewed.originalPublishedAt), `${operation.operationId}: retained change lacks numeric originalPublishedAt.`);
      required(Number.isSafeInteger(reviewed.posterPostedAt), `${operation.operationId}: retained change lacks numeric posterPostedAt.`);
      required(reviewed.originalPublishedAt < reviewed.posterPostedAt, `${operation.operationId}: retained chronology is not strictly earlier.`);
      required(/^[a-f0-9]{64}$/.test(reviewed.sourceDigest), `${operation.operationId}: retained change lacks verified sourceDigest.`);
      return makeOperation(
        operation.kind,
        operation.target,
        "set-proven-creator-with-verified-chronology",
        operation.expectedBefore,
        {
          ...operation.after,
          originalPublishedAt: reviewed.originalPublishedAt,
          posterPostedAt: reviewed.posterPostedAt,
          sourceDigest: reviewed.sourceDigest,
        },
        { ...operation.evidence, finalChronologyReview: reviewed },
      );
    }
    required(reviewed.decision === "blocked", `${operation.operationId}: unsupported chronology decision ${reviewed.decision}.`);
    required(reviewed.originalPublishedAt == null, `${operation.operationId}: blocked change unexpectedly has original chronology.`);
    return makeOperation(
      operation.kind,
      operation.target,
      "blocked-preserve-poster-no-verified-chronology",
      operation.expectedBefore,
      {
        creatorDisplayName: operation.expectedBefore.currentArtist,
        attributionDisposition: "poster-as-artist-default",
        posterAttribution: operation.after.posterAttribution,
        blockedProposedCreator: operation.after.creatorDisplayName,
        resolution: "no-write-preservation",
      },
      { ...operation.evidence, finalChronologyReview: reviewed },
    );
  });
}

function verificationOperations(primary, secondary, third) {
  const secondaryByArtist = new Map(secondary.finalizedArtists.map((record) => [record.artistId, record]));
  const thirdByArtist = new Map(
    third.records.filter((record) => record.kind === "artist-verdict").map((record) => [record.key, record]),
  );
  return primary.artists.map((artist) => {
    const second = secondaryByArtist.get(artist.artistId);
    const thirdReview = thirdByArtist.get(artist.artistId);
    const verdict = thirdReview?.decision ?? second?.verdict ?? artist.verdict;
    const reviewTrail = [
      { stage: "primary", reviewer: artist.reviewer, verdict: artist.verdict, confidence: artist.confidence, rationale: artist.rationale },
    ];
    if (second?.secondary) {
      reviewTrail.push({
        stage: "secondary",
        reviewer: second.secondary.reviewer,
        verdict: second.secondary.verdict,
        confidence: second.secondary.confidence,
        rationale: second.secondary.rationale,
      });
    }
    if (thirdReview) {
      reviewTrail.push({ stage: "third", reviewer: thirdReview.reviewer, verdict, rationale: thirdReview.rationale });
    }
    const sourceArtist = artist.sourceArtist ?? second?.primary?.sourceArtist;
    required(sourceArtist, `${artist.artistId}: missing source artist snapshot.`);
    const expectedBefore = {
      profileKey: sourceArtist.profileKey,
      displayName: sourceArtist.currentDisplayName ?? sourceArtist.artist,
      verificationStatus: sourceArtist.verificationStatus ?? "unverified",
      aliases: sourceArtist.aliases ?? [],
      profileLinks: sourceArtist.profileLinks ?? [],
    };
    return makeOperation(
      "replicator-verification",
      { artistId: artist.artistId, profileKey: sourceArtist.profileKey },
      "record-reviewed-verification",
      expectedBefore,
      { verdict, verifiedReplicator: verdict === "verified-replicator", reviewTrail },
      { sourceSheetBatch: sourceArtist.sourceSheetBatch ?? null, workCount: sourceArtist.workCount ?? sourceArtist.works?.length ?? 0 },
    );
  });
}

function profileBindingOperations(review, validation, verificationOperationsList) {
  const fullProductionCasSha256 = "aea1bbeac1ce5a10e7e3a0981af17b40909c13ecf04fcf49299bbb32f66c2d8d";
  required(review.artifactType === "profile-binding-reviewed", "Unexpected profile-binding review artifact.");
  required(review.counts?.records === 31 && review.records?.length === 31, "Profile-binding review must contain exactly 31 second-reviewed records.");
  required(review.counts?.approveNewProfile === 21 && review.counts?.bindExisting === 5 && review.counts?.unresolvedNoWrite === 5, "Profile-binding decision counts drifted.");
  required(review.productionWrites === 0 && review.counts.productionWrites === 0, "Profile-binding review reports production writes.");
  required(review.fullProductionBaseline?.profileCount === 2119, "Profile-binding review does not use the full production profile set.");
  required(review.fullProductionBaseline?.liveCanonicalProfileSetSha256 === fullProductionCasSha256, "Profile-binding full-set CAS digest drifted.");
  required(review.validation?.approvedProfileKeysCheckedAgainstFullSnapshot && review.validation?.approvedProfileKeyCollisions?.length === 0, "Approved profile keys did not pass full-snapshot collision review.");
  required(validation.artifactType === "profile-binding-reviewed-validation", "Unexpected profile-binding validation artifact.");
  required(validation.result === "pass-with-risk-flags", "Independent profile-binding validation did not pass.");
  required(validation.productionWrites === 0 && validation.counts?.productionWrites === 0, "Profile-binding validation reports production writes.");
  required(validation.counts?.originalQueue === 48 && validation.counts?.finalUniqueDispositions === 48, "Profile-binding validation must cover all 48 original operations.");
  required(validation.counts?.approveNewProfile === 21 && validation.counts?.bindExisting === 5 && validation.counts?.unresolvedNoWrite === 22, "Final profile-binding disposition counts drifted.");
  required(validation.invariants?.allOriginalOperationIdsPresentExactlyOnce && validation.invariants?.noExtraFinalOperationIds && validation.invariants?.noDuplicateFinalOperationIds, "Final profile-binding ID coverage is not exact.");
  required(validation.invariants?.snapshotCanonicalProfileSetSha256 === fullProductionCasSha256, "Independent validation CAS digest drifted.");
  const verificationById = new Map(verificationOperationsList.map((operation) => [operation.operationId, operation]));
  const reviewedById = new Map(review.records.map((record) => [record.operationId, record]));
  const originalUnresolvedById = new Map(validation.originalUnresolvedNoWrite.map((record) => [record.operationId, record]));
  const nullVerificationOperations = verificationOperationsList.filter((operation) => operation.target.profileKey == null);
  required(nullVerificationOperations.length === 48, "Expected exactly 48 null-profile verification operations.");
  const jointRiskByKey = new Map(validation.identityRiskFlags.jointProfiles.map((flag) => [flag.profileKey, { kind: "scoped-joint-credit", ...flag }]));
  const pseudonymRiskByKey = new Map(validation.identityRiskFlags.pseudonymousOrHandleProfiles.map((flag) => [flag.profileKey, { kind: "pseudonymous-or-handle-only", ...flag }]));
  const output = nullVerificationOperations.map((verification) => {
    const reviewedRecord = reviewedById.get(verification.operationId);
    const originalUnresolved = originalUnresolvedById.get(verification.operationId);
    required(Boolean(reviewedRecord) !== Boolean(originalUnresolved), `${verification.operationId}: profile operation must have exactly one final disposition source.`);
    const record = reviewedRecord ?? {
      operationId: verification.operationId,
      artistId: verification.target.artistId,
      displayName: verification.expectedBefore.displayName,
      firstReviewDecision: "unresolved",
      secondReviewDecision: "not-required-original-unresolved",
      finalDecision: "unresolved-no-write",
      validatedProfile: null,
      confidence: "conservative",
      rationale: "The original profile-binding review remained unresolved. Preserve the null binding visibly; do not skip, create, or infer a profile.",
    };
    required(verificationById.has(record.operationId), `${record.operationId}: profile review references a missing verification operation.`);
    required(verification.target.artistId === record.artistId, `${record.operationId}: profile review artist mismatch.`);
    required(verification.target.profileKey == null, `${record.operationId}: profile review must resolve a null profile key.`);
    const verificationDependency = {
      verificationOperationId: verification.operationId,
      verdict: verification.after.verdict,
      verifiedReplicator: verification.after.verifiedReplicator,
      sequencing: "profile-create-or-bind-must-succeed-before-verification-write",
    };
    const evidence = {
      confidence: record.confidence,
      rationale: record.rationale,
      firstReviewDecision: record.firstReviewDecision,
      secondReviewDecision: record.secondReviewDecision,
      finalDecision: record.finalDecision,
      verificationDependency,
    };
    if (record.finalDecision === "approve-new-profile") {
      required(record.validatedProfile?.profileKey && record.validatedProfile?.displayName, `${record.operationId}: approved profile is incomplete.`);
      const identityScopeFlags = [jointRiskByKey.get(record.validatedProfile.profileKey), pseudonymRiskByKey.get(record.validatedProfile.profileKey)].filter(Boolean);
      return makeOperation(
        "profile-binding",
        { artistId: record.artistId, profileKey: record.validatedProfile.profileKey },
        "create-profile-then-bind-verification",
        {
          fullProductionProfileSetSha256: fullProductionCasSha256,
          expectedProfileCount: 2119,
          profileKey: record.validatedProfile.profileKey,
          existingProfile: null,
          currentVerificationProfileKey: null,
        },
        {
          profile: {
            profileKey: record.validatedProfile.profileKey,
            displayName: record.validatedProfile.displayName,
            aliases: record.validatedProfile.aliases ?? [],
            links: record.validatedProfile.links ?? [],
          },
          verificationDependency,
        },
        {
          ...evidence,
          identityScopeFlags,
          rollback: {
            action: "delete-only-the-operation-created-profile-and-restore-null-binding",
            preconditions: ["created profile still matches this operation payload", "no unrelated references have been attached", "verification write is rolled back first"],
          },
        },
      );
    }
    if (record.finalDecision === "bind-existing") {
      required(record.validatedProfile?.profileId && record.validatedProfile?.profileKey, `${record.operationId}: existing-profile binding is incomplete.`);
      return makeOperation(
        "profile-binding",
        { artistId: record.artistId, profileKey: record.validatedProfile.profileKey },
        "bind-existing-profile-then-apply-verification",
        {
          fullProductionProfileSetSha256: fullProductionCasSha256,
          expectedProfileCount: 2119,
          existingProfile: record.validatedProfile,
          currentVerificationProfileKey: null,
        },
        { profileId: record.validatedProfile.profileId, profileKey: record.validatedProfile.profileKey, verificationDependency },
        {
          ...evidence,
          rollback: {
            action: "restore-null-binding-and-previous-profile-verification-state",
            targetProfileId: record.validatedProfile.profileId,
            requiresExactPrewriteReadback: true,
          },
        },
      );
    }
    required(record.finalDecision === "unresolved-no-write", `${record.operationId}: unsupported profile binding decision.`);
    required(record.validatedProfile == null, `${record.operationId}: no-write decision unexpectedly validates a profile.`);
    return makeOperation(
      "profile-binding",
      { artistId: record.artistId, profileKey: null },
      "preserve-unresolved-profile-binding-no-write",
      {
        fullProductionProfileSetSha256: fullProductionCasSha256,
        expectedProfileCount: 2119,
        currentVerificationProfileKey: null,
      },
      { profileKey: null, verificationDependency: { ...verificationDependency, sequencing: "verification-remains-unbound-no-write" } },
      { ...evidence, originalUnreviewed: Boolean(originalUnresolved), rollback: { action: "none-no-write" } },
    );
  });
  required(output.length === 48 && new Set(output.map((operation) => operation.operationId)).size === output.length, "Profile-binding operations do not cover 48 unique decisions.");
  return output;
}

function aliasOperations(audit, secondReview, fullAudit) {
  required(secondReview.artifactType === "approved-aliases-independent-second-review", "Unexpected alias second-review artifact.");
  required(secondReview.mode === "read-only-local-review", "Alias second review is not read-only.");
  required(secondReview.scope?.requestedMappings === 3, "Alias second review must cover exactly three requested mappings.");
  required(secondReview.scope?.approved === 3, "All three reviewed identity mappings must be approved.");
  required(secondReview.scope?.newAliasAddsApproved === 2, "Alias second review must approve exactly two additions.");
  required(secondReview.scope?.existingAliasPreserved === 1, "Alias second review must preserve exactly one existing alias without writing.");
  required(secondReview.scope?.productionWrites === 0 && secondReview.productionWrites === 0, "Alias review reports production writes.");
  required(
    secondReview.collisionAudit?.existingNormalizedIdentityCollisionsAcrossProfileKeysDisplayNamesAndAliases === 0,
    "Alias collision audit found pre-existing normalized identity collisions.",
  );
  required(secondReview.mappings?.length === 3, "Alias second review is missing per-mapping decisions.");
  const reviewedByAlias = new Map(secondReview.mappings.map((mapping) => [mapping.alias.trim().toLowerCase(), mapping]));
  required(reviewedByAlias.size === 3, "Alias second review contains duplicate normalized aliases.");
  const fullProductionCasSha256 = "aea1bbeac1ce5a10e7e3a0981af17b40909c13ecf04fcf49299bbb32f66c2d8d";
  required(fullAudit.operation === "full-production-contributor-alias-collision-audit", "Unexpected full production alias audit.");
  required(fullAudit.productionWrites === 0 && fullAudit.safety?.productionWrites === 0, "Full alias audit reports production writes.");
  required(fullAudit.snapshot?.contributorProfileCount === 2119, "Full alias audit does not cover all 2,119 production profiles.");
  required(fullAudit.snapshot?.canonicalProfileSetSha256 === fullProductionCasSha256, "Full production profile-set CAS digest drifted.");
  required(fullAudit.globalIdentityCollisionAudit?.normalizedWholeNameCrossProfileCollisionCount === 0, "Full production alias audit contains unresolved current collisions.");
  const fullReviewedMappings = new Map(fullAudit.approvedMappings.map((mapping) => [mapping.source.trim().toLowerCase(), mapping]));
  const fullBlockedMappings = new Map(fullAudit.blockedMappings.map((mapping) => [mapping.source.trim().toLowerCase(), mapping]));

  const operations = audit.aliasProposals.map((proposal) => {
    const normalizedAlias = proposal.observedArchiveForm.trim().toLowerCase();
    const reviewed = reviewedByAlias.get(normalizedAlias);
    const isBlockedCandidate = proposal.decision === "candidate-add-as-alias-after-final-owner-review";
    required(reviewed || isBlockedCandidate, `${proposal.observedArchiveForm}: alias is neither independently reviewed nor explicitly blocked.`);
    if (reviewed) {
      required(reviewed.decision === "approve", `${proposal.observedArchiveForm}: second review did not approve the mapping.`);
      required(reviewed.canonicalProfileKey === proposal.canonicalProfileKey, `${proposal.observedArchiveForm}: canonical profile disagrees with second review.`);
      required(reviewed.absenceOfConflict?.conflictingProfileOwnersFound === false, `${proposal.observedArchiveForm}: collision review found a conflicting owner.`);
      const expectedOwners = reviewed.operation === "preserve-existing-normalized-alias-no-write" ? 1 : 0;
      required(
        reviewed.absenceOfConflict?.existingOwnersOfNormalizedAlias === expectedOwners,
        `${proposal.observedArchiveForm}: reviewed owner count is inconsistent with its operation.`,
      );
    }
    const fullReviewed = fullReviewedMappings.get(normalizedAlias);
    const fullBlocked = fullBlockedMappings.get(normalizedAlias);
    required(fullReviewed || fullBlocked, `${proposal.observedArchiveForm}: missing from full production collision audit.`);
    const action = fullReviewed?.decision === "merge-required-collision"
      ? "blocked-merge-required-collision"
      : fullReviewed?.decision === "already-settled-no-write"
        ? "preserve-existing-alias"
        : "blocked-pending-owner-review";
    const approved = false;
    return makeOperation(
      "profile-alias",
      { profileKey: proposal.canonicalProfileKey, alias: proposal.observedArchiveForm },
      action,
      {
        currentState: proposal.currentState,
        normalizedAliasOwners: reviewed?.absenceOfConflict?.existingOwnersOfNormalizedAlias ?? null,
        collisionAuditProfileSnapshotCount: fullAudit.snapshot.contributorProfileCount,
        fullProductionProfileSetSha256: fullProductionCasSha256,
        sourceProfileCanonicalSha256: fullReviewed?.sourceRow?.canonicalSha256 ?? null,
        targetProfileCanonicalSha256: fullReviewed?.targetRow?.canonicalSha256 ?? fullBlocked?.targetRow?.canonicalSha256 ?? null,
      },
      {
        canonicalDisplayName: proposal.canonicalDisplayName,
        alias: proposal.observedArchiveForm,
        approved,
        preserve: proposal.preserve,
      },
      {
        confidence: reviewed?.confidence ?? proposal.confidence,
        evidence: reviewed?.evidence ?? proposal.evidence,
        identityConclusion: reviewed?.identityConclusion ?? null,
        preservationRequirements: reviewed?.preservationRequirements ?? proposal.preserve,
        collisionDecision: reviewed?.absenceOfConflict ?? null,
        rollback: reviewed?.rollback ?? null,
        fullProductionDecision: fullReviewed?.decision ?? fullBlocked?.decision,
        fullProductionFinding: fullReviewed?.mergePrecondition ?? fullBlocked?.reason,
        contentConflict: fullReviewed?.contentConflict ?? null,
        fullProductionRollback: fullAudit.rollbackContract,
      },
    );
  });
  required(operations.filter((operation) => operation.action === "add-alias-preserve-source-history").length === 0, "Projection must contain no alias additions after the full production audit.");
  required(operations.filter((operation) => operation.action === "blocked-merge-required-collision").length === 2, "Wheressuede and Wooodfield must be blocked as merge-required collisions.");
  required(operations.filter((operation) => operation.action === "preserve-existing-alias").length === 1, "Projection must contain exactly one existing-alias no-write decision.");
  required(operations.filter((operation) => operation.action === "blocked-pending-owner-review").length === 2, "Xanny and Sunterry must remain blocked.");
  return operations;
}

function avatarOperations(campaignDir, audit, secondReview) {
  required(secondReview.counts?.reviewed === 9, "Avatar second review must contain exactly nine reviewed candidates.");
  required(secondReview.counts?.approved === 7, "Avatar second review must contain exactly seven approved candidates.");
  required(secondReview.counts?.rejected === 2, "Avatar second review must preserve exactly two rejected candidates.");
  required(secondReview.counts?.productionWrites === 0, "Avatar second review reports production writes.");
  required(
    secondReview.records.some((record) => record.profileKey === "NERVEWING" && record.decision === "reject"),
    "Nervewing must remain rejected by the second review.",
  );
  required(
    secondReview.records.some((record) => record.profileKey === "FISHCENTERNICOLE" && record.decision === "reject"),
    "FishCenterNicole must remain rejected because its source is below 96px.",
  );
  required(secondReview.validation?.allApprovedOriginalShortestEdgesAtLeast96 === true, "Approved avatar sources must have a shortest edge of at least 96px.");
  required(secondReview.validation?.allApprovedDerivativesNotUpscaled === true, "Approved avatar derivatives must not be upscaled.");
  const profilesByKey = new Map(audit.profiles.map((profile) => [profile.key, profile]));
  const campaignPrefix = "Data/Replication Identity and Social Pass 2026-08-31/";
  const operations = secondReview.records.filter((record) => record.decision === "approve").map((record) => {
    required(record.stagedAsset, `${record.profileKey}: approved avatar has no staged asset.`);
    required(record.stagedAsset.derivativePath.startsWith(campaignPrefix), `${record.profileKey}: derivative path is outside the campaign.`);
    const derivativePath = path.join(campaignDir, record.stagedAsset.derivativePath.slice(campaignPrefix.length));
    required(existsSync(derivativePath), `Missing approved avatar derivative: ${derivativePath}`);
    const bytes = readFileSync(derivativePath);
    required(digest(bytes) === record.stagedAsset.derivativeSha256, `${record.profileKey}: approved avatar derivative digest mismatch.`);
    required(bytes.length === record.stagedAsset.derivativeBytes, `${record.profileKey}: approved avatar derivative size mismatch.`);
    const currentProfile = profilesByKey.get(record.profileKey);
    const currentAvatarSha256 = record.existingAvatarSha256 ?? currentProfile?.avatarSha256 ?? null;
    return makeOperation(
      "profile-avatar",
      { profileKey: record.profileKey },
      currentAvatarSha256 ? "propose-provenance-improving-avatar-replacement" : "propose-reviewed-avatar",
      {
        currentAvatarSha256,
        currentAvatarUrl: currentProfile?.avatarUrl ?? null,
        currentAvatarProvenance: currentProfile?.avatarProvenance ?? null,
      },
      {
        sourcePage: record.sourcePage,
        originalImageUrl: record.imageUrl,
        derivativeSha256: record.stagedAsset.derivativeSha256,
        derivativeByteSize: record.stagedAsset.derivativeBytes,
        derivativeDimensions: record.stagedAsset.derivativeDimensions,
        derivativeFormat: record.stagedAsset.derivativeFormat,
        crop: record.stagedAsset.crop,
        upscaled: record.stagedAsset.upscaled,
        originalSha256: record.stagedAsset.originalSha256,
        originalDimensions: record.stagedAsset.originalDimensions,
      },
      {
        reviewDecision: record.decision,
        reviewer: secondReview.reviewer,
        rationale: record.rationale,
        preservationNote: record.preservationNote,
      },
    );
  });
  required(new Set(operations.map((operation) => operation.target.profileKey)).size === operations.length, "Avatar proposals contain duplicate profiles.");
  required(operations.length === 7, "Avatar projection must contain exactly seven authoritative approvals.");
  return operations;
}

function socialAssetOperations(campaignDir, manifest) {
  const operations = [];
  for (const entityType of Object.keys(manifest.cards).sort()) {
    const cards = manifest.cards[entityType];
    for (const entityKey of Object.keys(cards).sort()) {
      const manifestPath = cards[entityKey];
      required(manifestPath.startsWith("/local/social-cards/"), `Unexpected social-card path: ${manifestPath}`);
      const relativeAssetPath = manifestPath.replace(/^\/local\/social-cards\//, "social-cards/assets/");
      const absoluteAssetPath = path.join(campaignDir, relativeAssetPath);
      required(existsSync(absoluteAssetPath), `Missing social-card asset: ${absoluteAssetPath}`);
      const bytes = readFileSync(absoluteAssetPath);
      operations.push(
        makeOperation(
          "social-asset",
          { entityType, entityKey },
          "upsert-generated-social-asset-metadata",
          null,
          {
            localManifestPath: manifestPath,
            sha256: digest(bytes),
            byteSize: bytes.length,
            rendererVersion: manifest.rendererVersions[entityType],
          },
          { sourceDeployment: manifest.sourceDeployment },
        ),
      );
    }
  }
  return operations;
}

export function buildProjection({ campaignDir = DEFAULT_CAMPAIGN_DIR } = {}) {
  const artifacts = Object.fromEntries(Object.entries(INPUTS).map(([key, rel]) => [key, readArtifact(campaignDir, rel)]));
  const {
    research,
    avatarsAliases,
    primary,
    secondary,
    third,
    social,
    rollout,
    avatarSecondReview,
    aliasSecondReview,
    fullAliasCollisionAudit,
    creatorChronology,
    profileBindings,
    profileBindingValidation,
  } = Object.fromEntries(
    Object.entries(artifacts).map(([key, artifact]) => [key, artifact.value]),
  );

  required(research.counts?.records === 215, "Research merge must contain exactly 215 reviewed flags.");
  required(research.counts?.creatorChangesProposed === 20, "Research merge must contain exactly 20 evidence-approved creator changes.");
  required(primary.counts?.artists === 2127, "Primary review artist count drifted from 2,127.");
  required(social.sourceDeployment === rollout.production?.convexDeployment, "Social-card and rollout deployment identities disagree.");
  required(Object.keys(social.cards.replications ?? {}).length === rollout.production?.publicationEligibleReplications, "Replication social-card coverage is incomplete.");

  const creatorOperations = applyCreatorChronology(research.records.map(creatorDecision), creatorChronology);
  const verificationOperationsList = verificationOperations(primary, secondary, third);
  const bindingOperations = profileBindingOperations(profileBindings, profileBindingValidation, verificationOperationsList);
  const operations = [
    ...creatorOperations,
    ...verificationOperationsList,
    ...bindingOperations,
    ...aliasOperations(avatarsAliases, aliasSecondReview, fullAliasCollisionAudit),
    ...avatarOperations(campaignDir, avatarsAliases, avatarSecondReview),
    ...socialAssetOperations(campaignDir, social),
  ];
  const operationIds = operations.map((operation) => operation.operationId);
  required(new Set(operationIds).size === operationIds.length, "Projection contains duplicate operation IDs.");

  const counts = {
    operations: operations.length,
    creatorAttributionDecisions: research.records.length,
    creatorChanges: operations.filter((operation) => operation.action === "set-proven-creator-with-verified-chronology").length,
    creatorPreservations: operations.filter((operation) => operation.action === "preserve-poster-as-creator-no-write" || operation.action === "blocked-preserve-poster-no-verified-chronology").length,
    blockedCreatorChanges: operations.filter((operation) => operation.action === "blocked-preserve-poster-no-verified-chronology").length,
    unresolvedCreatorDecisions: research.counts.outcomes.unresolved,
    falseAlarms: research.counts.outcomes["false-alarm"],
    confirmedCurrentCreator: research.counts.outcomes["confirmed-current-creator"],
    verificationDecisions: primary.counts.artists,
    verifiedReplicators: operations.filter((operation) => operation.kind === "replicator-verification" && operation.after.verifiedReplicator).length,
    profileBindingDecisions: bindingOperations.length,
    profileCreates: bindingOperations.filter((operation) => operation.action === "create-profile-then-bind-verification").length,
    profileBinds: bindingOperations.filter((operation) => operation.action === "bind-existing-profile-then-apply-verification").length,
    profileBindingNoWrites: bindingOperations.filter((operation) => operation.action === "preserve-unresolved-profile-binding-no-write").length,
    originalUnreviewedProfileBindingNoWrites: bindingOperations.filter((operation) => operation.action === "preserve-unresolved-profile-binding-no-write" && operation.evidence.originalUnreviewed).length,
    aliasDecisions: avatarsAliases.aliasProposals.length,
    approvedAliasAdds: operations.filter((operation) => operation.action === "add-alias-preserve-source-history").length,
    mergeRequiredAliasBlocks: operations.filter((operation) => operation.action === "blocked-merge-required-collision").length,
    existingAliasNoWrite: operations.filter((operation) => operation.action === "preserve-existing-alias").length,
    blockedAliasCandidates: operations.filter((operation) => operation.action === "blocked-pending-owner-review").length,
    avatarProposals: avatarSecondReview.counts.approved,
    avatarReplacements: operations.filter((operation) => operation.kind === "profile-avatar" && operation.action === "propose-provenance-improving-avatar-replacement").length,
    rejectedAvatarCandidates: avatarSecondReview.counts.rejected,
    socialAssets: operations.filter((operation) => operation.kind === "social-asset").length,
    replicationSocialAssets: Object.keys(social.cards.replications).length,
  };
  required(counts.creatorChanges === 6, "Projection must retain exactly six chronology-proven creator changes.");
  required(counts.blockedCreatorChanges === 14, "Projection must block and preserve exactly fourteen creator-change candidates.");
  required(counts.creatorPreservations === 209, "Projection must explicitly preserve 209 attribution decisions.");
  required(counts.profileBindingDecisions === 48 && counts.profileCreates === 21 && counts.profileBinds === 5 && counts.profileBindingNoWrites === 22, "Profile-binding operation counts drifted.");
  required(counts.originalUnreviewedProfileBindingNoWrites === 17, "The seventeen original unreviewed profile gaps must remain visible as no-write operations.");

  const core = jsonValue({
    artifactType: "replication-identity-social-local-projection",
    schemaVersion: SCHEMA_VERSION,
    mode: "local-dry-run-only",
    target: { convexDeployment: rollout.production.convexDeployment },
    sourceArtifacts: Object.values(artifacts)
      .map(({ relativePath, sha256 }) => ({ relativePath, sha256 }))
      .sort((a, b) => a.relativePath.localeCompare(b.relativePath)),
    invariants: {
      productionWrites: 0,
      creatorChangeLimit: 6,
      posterAndSourceHistoryPreserved: true,
      compareAndSetRequiredBeforeAnyFutureWrite: true,
      operationIdsImmutableFromCanonicalPayload: true,
      unresolvedAndFalseAlarmsDoNotChangeCreator: true,
      posterRemainsCreatorByDefault: true,
      missingProofStyleMismatchAndSuspicionNeverChangeCreator: true,
      creatorChangesRequireExplicitRepostCreditConflictingCreatorWatermarkOrExactEarlierOriginal: true,
      blockedCreatorChangesAreJournaledNoWritePreservations: true,
      allCreatorPreservationsAreNoWriteJournalOperations: true,
      profileCreationAndBindingRequireVerificationDependencies: true,
      deliveryReceiptsIncluded: false,
    },
    counts,
    operations,
  });
  return { ...core, projectionSha256: digest(core) };
}

export function validateProjection(projection) {
  required(projection.artifactType === "replication-identity-social-local-projection", "Unexpected projection artifact type.");
  required(projection.mode === "local-dry-run-only", "Projection is not dry-run-only.");
  required(projection.invariants?.productionWrites === 0, "Projection reports production writes.");
  const { projectionSha256, ...core } = projection;
  required(projectionSha256 === digest(core), "Projection content digest mismatch.");
  required(projection.counts.operations === projection.operations.length, "Projection operation count mismatch.");
  required(new Set(projection.operations.map((operation) => operation.operationId)).size === projection.operations.length, "Duplicate operation IDs.");
  for (const operation of projection.operations) {
    const operationCore = {
      kind: operation.kind,
      target: operation.target,
      action: operation.action,
      expectedBeforeSha256: operation.expectedBeforeSha256,
      after: operation.after,
      evidence: operation.evidence,
    };
    required(
      operation.operationId === `identity-social:${operation.kind}:${digest(operationCore).slice(0, 24)}`,
      `${operation.operationId}: operation ID is not derived from its canonical payload.`,
    );
    required(operation.expectedBeforeSha256 === digest(operation.expectedBefore), `${operation.operationId}: expected-before hash mismatch.`);
    required(operation.cas?.onMismatch === "abort-without-write", `${operation.operationId}: unsafe CAS behavior.`);
    required(operation.cas?.expectedBeforeSha256 === operation.expectedBeforeSha256, `${operation.operationId}: CAS digest mismatch.`);
  }
  return projection;
}
