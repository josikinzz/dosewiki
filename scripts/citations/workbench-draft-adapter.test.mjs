import { describe, expect, it } from "vitest";

import {
  assertWorkbenchDraftPromotionAllowed,
  buildWorkbenchApplyDraft,
  buildWorkbenchPromotionPlan,
} from "./workbench-draft-adapter.mjs";
import { createArticle, createWorkbenchDraft } from "./workbench-draft-adapter.fixtures.mjs";

describe("workbench draft adapter", () => {
  it("unconditionally rejects permanently local proposal drafts", () => {
    const article = createArticle();
    article.summary = "Proposal prose that also happens to equal the live article.";
    const workbenchDraft = {
      ...createWorkbenchDraft(),
      provenance: { source: "local_section_proposal", taskMode: "local_experiment", applyBound: false },
      promotion: { allowed: false, policy: "never" },
      inputBinding: {
        schemaVersion: "dosewiki_local_proposal_binding_v1",
        kind: "local_section_proposal",
        slug: "2c-b",
        section: "summary",
      },
      markedSections: { summary: article.summary },
    };

    expect(() => assertWorkbenchDraftPromotionAllowed(workbenchDraft)).toThrow(/permanently review-only/);
    expect(() => buildWorkbenchApplyDraft({ article, workbenchDraft })).toThrow(/permanently review-only/);
    expect(() => buildWorkbenchPromotionPlan({ article, workbenchDraft })).toThrow(/permanently review-only/);
  });

  it("rejects each no-promotion signal before constructing a promotion plan", () => {
    expect(() => buildWorkbenchPromotionPlan({
      article: null,
      workbenchDraft: { taskId: "2c-b--proposal-summary--abcdef123456" },
    })).toThrow(/permanently review-only/);
    expect(() => buildWorkbenchPromotionPlan({
      article: null,
      workbenchDraft: { provenance: { applyBound: false } },
    })).toThrow(/Non-apply-bound/);
    expect(() => buildWorkbenchPromotionPlan({
      article: null,
      workbenchDraft: { promotion: { allowed: false } },
    })).toThrow(/explicitly forbidden/);
  });
});
