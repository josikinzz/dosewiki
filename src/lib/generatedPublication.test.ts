import { describe, expect, it } from "vitest";

import {
  computeReviewedArtifactDigest,
  REVIEWED_ARTIFACT_DIGEST_VERSION,
} from "../../lib/generatedPublication/canonical.mjs";
import { minimalArticle } from "../test/fixtures/articles";
import {
  GENERATED_PUBLICATION_HASH_VERSION,
  GeneratedPublicationError,
  type GeneratedPublicationDb,
  computeOwnedSectionHash,
  generatedPublicationPayloadDigest,
  publishReviewedSectionTransaction,
  validateReviewedPublicationProposal,
  type ReviewedPublicationProposal,
} from "../../server/lib/generatedPublication";

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

function regenerationProposal(overrides: Partial<ReviewedPublicationProposal> = {}) {
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

function fakeDb({
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

  it("does not normalize unchanged pharmacology CAS companion fields", async () => {
    const baseArticle = article();
    baseArticle.dosage = {
      ...(baseArticle.dosage as Record<string, unknown>),
      legacy_note: "This legacy field must remain untouched.",
    };
    const proposedArticle = {
      ...structuredClone(baseArticle),
      pharmacology: {
        ...(baseArticle.pharmacology as Record<string, unknown>),
        pharmacodynamics: "updated pharmacodynamics",
      },
    };
    const reviewed = proposal({
      profile: "pharmacology",
      baseArticle,
      proposedArticle,
      approvedPaths: ["pharmacology"],
      expectedOwnedHash: computeOwnedSectionHash("pharmacology", baseArticle),
      proposedOwnedHash: computeOwnedSectionHash("pharmacology", proposedArticle),
    });
    const db = fakeDb({ liveArticle: baseArticle });

    const result = await publishReviewedSectionTransaction({
      db,
      proposal: reviewed,
      actorEmail: "editor@example.com",
      now: "2026-07-01T01:00:00.000Z",
      expectedTargetDeploymentFingerprint: "target-test",
    });

    expect(result.status).toBe("updated");
    expect(db.patches).toEqual([{ pharmacology: proposedArticle.pharmacology }]);
    expect(db.patches[0]).not.toHaveProperty("dosage");
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

describe("excerpt section regeneration publication", () => {
  it("replaces an eligible reviewed section without old markers or unrelated live changes", async () => {
    const reviewed = regenerationProposal();
    const liveArticle = {
      ...reviewed.baseArticle,
      legality: { international: ["Concurrent legal update"], countries: {} },
      references: [{ id: "old-source", title: "Preserved reference pool" }],
    };
    const db = fakeDb({ liveArticle });
    const result = await publishReviewedSectionTransaction({
      db, proposal: reviewed, actorEmail: "editor@example.com",
      now: "2026-07-01T01:00:00.000Z", expectedTargetDeploymentFingerprint: "target-test",
    });
    expect(result.status).toBe("updated");
    expect(db.patches).toEqual([{ summary: "Fresh uncited narrative" }]);
    expect(db.inserts[0].artifactDigest).toBe(reviewed.artifactDigest);
  });

  it.each([
    ["pharmacology", "pharmacodynamics"],
    ["tolerance", "full_tolerance"],
    ["harm_potential", "toxicity"],
    ["history_culture", "content"],
  ] as const)("publishes a complete fresh %s section and rejects nested retained markers", async (profile, field) => {
    const original = regenerationProposal();
    const before = structuredClone(original.baseArticle[profile]) as Record<string, unknown>;
    const after = structuredClone(before);
    before[field] = profile === "harm_potential"
      ? { ...(before[field] as object), other: "Old [cite:source]" } : "Old [cite:source]";
    after[field] = profile === "harm_potential"
      ? { ...(after[field] as object), other: "Fresh uncited narrative" } : "Fresh uncited narrative";
    const baseArticle = { ...original.baseArticle, [profile]: before };
    const proposedArticle = { ...baseArticle, [profile]: after };
    const reviewed = regenerationProposal({
      profile, approvedPaths: [profile], baseArticle, proposedArticle,
      regenerationAudit: { ...original.regenerationAudit!, section: profile },
    });
    const db = fakeDb({ liveArticle: baseArticle });
    expect((await publishReviewedSectionTransaction({
      db, proposal: reviewed, actorEmail: "editor@example.com",
      now: "2026-07-01T01:00:00.000Z", expectedTargetDeploymentFingerprint: "target-test",
    })).status).toBe("updated");
    expect(db.patches).toEqual([{ [profile]: after }]);
    const retained = structuredClone(after);
    retained[field] = profile === "harm_potential"
      ? { ...(retained[field] as object), other: "New claim [cite:source]" } : "New claim [cite:source]";
    const marked = regenerationProposal({
      profile, approvedPaths: [profile], baseArticle,
      proposedArticle: { ...baseArticle, [profile]: retained },
      regenerationAudit: { ...original.regenerationAudit!, section: profile },
    });
    expect(() => validateReviewedPublicationProposal(marked, "target-test"))
      .toThrowError(expect.objectContaining({ code: "INVALID_REGENERATION_PROPOSAL" }));
  });

  it.each([
    ["version", "forged-v2"], ["model", "openai/gpt-5"],
    ["thinking", "high"], ["promptHash", "not-a-hash"],
    ["excerptHash", "A".repeat(64)], ["section", "legality"],
  ])("rejects forged regeneration audit %s even with a freshly signed digest", (field, value) => {
    const original = regenerationProposal();
    const reviewed = regenerationProposal({
      regenerationAudit: { ...original.regenerationAudit!, [field]: value },
    });
    expect(() => validateReviewedPublicationProposal(reviewed, "target-test"))
      .toThrowError(expect.objectContaining({ code: "INVALID_REGENERATION_PROPOSAL" }));
  });

  it("binds every regeneration audit field into the approved artifact digest", () => {
    const reviewed = regenerationProposal();
    reviewed.regenerationAudit!.promptHash = "e".repeat(64);
    expect(() => validateReviewedPublicationProposal(reviewed, "target-test"))
      .toThrowError(expect.objectContaining({ code: "ARTIFACT_DIGEST_MISMATCH" }));
  });

  it.each([
    { sourceArtifactKind: "generated_section" },
    { regenerationAudit: undefined },
    { regenerationAudit: null },
  ])("rejects detached or missing audit metadata %j", (overrides) => {
    const reviewed = regenerationProposal(overrides as Partial<ReviewedPublicationProposal>);
    expect(() => validateReviewedPublicationProposal(reviewed, "target-test"))
      .toThrowError(expect.objectContaining({ code: "INVALID_REGENERATION_PROPOSAL" }));
  });

  it.each(["Reworded claim [cite:old-source]", "New claim [cite:new-source]", "Malformed marker [cite:", "Uppercase [CITE:source]"])(
    "rejects retained, new, and malformed generated markers: %s", (summary) => {
      const original = regenerationProposal();
      const reviewed = regenerationProposal({
        proposedArticle: { ...original.proposedArticle, summary },
      });
      expect(() => validateReviewedPublicationProposal(reviewed, "target-test"))
        .toThrowError(expect.objectContaining({ code: "INVALID_REGENERATION_PROPOSAL" }));
    },
  );

  it("rejects a public base and never permits legality replacement", () => {
    const original = regenerationProposal();
    const publicProposal = regenerationProposal({
      baseArticle: { ...original.baseArticle, priority: "normal" },
      proposedArticle: { ...original.proposedArticle, priority: "normal" },
    });
    expect(() => validateReviewedPublicationProposal(publicProposal, "target-test"))
      .toThrowError(expect.objectContaining({ code: "INVALID_REGENERATION_PROPOSAL" }));
    const legality = regenerationProposal({
      profile: "legality", approvedPaths: ["legality"],
      regenerationAudit: { ...original.regenerationAudit!, section: "legality" },
      proposedArticle: { ...original.baseArticle, legality: { countries: {}, international: ["replacement"] } },
    });
    expect(() => validateReviewedPublicationProposal(legality, "target-test"))
      .toThrowError(expect.objectContaining({ code: "INVALID_REGENERATION_PROPOSAL" }));
  });

  it.each(["priority", "references", "legality", "editorial_review", "index_categories"])(
    "does not allow regeneration to edit protected or unowned %s", (field) => {
      const original = regenerationProposal();
      const reviewed = regenerationProposal({
        approvedPaths: ["summary", field],
        proposedArticle: { ...original.proposedArticle, [field]: "changed" },
      });
      expect(() => validateReviewedPublicationProposal(reviewed, "target-test"))
        .toThrowError(expect.objectContaining({ code: "UNOWNED_FIELD_CHANGE" }));
    },
  );

  it.each(["before_patch", "matching_content", "recorded_operation"])(
    "rejects live promotion before %s can return success", async (state) => {
      const reviewed = regenerationProposal();
      const liveArticle = {
        ...(state === "before_patch" ? reviewed.baseArticle : reviewed.proposedArticle),
        priority: "normal", index_categories: [],
      };
      const db = fakeDb({
        liveArticle,
        operation: state === "recorded_operation" ? {
          payloadDigest: generatedPublicationPayloadDigest(reviewed),
          nextHash: reviewed.proposedOwnedHash,
        } : null,
      });
      await expect(publishReviewedSectionTransaction({
        db, proposal: reviewed, actorEmail: "editor@example.com",
        now: "2026-07-01T01:00:00.000Z", expectedTargetDeploymentFingerprint: "target-test",
      })).rejects.toMatchObject({ code: "INVALID_REGENERATION_PROPOSAL" });
      expect(db.patches).toEqual([]);
      expect(db.inserts).toEqual([]);
    },
  );

  it.each(["low", "hide_for_now", "hidden_tag"])("accepts eligibility via %s independent of editorial status", (eligibility) => {
    const original = regenerationProposal();
    const fields = { priority: eligibility === "hidden_tag" ? "normal" : eligibility, index_categories: eligibility === "hidden_tag" ? ["HiDdEn"] : [] };
    const reviewed = regenerationProposal({
      baseArticle: { ...original.baseArticle, ...fields },
      proposedArticle: { ...original.proposedArticle, ...fields },
    });
    expect(validateReviewedPublicationProposal(reviewed, "target-test").changedFields).toEqual(["summary"]);
  });

  it.each([
    "Changed [cite:a] [cite:a]", "Changed [cite:a] [cite:b]", "Changed [cite:a]",
  ])("keeps the ordinary path's exact citation marker multiset: %s", (summary) => {
    const baseArticle = article("Original [cite:a] [cite:a]");
    const proposedArticle = { ...baseArticle, summary };
    const reviewed = proposal({
      baseArticle, proposedArticle,
      expectedOwnedHash: computeOwnedSectionHash("summary", baseArticle),
      proposedOwnedHash: computeOwnedSectionHash("summary", proposedArticle),
    });
    if (summary === "Changed [cite:a] [cite:a]") {
      expect(validateReviewedPublicationProposal(reviewed, "target-test").changedFields).toEqual(["summary"]);
    } else {
      expect(() => validateReviewedPublicationProposal(reviewed, "target-test"))
        .toThrowError(expect.objectContaining({ code: "CITATION_MARKERS_CHANGED" }));
    }
  });
});
