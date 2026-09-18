import { describe, expect, it } from "vitest";

import {
  assertWorkbenchDraftPromotionAllowed,
  buildWorkbenchApplyDraft,
  buildWorkbenchPromotionPlan,
} from "./workbench-draft-adapter.mjs";
import {
  createArticle,
  createWorkbenchDraft,
  support,
} from "./workbench-draft-adapter.fixtures.mjs";


describe("workbench draft adapter", () => {

  it("builds a workbench promotion plan with the shared write-payload shape", () => {
    const plan = buildWorkbenchPromotionPlan({
      article: createArticle(),
      workbenchDraft: createWorkbenchDraft(),
    });

    expect(plan).toMatchObject({
      kind: "citation-promotion-plan",
      source: "workbench",
      slug: "2c-b",
      approvedWriteMode: "preserve",
      staleClaimKeys: [],
      summary: {
        evidenceRows: 6,
        supportedEvidenceRows: 4,
        reviewEvidenceRows: 1,
      },
      writePayload: {
        slug: "2c-b",
        article: plan.article,
        evidence: plan.evidence,
        approvedWriteMode: "preserve",
        staleClaimKeys: [],
      },
    });
    expect(plan.writePayload).not.toHaveProperty("changes");
    expect(plan.writePayload).not.toHaveProperty("summary");
  });

  it("applies marker-only workbench drafts directly to citable sections", () => {
    const article = createArticle();
    article.summary = "2C-B is a psychedelic phenethylamine first synthesized in the 1970s.";

    const workbenchDraft = {
      taskId: "2c-b",
      generatedAt: "2026-05-31T00:00:00.000Z",
      citationMode: "marker_only",
      article: { slug: "2c-b", title: "2C-B" },
      references: [
        {
          id: "shulgin1991",
          type: "book",
          title: "PiHKAL",
          sourceType: "book",
          quality: "medium",
        },
        {
          id: "dea2cb",
          type: "government_document",
          title: "DEA 2C-B scheduling",
          sourceType: "government",
          quality: "high",
        },
      ],
      markedSections: {
        summary: "2C-B is a psychedelic phenethylamine[cite:shulgin1991] first synthesized in the 1970s.",
        legality: {
          ...article.legality,
          countries: {
            ...article.legality.countries,
            "United States": {
              status: "Schedule I",
              notes: "Classified as a Schedule I controlled substance[cite:dea2cb].",
            },
          },
        },
      },
      evidence: [
        {
          claimKey: "summary.marker.1",
          fieldPath: "summary",
          claimText: "2C-B is a psychedelic phenethylamine first synthesized in the 1970s.",
          status: "supported",
          referenceIds: ["shulgin1991"],
          supports: support("shulgin1991"),
        },
        {
          claimKey: "legality.us.marker.1",
          fieldPath: "legality.countries.United States.notes",
          claimText: "Classified as a Schedule I controlled substance.",
          status: "supported",
          referenceIds: ["dea2cb"],
          supports: support("dea2cb"),
        },
      ],
      gaps: [],
    };

    const draft = buildWorkbenchApplyDraft({ article, workbenchDraft });

    expect(draft.article.summary).toBe(
      "2C-B is a psychedelic phenethylamine[cite:shulgin1991] first synthesized in the 1970s.",
    );
    expect(draft.article.legality.countries["United States"].notes).toBe(
      "Classified as a Schedule I controlled substance[cite:dea2cb].",
    );
    expect(draft.article.dosage).toEqual(article.dosage);
    expect(draft.changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "summary" }),
      expect.objectContaining({ path: "legality" }),
    ]));
    expect(draft.evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({
        claimKey: "summary.marker.1",
        section: "summary",
        status: "supported",
        referenceIds: ["shulgin1991"],
      }),
      expect.objectContaining({
        claimKey: "legality.us.marker.1",
        section: "legality",
        status: "supported",
        referenceIds: ["dea2cb"],
      }),
    ]));
  });


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
