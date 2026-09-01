#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DEFAULT_CAMPAIGN_DIR, digest } from "./projection.mjs";

const PROFILE_SNAPSHOT =
  "/Users/josie/Documents/Dose Wiki Media Review/Data/Replication Index Campaign 2026-08-30/contributor-profiles-post-existing-rollout-snapshot.json";

function required(condition, message) {
  if (!condition) throw new Error(message);
}

function readJson(filePath) {
  const bytes = readFileSync(filePath);
  return { value: JSON.parse(bytes), sha256: digest(bytes) };
}

function normalizeIdentity(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function levenshtein(a, b) {
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let row = 1; row <= a.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= b.length; column += 1) {
      current[column] = Math.min(
        current[column - 1] + 1,
        previous[column] + 1,
        previous[column - 1] + (a[row - 1] === b[column - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[b.length];
}

function similarity(a, b) {
  if (!a || !b) return 0;
  return 1 - levenshtein(a, b) / Math.max(a.length, b.length);
}

function profileDiagnostics(sourceArtist, profiles) {
  const sourceValues = [
    sourceArtist.currentDisplayName,
    sourceArtist.artist,
    ...(sourceArtist.aliases ?? []),
    ...(sourceArtist.sourceHandles ?? []),
  ].filter(Boolean);
  const normalizedSources = [...new Set(sourceValues.map(normalizeIdentity).filter(Boolean))];
  const candidates = profiles
    .map((profile) => {
      const profileValues = [profile.key, profile.displayName, ...(profile.aliases ?? [])].filter(Boolean);
      const normalizedProfileValues = [...new Set(profileValues.map(normalizeIdentity).filter(Boolean))];
      let best = { score: 0, sourceValue: null, profileValue: null };
      for (const sourceValue of sourceValues) {
        for (const profileValue of profileValues) {
          const score = similarity(normalizeIdentity(sourceValue), normalizeIdentity(profileValue));
          if (score > best.score) best = { score, sourceValue, profileValue };
        }
      }
      const exactNormalized = normalizedSources.some((value) => normalizedProfileValues.includes(value));
      return {
        profileId: profile.profileId ?? null,
        profileKey: profile.key,
        displayName: profile.displayName,
        aliases: profile.aliases ?? [],
        links: profile.links ?? [],
        matchType: exactNormalized ? "exact-normalized-review-required" : "fuzzy-review-only",
        exactNormalized,
        similarity: Number(best.score.toFixed(4)),
        comparedSourceValue: best.sourceValue,
        comparedProfileValue: best.profileValue,
      };
    })
    .filter((candidate) => candidate.exactNormalized || candidate.similarity >= 0.72)
    .sort((a, b) => Number(b.exactNormalized) - Number(a.exactNormalized) || b.similarity - a.similarity || a.profileKey.localeCompare(b.profileKey))
    .slice(0, 5);
  return {
    normalization: "NFKD, lowercase, remove punctuation and whitespace; diagnostics only",
    sourceIdentityValues: sourceValues,
    normalizedSourceIdentityValues: normalizedSources,
    productionProfileSnapshotCount: profiles.length,
    exactNormalizedCandidateCount: candidates.filter((candidate) => candidate.exactNormalized).length,
    candidateCount: candidates.length,
    candidates,
    disposition: "manual-binding-required-no-profile-created-or-skipped",
  };
}

function compactWork(work) {
  return {
    replicationId: work.id ?? work.workId,
    slug: work.slug,
    title: work.title,
    artist: work.artist,
    sourceArtistDisplayName: work.sourceArtistDisplayName,
    mediaType: work.type ?? work.mediaType,
    format: work.format,
    width: work.width,
    height: work.height,
    duration: work.duration,
    sourceCatalogId: work.sourceCatalogId,
    sourceSha256: work.sourceSha256,
    sourceUrl: work.sourceUrl,
    posterName: work.posterName,
    posterProfileUrl: work.posterUrl,
    sourcePostUrl: work.sourcePostUrl,
    sourceReferences: work.sourceReferences ?? [],
    publicUrl: work.publicUrl,
  };
}

function withContentDigest(core) {
  return { ...core, contentSha256: digest(core) };
}

export function generateEvidenceQueues({ campaignDir = DEFAULT_CAMPAIGN_DIR } = {}) {
  const projectionPath = path.join(campaignDir, "identity-social-production-projection.json");
  const primaryPath = path.join(campaignDir, "review-results/artist-verification/primary-review-merged.json");
  const researchPath = path.join(campaignDir, "review-results/obvious-repost-research/research-merged.json");
  const projection = readJson(projectionPath);
  const primary = readJson(primaryPath);
  const research = readJson(researchPath);
  const profiles = readJson(PROFILE_SNAPSHOT);

  const nullProfileOperations = projection.value.operations.filter(
    (operation) => operation.kind === "replicator-verification" && operation.target.profileKey == null,
  );
  required(nullProfileOperations.length === 48, `Expected 48 null-profile verification operations, found ${nullProfileOperations.length}.`);
  const artistsById = new Map(primary.value.artists.map((artist) => [artist.artistId, artist]));
  const profileRecords = nullProfileOperations.map((operation) => {
    const artist = artistsById.get(operation.target.artistId);
    required(artist?.sourceArtist, `${operation.target.artistId}: missing source artist evidence.`);
    const sourceArtist = artist.sourceArtist;
    return {
      operationId: operation.operationId,
      artistId: operation.target.artistId,
      displayName: sourceArtist.currentDisplayName ?? sourceArtist.artist,
      aliases: sourceArtist.aliases ?? [],
      sourceHandles: sourceArtist.sourceHandles ?? [],
      profileLinks: sourceArtist.profileLinks ?? [],
      verificationDecision: {
        verdict: operation.after.verdict,
        verifiedReplicator: operation.after.verifiedReplicator,
        reviewTrail: operation.after.reviewTrail,
      },
      works: (sourceArtist.works ?? []).map(compactWork),
      existingCandidateProfiles: profileDiagnostics(sourceArtist, profiles.value.profiles),
      requiredDecision: "bind-to-reviewed-existing-profile-or-explicitly-approve-new-profile",
      prohibitedAutomaticActions: ["skip-operation", "create-profile", "fuzzy-bind-profile"],
    };
  });
  const profileQueue = withContentDigest({
    artifactType: "identity-social-null-profile-binding-evidence-queue",
    schemaVersion: 1,
    mode: "review-only-no-production-write",
    sourceArtifacts: [
      { path: projectionPath, sha256: projection.sha256 },
      { path: primaryPath, sha256: primary.sha256 },
      { path: PROFILE_SNAPSHOT, sha256: profiles.sha256 },
    ],
    counts: {
      records: profileRecords.length,
      verifiedReplicatorDecisions: profileRecords.filter((record) => record.verificationDecision.verifiedReplicator).length,
      recordsWithExactNormalizedCandidate: profileRecords.filter((record) => record.existingCandidateProfiles.exactNormalizedCandidateCount > 0).length,
      recordsWithAnyDiagnosticCandidate: profileRecords.filter((record) => record.existingCandidateProfiles.candidateCount > 0).length,
      profilesCreated: 0,
      operationsSkipped: 0,
      productionWrites: 0,
    },
    policy: {
      exactMatchesStillRequireReview: true,
      fuzzyResultsAreDiagnosticsOnly: true,
      missingBindingMustRemainVisible: true,
      profileSimilarityNeverChangesCreatorAttribution: true,
      posterRemainsCreatorByDefault: true,
    },
    records: profileRecords,
  });

  const researchByWorkId = new Map(research.value.records.map((record) => [record.workId, record]));
  const creatorOperations = projection.value.operations.filter((operation) => operation.action === "set-proven-creator-preserve-poster");
  required(creatorOperations.length === 20, `Expected 20 creator-change operations, found ${creatorOperations.length}.`);
  const creatorRecords = creatorOperations.map((operation) => {
    const record = researchByWorkId.get(operation.target.replicationId);
    required(record, `${operation.target.replicationId}: missing research record.`);
    const work = record.sourceFlag?.work;
    required(work, `${operation.target.replicationId}: missing source work.`);
    const missingTypedFields = [
      ...(typeof operation.after.originalPublishedAt === "number" ? [] : ["originalPublishedAt"]),
      ...(typeof operation.after.posterPostedAt === "number" ? [] : ["posterPostedAt"]),
      ...(typeof operation.after.sourceDigest === "string" ? [] : ["sourceDigest"]),
    ];
    required(missingTypedFields.length === 3, `${operation.operationId}: typed-field gap changed unexpectedly.`);
    return {
      operationId: operation.operationId,
      replicationId: operation.target.replicationId,
      slug: operation.target.slug,
      currentPoster: operation.expectedBefore.currentArtist,
      proposedCreator: operation.after.creatorDisplayName,
      missingTypedFields,
      requiredTypes: {
        originalPublishedAt: "finite Unix epoch milliseconds number",
        posterPostedAt: "finite Unix epoch milliseconds number",
        sourceDigest: "verified lowercase SHA-256 string",
      },
      currentUntypedLeads: {
        sourceSha256: work.sourceSha256 ?? null,
        sourceCatalogId: work.sourceCatalogId ?? null,
        importedCreatedAtNotArtworkOrPostDate: work.createdAt ?? null,
      },
      currentEvidenceRefs: {
        researchSources: operation.evidence.sources,
        sourceFlagEvidenceRefs: operation.evidence.sourceFlag?.evidenceRefs ?? [],
        sourcePostUrl: operation.expectedBefore.sourceHistory.sourcePostUrl,
        posterProfileUrl: operation.expectedBefore.sourceHistory.posterProfileUrl,
        sourceUrl: operation.expectedBefore.sourceHistory.sourceUrl,
        sourceReferences: operation.expectedBefore.sourceHistory.sourceReferences,
      },
      disposition: "blocked-from-write-until-all-three-typed-fields-are-evidenced",
    };
  });
  const creatorQueue = withContentDigest({
    artifactType: "identity-social-creator-change-typed-field-evidence-queue",
    schemaVersion: 1,
    mode: "review-only-no-production-write",
    sourceArtifacts: [
      { path: projectionPath, sha256: projection.sha256 },
      { path: researchPath, sha256: research.sha256 },
    ],
    counts: {
      records: creatorRecords.length,
      missingOriginalPublishedAt: creatorRecords.filter((record) => record.missingTypedFields.includes("originalPublishedAt")).length,
      missingPosterPostedAt: creatorRecords.filter((record) => record.missingTypedFields.includes("posterPostedAt")).length,
      missingSourceDigest: creatorRecords.filter((record) => record.missingTypedFields.includes("sourceDigest")).length,
      productionWrites: 0,
    },
    policy: {
      noDateInferenceFromImportCreatedAt: true,
      evidenceRequiredBeforeTypedFieldPopulation: true,
      creatorChangeCountMayNotExpand: true,
      posterRemainsCreatorByDefaultOutsideTheseSubstantiatedCases: true,
      missingProofStyleMismatchAndSuspicionAreNotCreatorChangeEvidence: true,
      allowedSignals: ["explicit repost", "explicit third-party credit", "conflicting watermark tied to another creator", "exact earlier attributable original"],
    },
    records: creatorRecords,
  });

  const profileOutput = path.join(campaignDir, "review-results/profile-binding/null-profile-verification-evidence-queue.json");
  const creatorOutput = path.join(campaignDir, "review-results/creator-attribution/creator-change-typed-field-evidence-queue.json");
  mkdirSync(path.dirname(profileOutput), { recursive: true });
  mkdirSync(path.dirname(creatorOutput), { recursive: true });
  writeFileSync(profileOutput, `${JSON.stringify(profileQueue, null, 2)}\n`);
  writeFileSync(creatorOutput, `${JSON.stringify(creatorQueue, null, 2)}\n`);
  return { profileOutput, creatorOutput, profileCounts: profileQueue.counts, creatorCounts: creatorQueue.counts, profileDigest: profileQueue.contentSha256, creatorDigest: creatorQueue.contentSha256 };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    process.stdout.write(`${JSON.stringify(generateEvidenceQueues(), null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  }
}
