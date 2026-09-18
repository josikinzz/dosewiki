import { describe, expect, it } from "vitest";

import { buildWorkbenchApplyDraft } from "./workbench-draft-adapter.mjs";
import {
  createArticle,
  support,
} from "./workbench-draft-adapter.fixtures.mjs";

describe("workbench draft adapter reference conflicts", () => {
  it("keeps marker-only citations separate when an overlapping PMID has conflicting DOI metadata", () => {
    const article = createArticle();
    article.summary = "2C-B has been screened in rat cortical cultures.";

    const workbenchDraft = {
      taskId: "2c-b",
      generatedAt: "2026-05-31T00:00:00.000Z",
      citationMode: "marker_only",
      article: { slug: "2c-b", title: "2C-B" },
      references: [
        {
          id: "a-kept-neurotoxicity-reference",
          type: "journal_article",
          title: "Neurotoxicity screening of new psychoactive substances",
          doi: "10.1016/j.neuro.2018.03.007",
          pmid: "29572046",
          url: "https://doi.org/10.1016/j.neuro.2018.03.007",
          sourceType: "primary_literature",
          quality: "medium",
        },
        {
          id: "z-dropped-neurotoxicity-reference",
          type: "journal_article",
          title: "Neurotoxicity screening of new psychoactive substances",
          doi: "10.1016/j.ntt.2018.03.001",
          pmid: "29572046",
          url: "https://pubmed.ncbi.nlm.nih.gov/29572046/",
          sourceType: "primary_literature",
          quality: "medium",
        },
      ],
      markedSections: {
        summary: "2C-B has been screened in rat cortical cultures.[cite:z-dropped-neurotoxicity-reference]",
      },
      evidence: [
        {
          claimKey: "summary.marker.1",
          fieldPath: "summary",
          claimText: "2C-B has been screened in rat cortical cultures.",
          status: "supported",
          referenceIds: ["z-dropped-neurotoxicity-reference"],
          supports: support("z-dropped-neurotoxicity-reference"),
        },
      ],
      gaps: [],
    };

    const draft = buildWorkbenchApplyDraft({ article, workbenchDraft });

    expect(draft.article.summary).toBe(
      "2C-B has been screened in rat cortical cultures.[cite:z-dropped-neurotoxicity-reference]",
    );
    expect(draft.article.references).toHaveLength(2);
    expect(draft.evidence[0].referenceIds).toEqual(["z-dropped-neurotoxicity-reference"]);
    expect(draft.evidence[0].supports[0].referenceId).toBe("z-dropped-neurotoxicity-reference");
  });

  it("preserves populated canonical authors while enriching missing fields from a same-ID draft reference", () => {
    const article = createArticle();
    article.references = [
      {
        id: "pmid-19322953",
        type: "journal_article",
        title: "Cached methylphenidate receptor paper",
        authors: ["Markowitz JS", "DeVane CL", "Ramamoorthy S", "Zhu HJ"],
        pmid: "19322953",
        containerTitle: null,
        volume: "64",
        sourceType: "primary_literature",
        quality: "high",
      },
    ];

    const draft = buildWorkbenchApplyDraft({
      article,
      workbenchDraft: {
        taskId: "2c-b",
        generatedAt: "2026-05-31T00:00:00.000Z",
        citationMode: "marker_only",
        selectedSections: ["pharmacology"],
        article: { slug: "2c-b", title: "2C-B" },
        references: [
          {
            id: "pmid-19322953",
            type: "journal_article",
            title: "The psychostimulant d-threo-(R,R)-methylphenidate binds as an agonist to the 5HT(1A) receptor",
            authors: [],
            pmid: "19322953",
            containerTitle: "Die Pharmazie",
            sourceType: "primary_literature",
            quality: "high",
          },
          {
            id: "doi-10-1055-s-0028-1109182",
            type: "journal_article",
            title: "The psychostimulant d-threo-(R,R)-methylphenidate binds as an agonist to the 5HT(1A) receptor",
            authors: ["zhu hj", "Additional Author"],
            pmid: "19322953",
            doi: "10.1055/s-0028-1109182",
            containerTitle: "Die Pharmazie",
            sourceType: "primary_literature",
            quality: "high",
          },
        ],
        markedSections: {
          pharmacology: {
            ...article.pharmacology,
            pharmacodynamics: `${article.pharmacology.pharmacodynamics}[cite:doi-10-1055-s-0028-1109182]`,
          },
        },
        evidence: [
          {
            claimKey: "pharmacology.marker.1",
            fieldPath: "pharmacology.pharmacodynamics",
            claimText: article.pharmacology.pharmacodynamics,
            status: "supported",
            referenceIds: ["doi-10-1055-s-0028-1109182"],
            supports: support("doi-10-1055-s-0028-1109182"),
          },
        ],
        gaps: [],
      },
    });

    const reference = draft.article.references.find(({ id }) => id === "pmid-19322953");
    expect(reference).toEqual(expect.objectContaining({
      title: "The psychostimulant d-threo-(R,R)-methylphenidate binds as an agonist to the 5HT(1A) receptor",
      authors: ["Markowitz JS", "DeVane CL", "Ramamoorthy S", "Zhu HJ", "Additional Author"],
      containerTitle: "Die Pharmazie",
      volume: "64",
      pmid: "19322953",
      doi: "10.1055/s-0028-1109182",
    }));
    expect(draft.article.references.filter(({ pmid }) => pmid === "19322953")).toHaveLength(1);
    expect(draft.article.pharmacology.pharmacodynamics).toContain("[cite:pmid-19322953]");
    expect(draft.evidence[0].referenceIds).toEqual(["pmid-19322953"]);
  });

  it("does not collapse a reviewed draft reference onto a conflicting stable identity", () => {
    const article = createArticle();
    article.references = [{
      id: "stored-reference",
      type: "journal_article",
      title: "Stored work",
      authors: ["Stored Author"],
      doi: "10.1000/stored",
      pmid: "19322953",
      sourceType: "primary_literature",
      quality: "high",
    }];
    const claim = article.pharmacology.pharmacodynamics;

    const draft = buildWorkbenchApplyDraft({
      article,
      workbenchDraft: {
        taskId: "2c-b",
        generatedAt: "2026-05-31T00:00:00.000Z",
        citationMode: "marker_only",
        selectedSections: ["pharmacology"],
        article: { slug: "2c-b", title: "2C-B" },
        references: [{
          id: "incoming-reference",
          type: "journal_article",
          title: "Incoming work",
          authors: ["Incoming Author"],
          doi: "10.1000/incoming",
          pmid: "19322953",
          sourceType: "primary_literature",
          quality: "high",
        }],
        markedSections: {
          pharmacology: {
            ...article.pharmacology,
            pharmacodynamics: `${claim}[cite:incoming-reference]`,
          },
        },
        evidence: [{
          claimKey: "pharmacology.marker.1",
          fieldPath: "pharmacology.pharmacodynamics",
          claimText: claim,
          status: "supported",
          referenceIds: ["incoming-reference"],
          supports: support("incoming-reference"),
        }],
        gaps: [],
      },
    });

    expect(draft.article.references).toHaveLength(2);
    expect(draft.article.pharmacology.pharmacodynamics).toContain("[cite:incoming-reference]");
    expect(draft.evidence[0].referenceIds).toEqual(["incoming-reference"]);
  });
});
