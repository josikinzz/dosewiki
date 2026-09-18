import {
  canonicalSerialize,
  computeReviewedArtifactDigest,
  computeSectionCasHash,
  presenceAwareValue,
  REVIEWED_ARTIFACT_DIGEST_VERSION,
  sha256Text,
} from "../../lib/generatedPublication/canonical.mjs";
import { GENERATED_PUBLICATION_PROFILE_FIELDS } from "../../lib/generatedPublication/profiles.mjs";
import {
  REGENERATION_ARTIFACT_KIND,
  regenerationPublicationErrors,
} from "../../lib/generatedPublication/regeneration.mjs";
import { validateSubstanceArticleContract } from "../../src/schema/substance/contract";

export const GENERATED_PUBLICATION_HASH_VERSION = "section-cas-v1" as const;

export type GeneratedPublicationProfile =
  | "summary"
  | "dosage_duration"
  | "subjective_effects"
  | "pharmacology"
  | "interactions"
  | "tolerance"
  | "harm_potential"
  | "history_culture"
  | "legality";

export const GENERATED_PUBLICATION_PROFILES: Record<GeneratedPublicationProfile, readonly string[]> =
  GENERATED_PUBLICATION_PROFILE_FIELDS;

const PROTECTED_FIELDS = new Set([
  "id",
  "title",
  "slug",
  "priority",
  "index_categories",
  "editorial_review",
  "references",
  "source_citations",
  "citations",
]);

const own = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);

export class GeneratedPublicationError extends Error {
  constructor(
    public code: string,
    message: string,
    public details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "GeneratedPublicationError";
  }
}

function fail(code: string, message: string, details: Record<string, unknown> = {}): never {
  throw new GeneratedPublicationError(code, message, details);
}

function nonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    fail("INVALID_PROPOSAL", `${field} must be a non-empty string.`, { field });
  }
  return value.trim();
}

function cleanArticle(article: Record<string, unknown>) {
  const { _id: _id, _creationTime: _creationTime, ...content } = article;
  return content;
}

export function changedPublicationTopLevelFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
) {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((field) => (
      canonicalSerialize(presenceAwareValue(before, field)) !==
      canonicalSerialize(presenceAwareValue(after, field))
    ))
    .sort();
}

export function computeOwnedSectionHash(
  profile: GeneratedPublicationProfile,
  article: Record<string, unknown>,
) {
  return computeSectionCasHash(profile, GENERATED_PUBLICATION_PROFILES[profile], article);
}

function collectCitationMarkers(value: unknown, markers: string[] = []): string[] {
  if (typeof value === "string") {
    for (const match of value.matchAll(/\[cite:([^\]]+)\]/g)) markers.push(match[1]);
  } else if (Array.isArray(value)) {
    for (const entry of value) collectCitationMarkers(entry, markers);
  } else if (value && typeof value === "object") {
    for (const key of Object.keys(value).sort()) {
      collectCitationMarkers((value as Record<string, unknown>)[key], markers);
    }
  }
  return markers;
}

function assertCitationMarkersPreserved(
  fields: readonly string[],
  baseArticle: Record<string, unknown>,
  proposedArticle: Record<string, unknown>,
) {
  for (const field of fields) {
    const before = collectCitationMarkers(baseArticle[field]).sort();
    const after = collectCitationMarkers(proposedArticle[field]).sort();
    if (canonicalSerialize(before) !== canonicalSerialize(after)) {
      fail("CITATION_MARKERS_CHANGED", `Generated publication cannot add, remove, or replace citation markers in ${field}.`, { field });
    }
  }
}

function assertExactOwnedValidation(
  prospectiveArticle: Record<string, unknown>,
  changedFields: readonly string[],
) {
  const validation = validateSubstanceArticleContract(prospectiveArticle);
  if (!validation.ok) {
    fail("INVALID_ARTICLE", "The prospective article fails the canonical article contract.", {
      issues: validation.issues,
    });
  }

  const parsed = validation.article as Record<string, unknown>;
  for (const field of changedFields) {
    if (
      canonicalSerialize(presenceAwareValue(prospectiveArticle, field)) !==
      canonicalSerialize(presenceAwareValue(parsed, field))
    ) {
      fail("SECTION_VALIDATION_CHANGED_VALUE", `Validation would normalize or strip proposed ${field} data.`, { field });
    }
  }
}

export type ReviewedPublicationProposal = {
  proposalId: string;
  slug: string;
  profile: GeneratedPublicationProfile;
  hashVersion: typeof GENERATED_PUBLICATION_HASH_VERSION;
  baseArticle: Record<string, unknown>;
  proposedArticle: Record<string, unknown>;
  approvedPaths: string[];
  expectedOwnedHash: string;
  proposedOwnedHash: string;
  manifestDigest: string;
  rawResponseHash: string;
  targetDeploymentFingerprint: string;
  artifactDigestVersion: typeof REVIEWED_ARTIFACT_DIGEST_VERSION;
  artifactDigest: string;
  sourceArtifactKind?: string;
  regenerationAudit?: {
    version: string;
    section: string;
    promptHash: string;
    excerptHash: string;
    model: string;
    thinking: string;
  };
  review: {
    status: "approved";
    reviewedBy: string;
    reviewedAt: string;
    artifactDigest: string;
  };
};

function requireSha256(value: unknown, field: string) {
  const digest = nonEmptyString(value, field);
  if (!/^[a-f0-9]{64}$/.test(digest)) {
    fail("INVALID_PROPOSAL", `${field} must be a lowercase SHA-256 digest.`, { field });
  }
  return digest;
}

function requireArticleSlug(article: Record<string, unknown>, field: string) {
  return nonEmptyString(article.slug, `${field}.slug`);
}

export function requireGeneratedPublicationDeploymentFingerprint(
  env: Record<string, string | undefined> = process.env,
) {
  const fingerprint = env.GENERATED_PUBLICATION_DEPLOYMENT_FINGERPRINT?.trim();
  if (!fingerprint || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(fingerprint)) {
    fail(
      "DEPLOYMENT_BINDING_NOT_CONFIGURED",
      "GENERATED_PUBLICATION_DEPLOYMENT_FINGERPRINT must name this exact Postgres target.",
    );
  }
  return fingerprint;
}

export function validateReviewedPublicationProposal(
  proposal: ReviewedPublicationProposal,
  expectedTargetDeploymentFingerprint: string,
) {
  nonEmptyString(proposal.proposalId, "proposalId");
  const proposalSlug = nonEmptyString(proposal.slug, "slug");
  nonEmptyString(proposal.review?.reviewedBy, "review.reviewedBy");
  nonEmptyString(proposal.review?.reviewedAt, "review.reviewedAt");
  const reviewedArtifactDigest = requireSha256(proposal.review?.artifactDigest, "review.artifactDigest");
  requireSha256(proposal.manifestDigest, "manifestDigest");
  requireSha256(proposal.rawResponseHash, "rawResponseHash");
  const artifactDigest = requireSha256(proposal.artifactDigest, "artifactDigest");
  if (proposal.review?.status !== "approved") {
    fail("REVIEW_REQUIRED", "Publication requires an explicitly approved review envelope.");
  }
  if (proposal.artifactDigestVersion !== REVIEWED_ARTIFACT_DIGEST_VERSION) {
    fail("UNSUPPORTED_ARTIFACT_DIGEST_VERSION", `Unsupported artifact digest version: ${proposal.artifactDigestVersion}.`);
  }
  if (proposal.hashVersion !== GENERATED_PUBLICATION_HASH_VERSION) {
    fail("UNSUPPORTED_HASH_VERSION", `Unsupported publication hash version: ${proposal.hashVersion}.`);
  }
  if (!Object.prototype.hasOwnProperty.call(GENERATED_PUBLICATION_PROFILES, proposal.profile)) {
    fail("UNKNOWN_PROFILE", `Unknown generated publication profile: ${proposal.profile}.`);
  }
  if (!proposal.baseArticle || typeof proposal.baseArticle !== "object" || Array.isArray(proposal.baseArticle)) {
    fail("INVALID_PROPOSAL", "baseArticle must be an article object.");
  }
  if (!proposal.proposedArticle || typeof proposal.proposedArticle !== "object" || Array.isArray(proposal.proposedArticle)) {
    fail("INVALID_PROPOSAL", "proposedArticle must be an article object.");
  }
  const baseSlug = requireArticleSlug(proposal.baseArticle, "baseArticle");
  const proposedSlug = requireArticleSlug(proposal.proposedArticle, "proposedArticle");
  if (proposalSlug !== baseSlug || proposalSlug !== proposedSlug) {
    fail("ARTICLE_SLUG_MISMATCH", "proposal.slug, baseArticle.slug, and proposedArticle.slug must match exactly.", {
      proposalSlug,
      baseSlug,
      proposedSlug,
    });
  }

  const targetDeploymentFingerprint = nonEmptyString(
    proposal.targetDeploymentFingerprint,
    "targetDeploymentFingerprint",
  );
  const expectedDeployment = nonEmptyString(
    expectedTargetDeploymentFingerprint,
    "expectedTargetDeploymentFingerprint",
  );
  if (targetDeploymentFingerprint !== expectedDeployment) {
    fail("TARGET_DEPLOYMENT_MISMATCH", "Proposal target deployment does not match this publication deployment.", {
      targetDeploymentFingerprint,
      expectedDeployment,
    });
  }

  if (!Array.isArray(proposal.approvedPaths) || new Set(proposal.approvedPaths).size !== proposal.approvedPaths.length) {
    fail("INVALID_APPROVED_PATHS", "approvedPaths must be a duplicate-free array.");
  }

  const ownedFields = GENERATED_PUBLICATION_PROFILES[proposal.profile];
  const changedFields = changedPublicationTopLevelFields(proposal.baseArticle, proposal.proposedArticle);
  const approvedPaths = [...proposal.approvedPaths].sort();
  if (canonicalSerialize(changedFields) !== canonicalSerialize(approvedPaths)) {
    fail("APPROVED_PATHS_MISMATCH", "approvedPaths must exactly equal the proposal's top-level diff.", {
      changedFields,
      approvedPaths,
    });
  }
  for (const field of approvedPaths) {
    if (PROTECTED_FIELDS.has(field) || !ownedFields.includes(field as never)) {
      fail("UNOWNED_FIELD_CHANGE", `Profile ${proposal.profile} cannot publish ${field}.`, { field });
    }
  }

  const expectedOwnedHash = computeOwnedSectionHash(proposal.profile, proposal.baseArticle);
  const proposedOwnedHash = computeOwnedSectionHash(proposal.profile, proposal.proposedArticle);
  if (proposal.expectedOwnedHash !== expectedOwnedHash) {
    fail("EXPECTED_HASH_MISMATCH", "expectedOwnedHash does not match baseArticle.");
  }
  if (proposal.proposedOwnedHash !== proposedOwnedHash) {
    fail("PROPOSED_HASH_MISMATCH", "proposedOwnedHash does not match proposedArticle.");
  }
  const computedArtifactDigest = computeReviewedArtifactDigest(proposal);
  if (artifactDigest !== computedArtifactDigest || reviewedArtifactDigest !== computedArtifactDigest) {
    fail("ARTIFACT_DIGEST_MISMATCH", "Reviewed artifact digest does not bind the submitted manifest, response, and proposal content.", {
      computedArtifactDigest,
    });
  }
  const regenerationErrors = regenerationPublicationErrors(proposal);
  if (regenerationErrors.length) {
    fail("INVALID_REGENERATION_PROPOSAL", regenerationErrors.join("; "));
  }
  if (proposal.sourceArtifactKind !== REGENERATION_ARTIFACT_KIND) {
    assertCitationMarkersPreserved(ownedFields, proposal.baseArticle, proposal.proposedArticle);
  }

  return { ownedFields, changedFields, expectedOwnedHash, proposedOwnedHash, artifactDigest };
}

export function generatedPublicationPayloadDigest(proposal: ReviewedPublicationProposal) {
  return sha256Text(canonicalSerialize(proposal));
}

type IndexPredicate = {
  eq: (field: string, value: unknown) => unknown;
};

type GeneratedPublicationOperationRecord = {
  payloadDigest: string;
  nextHash: string;
};

type StoredArticle = Record<string, unknown> & {
  _id: unknown;
};

export type GeneratedPublicationDb = {
  query: {
    (table: "generatedPublicationOperations"): {
      withIndex: (
        index: "by_proposal_id",
        predicate: (query: IndexPredicate) => unknown,
      ) => { unique: () => Promise<GeneratedPublicationOperationRecord | null> };
    };
    (table: "substanceIndex"): {
      withIndex: (
        index: "by_slug",
        predicate: (query: IndexPredicate) => unknown,
      ) => { take: (limit: number) => Promise<StoredArticle[]> };
    };
  };
  patch: (id: unknown, patch: Record<string, unknown>) => Promise<void>;
  insert: (table: "generatedPublicationOperations", value: Record<string, unknown>) => Promise<unknown>;
};

export type ReviewedSectionPublishResult =
  | { status: "already_applied"; proposalId: string; currentHash: string }
  | { status: "conflict"; proposalId: string; expectedHash: string; currentHash: string }
  | { status: "updated"; proposalId: string; affectedPaths: readonly string[]; previousHash: string; nextHash: string };

export async function publishReviewedSectionTransaction({
  db,
  proposal,
  actorEmail,
  now,
  expectedTargetDeploymentFingerprint,
}: {
  db: GeneratedPublicationDb;
  proposal: ReviewedPublicationProposal;
  actorEmail: string;
  now: string;
  expectedTargetDeploymentFingerprint: string;
}): Promise<ReviewedSectionPublishResult> {
  const actor = nonEmptyString(actorEmail, "actorEmail");
  const validated = validateReviewedPublicationProposal(proposal, expectedTargetDeploymentFingerprint);
  const payloadDigest = generatedPublicationPayloadDigest(proposal);
  const existingOperation = await db
    .query("generatedPublicationOperations")
    .withIndex("by_proposal_id", (query) => query.eq("proposalId", proposal.proposalId))
    .unique();
  if (existingOperation) {
    if (existingOperation.payloadDigest !== payloadDigest) {
      fail("IDEMPOTENCY_KEY_REUSED", "proposalId was already used with a different payload.");
    }
    if (proposal.sourceArtifactKind !== REGENERATION_ARTIFACT_KIND) {
      return {
        status: "already_applied" as const,
        proposalId: proposal.proposalId,
        currentHash: existingOperation.nextHash,
      };
    }
  }

  const articles = await db
    .query("substanceIndex")
    .withIndex("by_slug", (query) => query.eq("slug", proposal.slug))
    .take(2);
  if (articles.length !== 1) {
    fail("ARTICLE_IDENTITY_ERROR", `Expected exactly one article for slug ${proposal.slug}.`, {
      matches: articles.length,
    });
  }
  const liveArticle = cleanArticle(articles[0]);
  if (proposal.sourceArtifactKind === REGENERATION_ARTIFACT_KIND) {
    const errors = regenerationPublicationErrors(proposal, { liveArticle });
    if (errors.length) fail("INVALID_REGENERATION_PROPOSAL", errors.join("; "));
  }
  if (existingOperation) {
    return {
      status: "already_applied" as const,
      proposalId: proposal.proposalId,
      currentHash: existingOperation.nextHash,
    };
  }
  const currentHash = computeOwnedSectionHash(proposal.profile, liveArticle);
  if (currentHash === validated.proposedOwnedHash) {
    return {
      status: "already_applied" as const,
      proposalId: proposal.proposalId,
      currentHash,
    };
  }
  if (currentHash !== validated.expectedOwnedHash) {
    return {
      status: "conflict" as const,
      proposalId: proposal.proposalId,
      expectedHash: validated.expectedOwnedHash,
      currentHash,
    };
  }

  const patch: Record<string, unknown> = {};
  for (const field of validated.changedFields) {
    if (!validated.ownedFields.includes(field as never) || PROTECTED_FIELDS.has(field)) {
      fail("PATCH_BOUNDARY_VIOLATION", `Refusing to patch non-owned field ${field}.`, { field });
    }
    if (!own(proposal.proposedArticle, field)) {
      fail("FIELD_DELETION_NOT_SUPPORTED", `Generated publication cannot delete ${field}.`, { field });
    }
    patch[field] = proposal.proposedArticle[field];
  }

  const prospective = { ...liveArticle, ...patch };
  assertExactOwnedValidation(prospective, validated.changedFields);
  await db.patch(articles[0]._id, patch);
  await db.insert("generatedPublicationOperations", {
    proposalId: proposal.proposalId,
    payloadDigest,
    artifactDigest: validated.artifactDigest,
    manifestDigest: proposal.manifestDigest,
    rawResponseHash: proposal.rawResponseHash,
    targetDeploymentFingerprint: proposal.targetDeploymentFingerprint,
    slug: proposal.slug,
    profile: proposal.profile,
    affectedPaths: validated.changedFields,
    actorEmail: actor,
    reviewedBy: proposal.review.reviewedBy.trim(),
    reviewedAt: proposal.review.reviewedAt.trim(),
    previousHash: currentHash,
    nextHash: validated.proposedOwnedHash,
    hashVersion: GENERATED_PUBLICATION_HASH_VERSION,
    createdAt: now,
  });

  return {
    status: "updated" as const,
    proposalId: proposal.proposalId,
    affectedPaths: validated.changedFields,
    previousHash: currentHash,
    nextHash: validated.proposedOwnedHash,
  };
}
