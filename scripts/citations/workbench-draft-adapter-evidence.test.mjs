import { describe, expect, it } from "vitest";

import { buildWorkbenchApplyDraft } from "./workbench-draft-adapter.mjs";
import {
  createArticle,
  support,
} from "./workbench-draft-adapter.fixtures.mjs";

describe("workbench draft adapter evidence scope", () => {
  it("rejects a scoped draft whose markedSections include a non-selected section", () => {
    const article = createArticle();
    article.summary = "2C-B is a psychedelic phenethylamine[cite:existing-summary-ref] first synthesized in 1974.";
    article.references = [{ id: "existing-summary-ref", type: "book", title: "PiHKAL" }];

    expect(() => buildWorkbenchApplyDraft({
      article,
      workbenchDraft: {
        taskId: "2c-b",
        citationMode: "marker_only",
        selectedSections: ["pharmacology"],
        article: { slug: "2c-b", title: "2C-B" },
        references: [{ id: "new-pharm-ref", type: "journal_article", title: "Paper" }],
        markedSections: {
          pharmacology: {
            ...article.pharmacology,
            pharmacodynamics: "2C-B functions primarily as a partial agonist at serotonin 5-HT2 receptors[cite:new-pharm-ref].",
          },
          summary: "2C-B is a psychedelic phenethylamine[cite:existing-summary-ref] first synthesized in 1974[cite:new-pharm-ref].",
        },
        evidence: [
          {
            claimKey: "pharmacology.marker.1",
            fieldPath: "pharmacology.pharmacodynamics",
            claimText: "2C-B functions primarily as a partial agonist at serotonin 5-HT2 receptors.",
            status: "supported",
            referenceIds: ["new-pharm-ref"],
            supports: support("new-pharm-ref"),
          },
        ],
        gaps: [],
      },
    })).toThrow(/not in selectedSections/i);
  });

  it("rejects marker-only workbench drafts that rewrite article text", () => {
    const article = createArticle();
    article.summary = "2C-B is a psychedelic phenethylamine first synthesized in the 1970s.";

    expect(() => buildWorkbenchApplyDraft({
      article,
      workbenchDraft: {
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
        ],
        markedSections: {
          summary: "2C-B is a psychedelic phenethylamine first described in the 1970s[cite:shulgin1991].",
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
        ],
        gaps: [],
      },
    })).toThrow(/marker-only draft failed validation/i);
  });
});
