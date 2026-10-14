import { describe, expect, it } from "vitest";

import { canonicalHash } from "../../lib/generatedPublication/canonical.mjs";
import { article, proposal, regenerationProposal, fakeDb } from "../test/fixtures/generatedPublication";
import { minimalArticle } from "../test/fixtures/articles";
import {
  GeneratedPublicationError,
  computeOwnedSectionHash,
  generatedPublicationPayloadDigest,
  publishReviewedSectionTransaction,
  validateReviewedPublicationProposal,
  type ReviewedPublicationProposal,
} from "../../server/lib/generatedPublication";

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
});

describe("excerpt section regeneration publication", () => {
  it.each([
    ["version", "forged-v2"], ["model", "openai/gpt-5"], ["section", "legality"],
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

  it.each(["Reworded claim [cite:old-source]", "New claim [cite:new-source]", "Malformed marker [cite:"])(
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

  it.each(["priority", "references", "legality"])(
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

  it.each(["before_patch", "recorded_operation"])(
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
});

describe("isolated collaboration section publication", () => {
  function collaborationProposal(overrides: Partial<ReviewedPublicationProposal> = {}) {
    const baseArticle = { ...article(), priority: "low" };
    const proposedArticle = { ...structuredClone(baseArticle), summary: "Fresh collaboration narrative" };
    const receipt = {
      actualTaskPath: "/root/section_worker", actualAgentId: "11111111-2222-3333-4444-555555555555",
      transport: "codex-collaboration-subagent", forkTurns: "none", capturedAt: "2026-09-30T00:46:21.929Z",
      inputHash: "c".repeat(64), rawResponseSha256: "b".repeat(64),
      wireModelVerified: false, wireEffortVerified: false, wireToolsVerified: false, sdkReceipt: false,
    };
    const value = {
      baseArticle, proposedArticle, sourceArtifactKind: "codex_collaboration_section_draft",
      collaborationAudit: {
        version: "codex-collaboration-section-draft-v1", section: "summary",
        promptHash: "d".repeat(64), excerptHash: "e".repeat(64), inputHash: receipt.inputHash,
        receiptHash: canonicalHash(receipt), receipt,
      },
      ...overrides,
    };
    const profile = overrides.profile ?? "summary";
    return proposal({ ...value,
      expectedOwnedHash: computeOwnedSectionHash(profile, value.baseArticle),
      proposedOwnedHash: computeOwnedSectionHash(profile, value.proposedArticle),
    });
  }

  it.each(["wireModelVerified", "sdkReceipt"])(
    "rejects a forged %s assertion even with recomputed digests", (field) => {
      const original = collaborationProposal();
      const receipt = { ...original.collaborationAudit!.receipt, [field]: true };
      const reviewed = collaborationProposal({ collaborationAudit: { ...original.collaborationAudit!, receipt, receiptHash: canonicalHash(receipt) } });
      expect(() => validateReviewedPublicationProposal(reviewed, "target-test")).toThrowError(expect.objectContaining({ code: "INVALID_REGENERATION_PROPOSAL" }));
    });

  it("binds complete real receipt bytes into both receipt and reviewed artifact digests", () => {
    const reviewed = collaborationProposal();
    reviewed.collaborationAudit!.receipt.requestedModel = "different observation";
    expect(() => validateReviewedPublicationProposal(reviewed, "target-test")).toThrowError(expect.objectContaining({ code: "ARTIFACT_DIGEST_MISMATCH" }));
    const resigned = collaborationProposal({ collaborationAudit: reviewed.collaborationAudit });
    expect(() => validateReviewedPublicationProposal(resigned, "target-test")).toThrowError(expect.objectContaining({ code: "INVALID_REGENERATION_PROPOSAL" }));
  });

  it("rejects SDK audit substitution and kind relabeling", () => {
    const original = collaborationProposal();
    for (const overrides of [
      { sourceArtifactKind: "generated_section", collaborationAudit: original.collaborationAudit },
      { regenerationAudit: regenerationProposal().regenerationAudit },
      { collaborationAudit: undefined },
    ]) {
      expect(() => validateReviewedPublicationProposal(collaborationProposal(overrides), "target-test")).toThrowError(expect.objectContaining({ code: "INVALID_REGENERATION_PROPOSAL" }));
    }
  });

  it("checks live eligibility before accepting an idempotent collaboration receipt", async () => {
    const reviewed = collaborationProposal();
    const db = fakeDb({ liveArticle: { ...reviewed.proposedArticle, priority: "normal", index_categories: [] },
      operation: { payloadDigest: generatedPublicationPayloadDigest(reviewed), nextHash: reviewed.proposedOwnedHash } });
    await expect(publishReviewedSectionTransaction({ db, proposal: reviewed, actorEmail: "editor@example.com",
      now: "2026-09-30T01:00:00.000Z", expectedTargetDeploymentFingerprint: "target-test" })).rejects.toMatchObject({ code: "INVALID_REGENERATION_PROPOSAL" });
    expect(db.patches).toEqual([]); expect(db.inserts).toEqual([]);
  });
});

describe("SDK regeneration receipt live read-back", () => {
  it.each([false, true])("does not report a historical receipt as current success after drift=%s", async (drift) => {
    const reviewed = regenerationProposal();
    const liveArticle = { ...reviewed.proposedArticle, ...(drift ? { summary: "A later human edit" } : {}) };
    const currentHash = computeOwnedSectionHash(reviewed.profile, liveArticle);
    const db = fakeDb({ liveArticle, operation: { payloadDigest: generatedPublicationPayloadDigest(reviewed), nextHash: reviewed.proposedOwnedHash } });
    const result = await publishReviewedSectionTransaction({ db, proposal: reviewed, actorEmail: "editor@example.com",
      now: "2026-09-30T01:00:00.000Z", expectedTargetDeploymentFingerprint: "target-test" });
    expect(result).toMatchObject(drift ? { status: "conflict", expectedHash: reviewed.proposedOwnedHash, currentHash }
      : { status: "already_applied", currentHash });
    expect(db.patches).toEqual([]); expect(db.inserts).toEqual([]);
  });
});
