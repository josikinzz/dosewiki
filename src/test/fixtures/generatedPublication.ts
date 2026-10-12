import { computeReviewedArtifactDigest, REVIEWED_ARTIFACT_DIGEST_VERSION } from "../../../lib/generatedPublication/canonical.mjs";
import {
  GENERATED_PUBLICATION_HASH_VERSION,
  computeOwnedSectionHash,
  type GeneratedPublicationDb,
  type ReviewedPublicationProposal,
} from "../../../server/lib/generatedPublication";
import { minimalArticle } from "./articles";

export function article(summary = "before summary") {
  return { ...structuredClone(minimalArticle), slug: "2c-b", summary } as Record<string, unknown>;
}

export function proposal(overrides: Partial<ReviewedPublicationProposal> = {}): ReviewedPublicationProposal {
  const baseArticle = article();
  const proposedArticle = { ...structuredClone(baseArticle), summary: "after summary" };
  const value: ReviewedPublicationProposal = {
    proposalId: "proposal-1",
    slug: "2c-b",
    profile: "summary",
    hashVersion: GENERATED_PUBLICATION_HASH_VERSION,
    baseArticle,
    proposedArticle,
    approvedPaths: ["summary"],
    expectedOwnedHash: computeOwnedSectionHash("summary", baseArticle),
    proposedOwnedHash: computeOwnedSectionHash("summary", proposedArticle),
    manifestDigest: "a".repeat(64),
    rawResponseHash: "b".repeat(64),
    targetDeploymentFingerprint: "target-test",
    artifactDigestVersion: REVIEWED_ARTIFACT_DIGEST_VERSION,
    artifactDigest: "",
    review: {
      status: "approved",
      reviewedBy: "reviewer@example.com",
      reviewedAt: "2026-07-01T00:00:00.000Z",
      artifactDigest: "",
    },
  };
  const merged = { ...value, ...overrides };
  const artifactDigest = overrides.artifactDigest ?? computeReviewedArtifactDigest(merged);
  return {
    ...merged,
    artifactDigest,
    review: overrides.review ?? { ...value.review, artifactDigest },
  };
}

export function regenerationProposal(overrides: Partial<ReviewedPublicationProposal> = {}) {
  const baseArticle = {
    ...article("Old claim [cite:old-source]"),
    priority: "low",
    index_categories: [],
    editorial_review: { status: "completed", notes: "Human review retained" },
  };
  const proposedArticle = { ...structuredClone(baseArticle), summary: "Fresh uncited narrative" };
  const value = {
    sourceArtifactKind: "excerpt_section_regeneration",
    regenerationAudit: {
      version: "excerpt-section-regeneration-v1",
      section: "summary",
      promptHash: "c".repeat(64),
      excerptHash: "d".repeat(64),
      model: "openai-codex/gpt-5.6-sol",
      thinking: "low",
    },
    baseArticle,
    proposedArticle,
    ...overrides,
  };
  const profile = overrides.profile ?? "summary";
  return proposal({
    ...value,
    expectedOwnedHash: computeOwnedSectionHash(profile, value.baseArticle),
    proposedOwnedHash: computeOwnedSectionHash(profile, value.proposedArticle),
  });
}

type FakeDb = GeneratedPublicationDb & {
  patches: Array<Record<string, unknown>>;
  inserts: Array<Record<string, unknown>>;
};

export function fakeDb({
  liveArticle = article(),
  operation = null as { payloadDigest: string; nextHash: string; proposalId?: string } | null,
} = {}): FakeDb {
  const patches: Array<Record<string, unknown>> = [];
  const inserts: Array<Record<string, unknown>> = [];
  return {
    patches,
    inserts,
    query(table: string) {
      return {
        withIndex(_index: string, callback: (query: { eq: (field: string, value: unknown) => unknown }) => unknown) {
          callback({ eq: () => ({}) });
          return {
            unique: async () => table === "generatedPublicationOperations" ? operation : null,
            take: async () => table === "substanceIndex" ? [{ _id: "article-id", _creationTime: 1, ...liveArticle }] : [],
          };
        },
      };
    },
    async patch(_id: unknown, patchValue: Record<string, unknown>) {
      patches.push(patchValue);
    },
    async insert(_table: string, value: Record<string, unknown>) {
      inserts.push(value);
      return "operation-id";
    },
  } as unknown as FakeDb;
}

