import { describe, expect, it } from "vitest";

import {
  buildWorkbenchApplyDraft,
  buildWorkbenchPromotionPlan,
  normalizeWorkbenchReference,
} from "./workbench-draft-adapter.mjs";
import {
  createArticle,
  createWorkbenchDraft,
} from "./workbench-draft-adapter.fixtures.mjs";

describe("workbench draft adapter normalization", () => {
  it("normalizes workbench reference source types to the article schema enum", () => {
    expect(normalizeWorkbenchReference({
      id: "paper",
      title: "Paper",
      type: "government_document",
      sourceType: "government",
    })).toMatchObject({
      id: "paper",
      type: "report",
      sourceType: "government_or_regulatory",
      quality: "fallback",
    });
  });

  it("normalizes unsupported reference templates to the article schema enum", () => {
    expect(normalizeWorkbenchReference({
      id: "chapter",
      title: "Book chapter",
      type: "book_chapter",
      template: "cite_book_chapter",
    })).toMatchObject({
      type: "book_chapter",
      template: "cite_book",
    });
  });

  it("maps supported workbench claims onto renderable article fields and keeps half-life review-only", () => {
    const draft = buildWorkbenchApplyDraft({
      article: {
        ...createArticle(),
        _id: "data-id",
        _creationTime: 123,
      },
      workbenchDraft: createWorkbenchDraft(),
    });

    expect(draft.article).not.toHaveProperty("_id");
    expect(draft.article).not.toHaveProperty("_creationTime");
    expect(draft.article.dosage.routes[0].reference_ids).toEqual(["pihkal-shulgin-1991"]);
    expect(draft.article.duration.routes[0].reference_ids).toEqual(["pihkal-shulgin-1991"]);
    expect(draft.article.harm_potential.summary).toContain("[cite:papaseit-2018-acute-pharmacological-effects-2c-b]");
    expect(draft.article.interactions.caution[0]).toContain("[cite:theobald-2007-mao-cyp-2c-series]");
    expect(draft.article.legality.international[0]).toContain("[cite:poulie-2020-dark-classics-nbomes]");
    expect(draft.article.legality.countries["United States"].notes).toContain("[cite:dean-2013-2c-or-not-2c]");
    expect(draft.article.pharmacology.pharmacokinetics).not.toContain("[cite:");

    const halfLife = draft.evidence.find((row) => row.claimKey === "pharmacokinetics.half_life");
    expect(halfLife).toMatchObject({
      status: "needs_review",
      referenceIds: [],
      supports: [],
      diagnostics: [expect.objectContaining({ code: "workbench_gap" })],
    });

    const maoi = draft.evidence.find((row) => row.claimKey === "interactions.maoi_potentiation");
    expect(maoi.supports).toHaveLength(2);
    expect(maoi.referenceIds).toEqual(["dean-2013-2c-or-not-2c", "theobald-2007-mao-cyp-2c-series"]);
    expect(maoi.supports[0].verifiedQuote).toMatchObject({
      matchType: "normalized_whitespace",
      startOffset: null,
      endOffset: null,
    });
  });

  it("derives a missing support sourceName from the inspected source record", () => {
    const workbenchDraft = createWorkbenchDraft();
    const [firstSupport] = workbenchDraft.evidence[0].supports;
    delete firstSupport.sourceName;
    workbenchDraft.sources = [{
      id: firstSupport.sourceId,
      title: "PiHKAL inspected excerpt",
      content: "Quoted support.",
    }];

    const plan = buildWorkbenchPromotionPlan({
      article: createArticle(),
      workbenchDraft,
    });
    const evidence = plan.evidence.find((row) => row.claimKey === "use_and_effects.dose_duration");

    expect(evidence.supports).toHaveLength(1);
    expect(evidence.supports[0].sourceName).toBe("PiHKAL inspected excerpt");
  });

  it("derives a missing support sourceName from the structured reference", () => {
    const workbenchDraft = createWorkbenchDraft();
    const [firstSupport] = workbenchDraft.evidence[0].supports;
    delete firstSupport.sourceName;
    workbenchDraft.sources = [];

    const plan = buildWorkbenchPromotionPlan({
      article: createArticle(),
      workbenchDraft,
    });
    const evidence = plan.evidence.find((row) => row.claimKey === "use_and_effects.dose_duration");

    expect(evidence.supports).toHaveLength(1);
    expect(evidence.supports[0].sourceName).toBe("PiHKAL");
  });
});
