import { describe, expect, it } from "vitest";
import {
  applyReferenceAuthorRepair,
  selectUniqueArticleForReferenceAuthorRepair,
} from "../server/lib/articleReferenceAuthorWrites";

const expected = {
  title: "The psychostimulant d-threo-(R,R)-methylphenidate binds as an agonist to the 5HT(1A) receptor",
  doi: null,
  pmid: "19322953",
  authors: [],
};

function article(overrides: Record<string, unknown> = {}) {
  return {
    references: [{
      id: "pmid-19322953",
      type: "journal_article",
      ...expected,
      ...overrides,
    }],
  };
}

const proposedAuthors = [" Markowitz JS ", "DeVane  CL", "Markowitz JS"];

describe("selectUniqueArticleForReferenceAuthorRepair", () => {
  it("requires exactly one article from the bounded slug lookup", () => {
    expect(selectUniqueArticleForReferenceAuthorRepair([], "methylphenidate")).toEqual({
      ok: false,
      code: "ARTICLE_NOT_FOUND",
      reason: 'No substance found for slug "methylphenidate".',
    });

    const storedArticle = { _id: "article-1", slug: "methylphenidate" };
    expect(selectUniqueArticleForReferenceAuthorRepair(
      [storedArticle],
      "methylphenidate",
    )).toEqual({ ok: true, article: storedArticle });

    expect(selectUniqueArticleForReferenceAuthorRepair(
      [storedArticle, { _id: "article-2", slug: "methylphenidate" }],
      "methylphenidate",
    )).toEqual({
      ok: false,
      code: "ARTICLE_DUPLICATE",
      reason: 'Multiple substances found for slug "methylphenidate".',
    });
  });
});

describe("applyReferenceAuthorRepair", () => {
  it("updates exactly one matching reference and normalizes proposed authors", () => {
    const result = applyReferenceAuthorRepair(article(), {
      referenceId: "pmid-19322953",
      expected,
      proposedAuthors,
    });
    expect(result).toMatchObject({ ok: true, updated: true });
    if (!result.ok || !result.updated) throw new Error("expected update");
    expect(result.reference.authors).toEqual(["Markowitz JS", "DeVane CL"]);
    expect(result.references).toHaveLength(1);
  });

  it("refuses stale identity or author snapshots", () => {
    expect(applyReferenceAuthorRepair(article({ title: "Changed" }), {
      referenceId: "pmid-19322953", expected, proposedAuthors,
    })).toMatchObject({ ok: false, code: "REFERENCE_CONFLICT" });
    expect(applyReferenceAuthorRepair(article({ authors: ["Someone Else"] }), {
      referenceId: "pmid-19322953", expected, proposedAuthors,
    })).toMatchObject({ ok: false, code: "REFERENCE_CONFLICT" });
  });

  it("refuses duplicate stored reference ids", () => {
    const document = article();
    document.references.push({ ...document.references[0] });
    expect(applyReferenceAuthorRepair(document, {
      referenceId: "pmid-19322953", expected, proposedAuthors,
    })).toMatchObject({ ok: false, code: "REFERENCE_DUPLICATE" });
  });

  it("rejects empty, malformed, oversized, and overlong proposed authors", () => {
    for (const authors of [[], ["  "], [42], Array.from({ length: 101 }, (_, index) => `Author ${index}`), ["x".repeat(201)]]) {
      expect(applyReferenceAuthorRepair(article(), {
        referenceId: "pmid-19322953", expected, proposedAuthors: authors,
      })).toMatchObject({ ok: false, code: "REFERENCE_WRITE_REJECTED" });
    }
  });

  it("is idempotent when the proposal is already applied", () => {
    const normalized = ["Markowitz JS", "DeVane CL"];
    const result = applyReferenceAuthorRepair(article({ authors: normalized }), {
      referenceId: "pmid-19322953", expected, proposedAuthors: normalized,
    });
    expect(result).toMatchObject({ ok: true, updated: false, reference: { authors: normalized } });
    if (!result.ok) throw new Error("expected success");
    expect(result.references).toBeUndefined();
  });
});
