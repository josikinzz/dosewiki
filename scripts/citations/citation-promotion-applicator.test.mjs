import { describe, expect, it } from "vitest";

import {
  buildCitationPromotionPlan,
  buildCitationPromotionWritePayload,
} from "./citation-promotion-applicator.mjs";

describe("citation promotion applicator", () => {
  it("builds the Postgres applyDraft payload shape used by citation applicators", () => {
    const article = { id: 1, slug: "2c-b", title: "2C-B", references: [] };
    const evidence = [{ claimKey: "claim-1", status: "supported" }];

    expect(buildCitationPromotionWritePayload({
      slug: " 2c-b ",
      article,
      evidence,
      approvedWriteMode: "replace",
      staleClaimKeys: ["old-claim", "old-claim", " "],
    })).toEqual({
      slug: "2c-b",
      article,
      evidence,
      approvedWriteMode: "replace",
      staleClaimKeys: ["old-claim"],
    });
  });

  it("keeps summary metadata beside but outside the write payload", () => {
    const article = { id: 1, slug: "2c-b", title: "2C-B", references: [] };
    const evidence = [{ claimKey: "claim-1", status: "supported" }];
    const plan = buildCitationPromotionPlan({
      source: "test",
      slug: "2c-b",
      title: "2C-B",
      article,
      evidence,
      changes: [{ path: "summary", before: "a", after: "b" }],
      summary: { references: 2 },
    });

    expect(plan).toMatchObject({
      kind: "citation-promotion-plan",
      source: "test",
      approvedWriteMode: "preserve",
      summary: {
        evidenceRows: 1,
        articleChanges: 1,
        staleClaimKeys: 0,
        references: 2,
      },
      writePayload: {
        slug: "2c-b",
        article,
        evidence,
        approvedWriteMode: "preserve",
        staleClaimKeys: [],
      },
    });
    expect(plan.writePayload).not.toHaveProperty("summary");
    expect(plan.writePayload).not.toHaveProperty("changes");
  });
});
