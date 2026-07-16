import { describe, expect, it } from "vitest";

import {
  computeReviewedArtifactDigest,
  REVIEWED_ARTIFACT_DIGEST_VERSION,
} from "../../lib/generatedPublication/canonical.mjs";
import { minimalArticle } from "../test/fixtures/articles";
import {
  GENERATED_PUBLICATION_HASH_VERSION,
  GeneratedPublicationError,
  computeOwnedSectionHash,
  publishReviewedSectionTransaction,
  validateReviewedPublicationProposal,
  type ReviewedPublicationProposal,
} from "../../convex/lib/generatedPublication";

function article(summary = "before summary") {
  return { ...structuredClone(minimalArticle), slug: "2c-b", summary } as Record<string, unknown>;
}

function proposal(overrides: Partial<ReviewedPublicationProposal> = {}): ReviewedPublicationProposal {
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

function fakeDb({ liveArticle = article(), operation = null as Record<string, unknown> | null } = {}) {
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
  };
}

describe("generated section CAS publication", () => {
  it("patches only approved owned fields and preserves a concurrent unrelated-section edit", async () => {
    const reviewed = proposal();
    const liveArticle = {
      ...structuredClone(reviewed.baseArticle),
      legality: { ...(reviewed.baseArticle.legality as object), international: ["concurrent unrelated edit"] },
    };
    const db = fakeDb({ liveArticle });

    const result = await publishReviewedSectionTransaction({
      db,
      proposal: reviewed,
      actorEmail: "editor@example.com",
      now: "2026-07-01T01:00:00.000Z",
      expectedTargetDeploymentFingerprint: "target-test",
    });

    expect(result.status).toBe("updated");
    expect(db.patches).toEqual([{ summary: "after summary" }]);
    expect(db.patches[0]).not.toHaveProperty("legality");
    expect(db.inserts).toHaveLength(1);
  });

  it("returns a stale owned-section conflict with no writes", async () => {
    const reviewed = proposal();
    const db = fakeDb({ liveArticle: article("concurrent summary edit") });

    const result = await publishReviewedSectionTransaction({
      db,
      proposal: reviewed,
      actorEmail: "editor@example.com",
      now: "2026-07-01T01:00:00.000Z",
      expectedTargetDeploymentFingerprint: "target-test",
    });

    expect(result.status).toBe("conflict");
    expect(db.patches).toEqual([]);
    expect(db.inserts).toEqual([]);
    expect(result).not.toHaveProperty("currentSection");
  });

  it("rejects top-level changes outside the closed profile and citation marker changes", () => {
    const reviewed = proposal();
    const escaped = {
      ...reviewed,
      proposedArticle: { ...reviewed.proposedArticle, legality: { countries: { unsafe: true } } },
      approvedPaths: ["legality", "summary"],
    };
    escaped.proposedOwnedHash = computeOwnedSectionHash("summary", escaped.proposedArticle);
    expect(() => validateReviewedPublicationProposal(escaped, "target-test")).toThrowError(
      expect.objectContaining({ code: "UNOWNED_FIELD_CHANGE" }),
    );

    const citedBase = article("Supported claim [cite:paper-1]");
    const citedAfter = { ...citedBase, summary: "Changed claim" };
    const citationChange = proposal({
      baseArticle: citedBase,
      proposedArticle: citedAfter,
      expectedOwnedHash: computeOwnedSectionHash("summary", citedBase),
      proposedOwnedHash: computeOwnedSectionHash("summary", citedAfter),
    });
    expect(() => validateReviewedPublicationProposal(citationChange, "target-test")).toThrowError(
      expect.objectContaining({ code: "CITATION_MARKERS_CHANGED" }),
    );
  });

  it("requires a delegated actor and rejects proposal-id reuse with changed content", async () => {
    const reviewed = proposal();
    const db = fakeDb();
    await expect(publishReviewedSectionTransaction({
      db,
      proposal: reviewed,
      actorEmail: " ",
      now: "2026-07-01T01:00:00.000Z",
      expectedTargetDeploymentFingerprint: "target-test",
    })).rejects.toMatchObject({ code: "INVALID_PROPOSAL" });

    const reusedDb = fakeDb({
      operation: { proposalId: reviewed.proposalId, payloadDigest: "different", nextHash: reviewed.proposedOwnedHash },
    });
    await expect(publishReviewedSectionTransaction({
      db: reusedDb,
      proposal: reviewed,
      actorEmail: "editor@example.com",
      now: "2026-07-01T01:00:00.000Z",
      expectedTargetDeploymentFingerprint: "target-test",
    })).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED" });
  });

  it("rejects slug mismatch and cross-deployment replay", () => {
    const slugMismatch = proposal();
    slugMismatch.proposedArticle = { ...slugMismatch.proposedArticle, slug: "ketamine" };
    expect(() => validateReviewedPublicationProposal(slugMismatch, "target-test")).toThrowError(
      expect.objectContaining({ code: "ARTICLE_SLUG_MISMATCH" }),
    );

    expect(() => validateReviewedPublicationProposal(proposal(), "other-deployment")).toThrowError(
      expect.objectContaining({ code: "TARGET_DEPLOYMENT_MISMATCH" }),
    );
  });

  it("rejects content or provenance substituted after review while retaining the reviewed artifact digest", () => {
    const substituted = proposal();
    substituted.proposedArticle = { ...substituted.proposedArticle, summary: "substituted after review" };
    substituted.proposedOwnedHash = computeOwnedSectionHash("summary", substituted.proposedArticle);
    expect(() => validateReviewedPublicationProposal(substituted, "target-test")).toThrowError(
      expect.objectContaining({ code: "ARTIFACT_DIGEST_MISMATCH" }),
    );

    const manifestSubstitution = proposal();
    manifestSubstitution.manifestDigest = "c".repeat(64);
    expect(() => validateReviewedPublicationProposal(manifestSubstitution, "target-test")).toThrowError(
      expect.objectContaining({ code: "ARTIFACT_DIGEST_MISMATCH" }),
    );

    const responseSubstitution = proposal();
    responseSubstitution.rawResponseHash = "d".repeat(64);
    expect(() => validateReviewedPublicationProposal(responseSubstitution, "target-test")).toThrowError(
      expect.objectContaining({ code: "ARTIFACT_DIGEST_MISMATCH" }),
    );
  });

  it("rejects malformed review and hash envelopes before any transaction writes", () => {
    const reviewed = proposal({
      review: {
        status: "approved",
        reviewedBy: "reviewer@example.com",
        reviewedAt: "2026-07-01T00:00:00.000Z",
        artifactDigest: "not-a-digest",
      },
    });
    expect(() => validateReviewedPublicationProposal(reviewed, "target-test")).toThrow(GeneratedPublicationError);
  });
});
