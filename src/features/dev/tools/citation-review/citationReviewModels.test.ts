import { describe, expect, it } from "vitest";
import { createEmptyArticle } from "@/data/schema";
import {
  buildCitationReviewChecklist,
  canApproveCitationEvidence,
  groupCitationEvidenceBySection,
  type CitationEvidenceRow,
} from "./citationReviewModels";

function createRow(overrides: Partial<CitationEvidenceRow>): CitationEvidenceRow {
  return {
    slug: "lsd",
    section: "summary",
    claimKey: "summary:0",
    fieldPath: "summary",
    referenceIds: [],
    status: "needs_source",
    severity: "blocking",
    updatedAt: "2026-05-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("citationReviewModels", () => {
  it("groups evidence rows by section with blocking rows first", () => {
    const groups = groupCitationEvidenceBySection([
      createRow({ section: "history_culture", claimKey: "history:1", severity: "non_blocking" }),
      createRow({ section: "history_culture", claimKey: "history:0", severity: "blocking" }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.rows.map((row) => row.claimKey)).toEqual(["history:0", "history:1"]);
  });

  it("builds checklist state from evidence rows and article diagnostics", () => {
    const article = createEmptyArticle();
    article.references = [{ id: "ref-1", title: "Source", type: "unknown", authors: [], year: null, date: null, containerTitle: null, siteName: null, publisher: null, volume: null, issue: null, pages: null, articleNumber: null, doi: null, pmid: null, isbn: null, url: null, accessedAt: null, sourceType: "unknown", quality: "fallback", apaText: null }];
    article.summary = "Summary [cite:missing-ref]";

    const checklist = buildCitationReviewChecklist(article, [
      createRow({ status: "needs_source", severity: "blocking" }),
      createRow({
        claimKey: "summary:1",
        status: "supported",
        severity: "non_blocking",
        referenceIds: ["ref-1"],
        supports: [
          {
            sourceId: "source-1",
            sourceName: "Source",
            referenceId: "ref-1",
            supportingQuote: "Quote",
            rationale: "Rationale",
            verifiedQuote: {
              sourceId: "source-1",
              matchType: "exact",
              startOffset: 0,
              endOffset: 5,
            },
          },
        ],
      }),
    ]);

    expect(checklist.find((item) => item.id === "blocking-gaps")?.tone).toBe("attention");
    expect(checklist.find((item) => item.id === "approvals")?.tone).toBe("pending");
    expect(checklist.find((item) => item.id === "article-diagnostics")?.tone).toBe("attention");
  });

  it("only allows approval when verified supports exist", () => {
    expect(canApproveCitationEvidence(createRow({ supports: [] }))).toBe(false);
    expect(
      canApproveCitationEvidence(
        createRow({
          supports: [
            {
              sourceId: "source-1",
              sourceName: "Source",
              referenceId: "ref-1",
              supportingQuote: "Quote",
              rationale: "Rationale",
              verifiedQuote: {
                sourceId: "source-1",
                matchType: "exact",
                startOffset: 0,
                endOffset: 5,
              },
            },
          ],
        }),
      ),
    ).toBe(true);
  });
});
