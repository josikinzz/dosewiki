/**
 * Writes a small synthetic Identity and Social Pass campaign directory that
 * satisfies every pinned precondition of `projection.mjs`: the reviewed
 * population sizes (215 research flags, 20 change candidates split 6/14,
 * 2,127 verification decisions with 48 null-profile bindings split 21/5/22,
 * five alias proposals, nine avatar candidates split 7/2) and the full
 * production profile-set CAS digest. Review artifacts that are keyed by
 * operation ID are derived exactly as the campaign reviewers derived them:
 * from the projection's own decision builders.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { creatorDecision, digest, verificationOperations } from "../projection.mjs";

const CAMPAIGN_DEPLOYMENT = "prod:glad-minnow-656";
export const FULL_PRODUCTION_PROFILE_SET_SHA256 = "aea1bbeac1ce5a10e7e3a0981af17b40909c13ecf04fcf49299bbb32f66c2d8d";
export const FULL_PRODUCTION_PROFILE_COUNT = 2119;
const CAMPAIGN_PREFIX = "Data/Replication Identity and Social Pass 2026-08-31/";
export const APPROVED_AVATAR_KEYS = ["JOHNARCHIBALDWHEELER", "JOHNTENNIEL", "JOSIE", "LOKA", "MIDJOURNEY", "PHOSFORM", "SYMMETRICVISION"];
export const AVATAR_REPLACEMENT_KEYS = ["JOSIE", "LOKA", "PHOSFORM", "SYMMETRICVISION"];
export const REJECTED_AVATAR_KEYS = ["NERVEWING", "FISHCENTERNICOLE"];
export const SOCIAL_CARDS = { replications: ["alpha-replication", "beta-replication", "gamma-replication"], substances: ["lsd"] };

const pad = (value, width = 4) => String(value).padStart(width, "0");

function writeJson(campaignDir, relativePath, value) {
  const absolutePath = path.join(campaignDir, relativePath);
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeBytes(campaignDir, relativePath, bytes) {
  const absolutePath = path.join(campaignDir, relativePath);
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, bytes);
  return { sha256: digest(bytes), byteSize: bytes.length };
}

function researchRecord(index) {
  const number = pad(index + 1);
  const workId = `work-${number}`;
  const work = {
    id: workId,
    slug: `replication-${number}`,
    artist: `u/poster${number}`,
    posterName: `u/poster${number}`,
    posterUrl: `https://reddit.com/u/poster${number}`,
    sourcePostUrl: `https://reddit.com/r/replications/comments/${number}`,
    sourceUrl: null,
    sourceReferences: [{ post_url: `https://reddit.com/r/replications/comments/${number}` }],
    attributionDisposition: null,
    creditLine: null,
    sourceArtistDisplayName: `u/poster${number}`,
  };
  if (index < 20) {
    return {
      workId,
      outcome: "confirmed-repost",
      creatorChangeProposed: true,
      provenCreator: `Original Creator ${number}`,
      rationale: "Explicit repost language credits an earlier attributable original.",
      researcher: "researcher-a",
      methods: ["reverse-image-search", "post-text-review"],
      evidence: [{ authority: "creator-controlled-or-attributable-original", publishedBeforeCurrentPost: true, url: `https://creator.example/${number}` }],
      sourceFlag: { flag: { signal: "explicit-repost-language" }, work },
    };
  }
  const outcome = index < 170 ? "unresolved" : index < 200 ? "false-alarm" : "confirmed-current-creator";
  return {
    workId,
    outcome,
    creatorChangeProposed: false,
    provenCreator: outcome === "confirmed-current-creator" ? work.artist : null,
    rationale: "No attributable earlier source was found.",
    researcher: "researcher-b",
    methods: ["reverse-image-search"],
    evidence: [],
    sourceFlag: { flag: { signal: "style-mismatch-suspicion" }, work },
  };
}

function artistRecord(index) {
  const number = pad(index + 1);
  const nullProfile = index < 48;
  return {
    artistId: `artist-${number}`,
    reviewer: "reviewer-primary",
    verdict: index % 3 === 0 ? "verified-replicator" : "unverified",
    confidence: "high",
    rationale: "Primary review of credited works.",
    sourceArtist: {
      profileKey: nullProfile ? null : `PROFILE${number}`,
      currentDisplayName: `Artist ${number}`,
      verificationStatus: "unverified",
      aliases: [],
      profileLinks: [],
      sourceSheetBatch: `batch-${pad(Math.floor(index / 100), 2)}`,
      workCount: (index % 5) + 1,
    },
  };
}

function aliasArtifacts() {
  const reviewedMapping = (alias, canonicalProfileKey, operation, existingOwners) => ({
    alias,
    decision: "approve",
    canonicalProfileKey,
    operation,
    absenceOfConflict: { conflictingProfileOwnersFound: false, existingOwnersOfNormalizedAlias: existingOwners },
    confidence: "high",
    evidence: ["archive credit lines"],
    identityConclusion: "same-person",
    preservationRequirements: ["keep archive credit form"],
    rollback: { action: "remove-only-the-added-alias" },
  });
  const proposal = (observedArchiveForm, canonicalProfileKey, canonicalDisplayName, decision) => ({
    observedArchiveForm,
    canonicalProfileKey,
    canonicalDisplayName,
    decision,
    currentState: { aliasPresent: false },
    preserve: ["archive credit form"],
    confidence: "medium",
    evidence: ["archive credit lines"],
  });
  return {
    aliasProposals: [
      proposal("Wooodfield", "WOODFIELD", "Woodfield", "add-as-alias"),
      proposal("wheressuede", "WHERESSUEDE", "Wheres Suede", "add-as-alias"),
      proposal("Symmetric Vision", "SYMMETRICVISION", "Symmetric Vision", "preserve-existing-alias"),
      proposal("Xanny", "HYPERACTIVEFILLY", "Hyperactive Filly", "candidate-add-as-alias-after-final-owner-review"),
      proposal("Sunterry", "SUNTERRYART", "Sunterry Art", "candidate-add-as-alias-after-final-owner-review"),
    ],
    secondReview: {
      artifactType: "approved-aliases-independent-second-review",
      mode: "read-only-local-review",
      productionWrites: 0,
      scope: { requestedMappings: 3, approved: 3, newAliasAddsApproved: 2, existingAliasPreserved: 1, productionWrites: 0 },
      collisionAudit: { existingNormalizedIdentityCollisionsAcrossProfileKeysDisplayNamesAndAliases: 0 },
      mappings: [
        reviewedMapping("Wooodfield", "WOODFIELD", "add-alias-preserve-source-history", 0),
        reviewedMapping("wheressuede", "WHERESSUEDE", "add-alias-preserve-source-history", 0),
        reviewedMapping("Symmetric Vision", "SYMMETRICVISION", "preserve-existing-normalized-alias-no-write", 1),
      ],
    },
    fullAudit: {
      operation: "full-production-contributor-alias-collision-audit",
      productionWrites: 0,
      safety: { productionWrites: 0 },
      snapshot: { contributorProfileCount: FULL_PRODUCTION_PROFILE_COUNT, canonicalProfileSetSha256: FULL_PRODUCTION_PROFILE_SET_SHA256 },
      globalIdentityCollisionAudit: { normalizedWholeNameCrossProfileCollisionCount: 0 },
      approvedMappings: [
        { source: "Wooodfield", decision: "merge-required-collision", sourceRow: { canonicalSha256: digest("wooodfield-source") }, targetRow: { canonicalSha256: digest("woodfield-target") }, mergePrecondition: "A separate WOOODFIELD profile already owns the alias.", contentConflict: { bio: true } },
        { source: "wheressuede", decision: "merge-required-collision", sourceRow: { canonicalSha256: digest("wheressuede-source") }, targetRow: { canonicalSha256: digest("wheressuede-target") }, mergePrecondition: "A separate profile already owns the alias.", contentConflict: null },
        { source: "Symmetric Vision", decision: "already-settled-no-write", sourceRow: null, targetRow: { canonicalSha256: digest("symmetricvision-target") }, mergePrecondition: null, contentConflict: null },
      ],
      blockedMappings: [
        { source: "Xanny", decision: "blocked-pending-owner-review", reason: "Owner confirmation outstanding.", targetRow: { canonicalSha256: digest("hyperactivefilly-target") } },
        { source: "Sunterry", decision: "blocked-pending-owner-review", reason: "Owner confirmation outstanding.", targetRow: { canonicalSha256: digest("sunterryart-target") } },
      ],
      rollbackContract: { action: "restore-pre-merge-profile-rows-from-canonical-snapshot" },
    },
  };
}

function avatarArtifacts(campaignDir) {
  const profiles = AVATAR_REPLACEMENT_KEYS.map((key) => ({
    key,
    avatarSha256: digest(`current-avatar-${key}`),
    avatarUrl: `/profile-avatars/${key.toLowerCase()}/avatar.webp`,
    avatarProvenance: { source: "legacy-upload" },
  }));
  const records = [...APPROVED_AVATAR_KEYS.map((key) => {
    const bytes = Buffer.from(`synthetic avatar derivative for ${key}`);
    const staged = writeBytes(campaignDir, `avatars/${key.toLowerCase()}.png`, bytes);
    return {
      profileKey: key,
      decision: "approve",
      sourcePage: `https://profiles.example/${key.toLowerCase()}`,
      imageUrl: `https://profiles.example/${key.toLowerCase()}/avatar.png`,
      rationale: "Creator-controlled page publishes this portrait.",
      preservationNote: "Original retained in the evidence library.",
      stagedAsset: {
        derivativePath: `${CAMPAIGN_PREFIX}avatars/${key.toLowerCase()}.png`,
        derivativeSha256: staged.sha256,
        derivativeBytes: staged.byteSize,
        derivativeDimensions: [600, 600],
        derivativeFormat: "png",
        crop: { x: 0, y: 0, width: 600, height: 600 },
        upscaled: false,
        originalSha256: digest(`original-${key}`),
        originalDimensions: [1200, 1200],
      },
    };
  }), ...REJECTED_AVATAR_KEYS.map((key) => ({
    profileKey: key,
    decision: "reject",
    sourcePage: `https://profiles.example/${key.toLowerCase()}`,
    imageUrl: `https://profiles.example/${key.toLowerCase()}/avatar.png`,
    rationale: "Source is below the 96px floor.",
    preservationNote: null,
    stagedAsset: null,
  }))];
  return {
    profiles,
    secondReview: {
      reviewer: "reviewer-avatars",
      counts: { reviewed: 9, approved: 7, rejected: 2, productionWrites: 0 },
      validation: { allApprovedOriginalShortestEdgesAtLeast96: true, allApprovedDerivativesNotUpscaled: true },
      records,
    },
  };
}

function socialArtifacts(campaignDir) {
  const cards = {};
  for (const [entityType, keys] of Object.entries(SOCIAL_CARDS)) {
    cards[entityType] = {};
    for (const key of keys) {
      writeBytes(campaignDir, `social-cards/assets/${entityType}/${key}.png`, Buffer.from(`synthetic ${entityType} card ${key}`));
      cards[entityType][key] = `/local/social-cards/${entityType}/${key}.png`;
    }
  }
  return {
    sourceDeployment: CAMPAIGN_DEPLOYMENT,
    rendererVersions: { replications: "social-card-renderer-v1", substances: "social-card-renderer-v1" },
    cards,
  };
}

function profileBindingArtifacts(nullVerificationOperations) {
  const reviewed = nullVerificationOperations.slice(0, 31).map((operation, index) => {
    const number = pad(index + 1, 2);
    const base = {
      operationId: operation.operationId,
      artistId: operation.target.artistId,
      displayName: operation.expectedBefore.displayName,
      firstReviewDecision: "approve-new-profile",
      secondReviewDecision: "confirmed",
      confidence: "high",
      rationale: "Both reviewers agreed on the profile disposition.",
    };
    if (index < 21) {
      return { ...base, finalDecision: "approve-new-profile", validatedProfile: { profileKey: `NEWPROFILE${number}`, displayName: `New Profile ${number}`, aliases: [], links: [] } };
    }
    if (index < 26) {
      return { ...base, firstReviewDecision: "bind-existing", finalDecision: "bind-existing", validatedProfile: { profileId: `kx7profile${number}`, profileKey: `EXISTING${number}`, displayName: `Existing ${number}` } };
    }
    return { ...base, firstReviewDecision: "unresolved", secondReviewDecision: "unresolved", finalDecision: "unresolved-no-write", validatedProfile: null, confidence: "conservative" };
  });
  const originalUnresolvedNoWrite = nullVerificationOperations.slice(31).map((operation) => ({ operationId: operation.operationId, artistId: operation.target.artistId }));
  return {
    review: {
      artifactType: "profile-binding-reviewed",
      productionWrites: 0,
      counts: { records: 31, approveNewProfile: 21, bindExisting: 5, unresolvedNoWrite: 5, productionWrites: 0 },
      fullProductionBaseline: { profileCount: FULL_PRODUCTION_PROFILE_COUNT, liveCanonicalProfileSetSha256: FULL_PRODUCTION_PROFILE_SET_SHA256 },
      validation: { approvedProfileKeysCheckedAgainstFullSnapshot: true, approvedProfileKeyCollisions: [] },
      records: reviewed,
    },
    validation: {
      artifactType: "profile-binding-reviewed-validation",
      result: "pass-with-risk-flags",
      productionWrites: 0,
      counts: { originalQueue: 48, finalUniqueDispositions: 48, approveNewProfile: 21, bindExisting: 5, unresolvedNoWrite: 22, productionWrites: 0 },
      invariants: {
        allOriginalOperationIdsPresentExactlyOnce: true,
        noExtraFinalOperationIds: true,
        noDuplicateFinalOperationIds: true,
        snapshotCanonicalProfileSetSha256: FULL_PRODUCTION_PROFILE_SET_SHA256,
      },
      identityRiskFlags: {
        jointProfiles: [{ profileKey: "NEWPROFILE01", members: ["Member A", "Member B"] }],
        pseudonymousOrHandleProfiles: [{ profileKey: "NEWPROFILE02", handle: "@newprofile02" }],
      },
      originalUnresolvedNoWrite,
    },
  };
}

/** Writes the synthetic campaign into `campaignDir` and returns the facts tests assert against. */
export function writeSyntheticCampaign(campaignDir) {
  const research = {
    counts: { records: 215, creatorChangesProposed: 20, outcomes: { unresolved: 150, "false-alarm": 30, "confirmed-current-creator": 15 } },
    records: Array.from({ length: 215 }, (_, index) => researchRecord(index)),
  };
  const changeOperations = research.records.filter((record) => record.creatorChangeProposed).map(creatorDecision);
  const chronology = {
    artifactType: "identity-social-creator-change-typed-fields-merged",
    productionWrites: 0,
    counts: { records: 20, retainChange: 6, blocked: 14, productionWrites: 0 },
    validation: { exactQueueCoverage: true, retainedChronologyStrictlyEarlier: true },
    records: changeOperations.map((operation, index) => ({
      operationId: operation.operationId,
      replicationId: operation.target.replicationId,
      currentPoster: operation.expectedBefore.currentArtist,
      proposedCreator: operation.after.creatorDisplayName,
      decision: index < 6 ? "retain-change" : "blocked",
      originalPublishedAt: index < 6 ? 1_600_000_000_000 + index : null,
      posterPostedAt: index < 6 ? 1_700_000_000_000 + index : null,
      sourceDigest: index < 6 ? digest(`chronology-source-${index}`) : null,
      reason: index < 6 ? null : "Earlier publication could not be dated.",
    })),
  };

  const primary = { counts: { artists: 2127 }, artists: Array.from({ length: 2127 }, (_, index) => artistRecord(index)) };
  const secondary = {
    finalizedArtists: primary.artists.slice(100, 103).map((artist) => ({
      artistId: artist.artistId,
      verdict: "verified-replicator",
      primary: { sourceArtist: artist.sourceArtist },
      secondary: { reviewer: "reviewer-secondary", verdict: "verified-replicator", confidence: "high", rationale: "Secondary confirmation." },
    })),
  };
  const third = {
    records: [{ kind: "artist-verdict", key: primary.artists[100].artistId, decision: "unverified", reviewer: "reviewer-third", rationale: "Third review overturned." }],
  };
  const nullVerificationOperations = verificationOperations(primary, secondary, third).filter((operation) => operation.target.profileKey == null);
  const binding = profileBindingArtifacts(nullVerificationOperations);
  const aliases = aliasArtifacts();
  const avatars = avatarArtifacts(campaignDir);
  const social = socialArtifacts(campaignDir);

  writeJson(campaignDir, "review-results/obvious-repost-research/research-merged.json", research);
  writeJson(campaignDir, "review-results/creator-attribution/creator-change-typed-fields-merged.json", chronology);
  writeJson(campaignDir, "review-results/artist-verification/primary-review-merged.json", primary);
  writeJson(campaignDir, "review-results/artist-verification/secondary-review-merged.json", secondary);
  writeJson(campaignDir, "review-results/artist-verification/third-review-merged.json", third);
  writeJson(campaignDir, "review-results/profile-binding/profile-binding-reviewed.json", binding.review);
  writeJson(campaignDir, "review-results/profile-binding/profile-binding-reviewed-validation.json", binding.validation);
  writeJson(campaignDir, "avatar-alias-audit-2026-08-31.json", { profiles: avatars.profiles, aliasProposals: aliases.aliasProposals });
  writeJson(campaignDir, "review-results/alias-research/approved-aliases-second-review.json", aliases.secondReview);
  writeJson(campaignDir, "review-results/alias-research/full-production-collision-audit.json", aliases.fullAudit);
  writeJson(campaignDir, "review-results/avatar-research/avatar-candidate-second-review.json", avatars.secondReview);
  writeJson(campaignDir, "social-cards/entity-social-card-local-manifest.json", social);
  writeJson(campaignDir, "p7-rollout-contract-audit-2026-08-31.json", {
    production: { convexDeployment: CAMPAIGN_DEPLOYMENT, publicationEligibleReplications: SOCIAL_CARDS.replications.length },
  });

  return {
    campaignDir,
    currentAvatarSha256: Object.fromEntries(avatars.profiles.map((profile) => [profile.key, profile.avatarSha256])),
    chronology,
  };
}
