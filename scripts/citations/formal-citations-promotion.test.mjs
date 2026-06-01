import { describe, expect, it } from "vitest";

import { buildFormalCitationPromotionPlan } from "./formal-citations-promotion.mjs";

describe("formal citations promotion", () => {
  it("turns a generated formal draft into a reviewed promotion write payload", () => {
    const draft = {
      slug: "2c-b",
      title: "2C-B",
      article: { id: 1, slug: "2c-b", title: "2C-B", references: [] },
      evidence: [{ claimKey: "current-claim", status: "supported" }],
      changes: [{ path: "summary", before: "a", after: "b" }],
      references: [{ id: "ref-1" }],
      gaps: [{ path: "summary", reason: "Needs review" }],
      preservedApproved: [],
      newSupport: [{ claimKey: "current-claim" }],
      proposedReplacements: [],
      staleEvidence: [
        { claimKey: "stale-claim", status: "approved" },
        { claimKey: "stale-claim", status: "approved" },
      ],
      staleReferences: [],
    };

    const plan = buildFormalCitationPromotionPlan({
      draft,
      approvedWriteMode: "replace",
    });

    expect(plan).toMatchObject({
      kind: "citation-promotion-plan",
      source: "formal-citations",
      slug: "2c-b",
      approvedWriteMode: "replace",
      staleClaimKeys: ["stale-claim"],
      summary: {
        references: 1,
        evidenceRows: 1,
        gaps: 1,
        newSupport: 1,
        staleEvidence: 2,
      },
      writePayload: {
        slug: "2c-b",
        article: draft.article,
        evidence: draft.evidence,
        approvedWriteMode: "replace",
        staleClaimKeys: ["stale-claim"],
      },
    });
  });
});
