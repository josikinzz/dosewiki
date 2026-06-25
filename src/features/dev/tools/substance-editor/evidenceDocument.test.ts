import { describe, expect, it } from "vitest";
import { getAvailabilityQuoteSectionIds } from "../../../../../lib/quoteSections.mjs";
import {
  buildArticleEvidenceDocument,
  buildEvidenceQuoteSections,
} from "./evidenceDocument";

describe("substance editor evidence document", () => {
  it("builds editable quote sections from the shared quote descriptor inventory", () => {
    const sections = buildEvidenceQuoteSections([
      {
        slug: "lsd",
        section: "summary",
        content: "Intro quotes",
        updatedAt: "2026-05-01T00:00:00.000Z",
        updatedBy: "EDITOR",
        isFromConvex: true,
      },
      {
        slug: "lsd",
        section: "subjective_effects",
        content: "Subjective effects quotes",
        isFromConvex: true,
      },
    ]);

    expect(Object.keys(sections)).toEqual(getAvailabilityQuoteSectionIds());
    expect(sections.summary).toMatchObject({
      section: "summary",
      content: "Intro quotes",
      exists: true,
      editable: true,
    });
    expect(sections.subjective_effects.content).toBe("Subjective effects quotes");
    expect(sections.harm_potential).toMatchObject({
      section: "harm_potential",
      content: null,
      exists: false,
      editable: true,
    });
  });

  it("keeps source corpus, editable quotes, article references, and legacy links in explicit lanes", () => {
    const document = buildArticleEvidenceDocument({
      slug: "lsd",
      availableSources: [{
        id: "source-1",
        fileName: "erowid.md",
        displayName: "Erowid",
        size: 18,
        tokens: 3,
      }],
      sourceContents: { "source-1": "Source corpus text" },
      quoteDocuments: [
        {
          slug: "lsd",
          section: "summary",
          content: "Intro quotes",
          isFromConvex: true,
        },
      ],
      article: {
        references: [{ id: "ref-1", title: "Reference" }],
        source_citations: [{ id: "legacy-source-link" }],
        citations: [{ url: "https://example.com", text: "Legacy citation" }],
      },
    });

    expect(document.sourceCorpus).toEqual({
      editable: false,
      sources: [{
        id: "source-1",
        fileName: "erowid.md",
        displayName: "Erowid",
        size: 18,
        tokens: 3,
      }],
      contentsBySourceId: { "source-1": "Source corpus text" },
    });
    expect(document.editableQuotes.summary.content).toBe("Intro quotes");
    expect(document.articleReferences).toEqual([{ id: "ref-1", title: "Reference" }]);
    expect(document.legacyCitationLinks).toEqual({
      sourceCitations: [{ id: "legacy-source-link" }],
      citations: [{ url: "https://example.com", text: "Legacy citation" }],
    });
  });
});
