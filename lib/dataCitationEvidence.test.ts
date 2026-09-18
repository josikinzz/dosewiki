import { describe, expect, it } from "vitest";
import { applyCitationArticlePatch } from "../server/citationEvidence";
import { remapReferenceIds } from "../server/lib/substanceIngestion";

function createPatchContext(initial: Record<string, unknown>, { duplicateSlug = false } = {}) {
  let document: Record<string, unknown> = { _id: "article-1", ...structuredClone(initial) };
  const patches: Record<string, unknown>[] = [];
  const ctx = {
    db: {
      query: () => ({
        withIndex: (_name: string, callback: (query: { eq: (field: string, value: unknown) => null }) => unknown) => {
          callback({ eq: () => null });
          return {
            take: async () => duplicateSlug
              ? [document, { ...document, _id: "article-2" }]
              : [document],
          };
        },
      }),
      patch: async (_id: unknown, patch: Record<string, unknown>) => {
        patches.push(patch);
        document = { ...document, ...patch };
      },
    },
  };
  return { ctx, patches, get document() { return document; } };
}

describe("citation draft article reference patching", () => {
  it("preserves pmid-19322953 authors, canonical id, remaps markers, and deletes omitted references", async () => {
    const harness = createPatchContext({
      id: 7,
      title: "Methylphenidate",
      slug: "methylphenidate",
      references: [{
        id: "pmid-19322953",
        type: "journal_article",
        title: "The psychostimulant d-threo-(R,R)-methylphenidate binds as an agonist to the 5HT(1A) receptor",
        authors: ["Markowitz JS", "DeVane CL", "Ramamoorthy S", "Zhu HJ"],
        pmid: "19322953",
        quality: "high",
      }, {
        id: "stored-only",
        type: "webpage",
        title: "Intentionally omitted",
        authors: ["Stored Author"],
        url: "https://example.com/omitted",
      }],
    });

    const result = await applyCitationArticlePatch({
      ctx: harness.ctx as never,
      slug: "methylphenidate",
      includeReferences: true,
      article: {
        summary: "Claim [cite:doi-10-1055-s-0028-1109182].",
        references: [{
          id: "doi-10-1055-s-0028-1109182",
          type: "journal_article",
          title: "The psychostimulant d-threo-(R,R)-methylphenidate binds as an agonist to the 5HT(1A) receptor",
          authors: [],
          doi: "10.1055/s-0028-1109182",
          pmid: "19322953",
          quality: "fallback",
        }],
      },
    });

    expect(harness.document.summary).toBe("Claim [cite:pmid-19322953].");
    expect(harness.document.references).toEqual([expect.objectContaining({
      id: "pmid-19322953",
      authors: ["Markowitz JS", "DeVane CL", "Ramamoorthy S", "Zhu HJ"],
      doi: "10.1055/s-0028-1109182",
      quality: "high",
    })]);
    expect(result.referenceIdRemap.get("doi-10-1055-s-0028-1109182")).toBe("pmid-19322953");
    expect(result.articleId).toBe(7);
  });

  it("fails closed before patching when the validated payload id conflicts with the stored article", async () => {
    const harness = createPatchContext({
      id: 7,
      title: "Stored article",
      slug: "stored-article",
      references: [],
    });

    await expect(applyCitationArticlePatch({
      ctx: harness.ctx as never,
      slug: "stored-article",
      article: { summary: "Must not be written." },
      includeReferences: false,
      expectedArticleId: 8,
      expectedArticleSlug: "stored-article",
    })).rejects.toThrow(
      'Citation draft article id 8 does not match stored article id 7 for slug "stored-article".',
    );

    expect(harness.patches).toEqual([]);
  });

  it("fails closed before patching when the validated payload slug conflicts with the stored article", async () => {
    const harness = createPatchContext({
      id: 7,
      title: "Stored article",
      slug: "stored-article",
      references: [],
    });

    await expect(applyCitationArticlePatch({
      ctx: harness.ctx as never,
      slug: "stored-article",
      article: { summary: "Must not be written." },
      includeReferences: false,
      expectedArticleId: 7,
      expectedArticleSlug: "different-article",
    })).rejects.toThrow(
      'Citation draft article slug "different-article" does not match stored article slug "stored-article".',
    );

    expect(harness.patches).toEqual([]);
  });

  it("returns the canonical stored article id for downstream evidence association", async () => {
    const harness = createPatchContext({
      id: 7,
      title: "Stored article",
      slug: "stored-article",
      references: [],
    });

    const result = await applyCitationArticlePatch({
      ctx: harness.ctx as never,
      slug: "stored-article",
      article: { summary: "Written safely." },
      includeReferences: false,
      expectedArticleId: null,
      expectedArticleSlug: "stored-article",
    });

    expect(result.articleId).toBe(7);
    expect(harness.patches).toEqual([{ summary: "Written safely." }]);
  });

  it("fails closed before patching when a slug resolves to multiple articles", async () => {
    const harness = createPatchContext({
      id: 7,
      title: "Duplicate slug",
      slug: "duplicate-slug",
      references: [],
    }, { duplicateSlug: true });

    await expect(applyCitationArticlePatch({
      ctx: harness.ctx as never,
      slug: "duplicate-slug",
      includeReferences: true,
      article: { summary: "Must not be written.", references: [] },
    })).rejects.toThrow('Expected exactly one article for slug "duplicate-slug"; found multiple matches.');

    expect(harness.patches).toEqual([]);
    expect(harness.document).not.toHaveProperty("summary", "Must not be written.");
  });

  it("does not merge metadata across conflicting stable identities", async () => {
    const harness = createPatchContext({
      id: 7,
      title: "Conflict",
      slug: "conflict",
      references: [{
        id: "stored-reference",
        type: "journal_article",
        title: "Stored work",
        authors: ["Stored Author"],
        doi: "10.1000/stored",
        pmid: "19322953",
      }],
    });

    await applyCitationArticlePatch({
      ctx: harness.ctx as never,
      slug: "conflict",
      includeReferences: true,
      article: {
        summary: "Incoming [cite:incoming-reference].",
        references: [{
          id: "incoming-reference",
          type: "journal_article",
          title: "Incoming work",
          authors: [],
          doi: "10.1000/incoming",
          pmid: "19322953",
        }],
      },
    });

    expect(harness.document.references).toEqual([expect.objectContaining({
      id: "incoming-reference",
      doi: "10.1000/incoming",
      authors: [],
    })]);
    expect(harness.document.references).not.toEqual([
      expect.objectContaining({ authors: ["Stored Author"] }),
    ]);
  });

  it("remaps incoming evidence reference ids and support rows when an alias collapses", () => {
    const remapped = remapReferenceIds([{
      referenceIds: ["doi-alias"],
      supports: [{ referenceId: "doi-alias", supportingQuote: "Evidence" }],
    }], new Map([["doi-alias", "pmid-canonical"]]));

    expect(remapped).toEqual([{
      referenceIds: ["pmid-canonical"],
      supports: [{ referenceId: "pmid-canonical", supportingQuote: "Evidence" }],
    }]);
  });

  it("leaves stored references untouched when the draft did not include the references field", async () => {
    const storedReferences = [{
      id: "stored-reference",
      type: "journal_article",
      title: "Stored work",
      authors: ["Stored Author"],
      doi: "10.1000/stored",
    }];
    const harness = createPatchContext({
      id: 7,
      title: "No reference patch",
      slug: "no-reference-patch",
      references: storedReferences,
    });

    await applyCitationArticlePatch({
      ctx: harness.ctx as never,
      slug: "no-reference-patch",
      includeReferences: false,
      // Simulate the validated Zod value, which defaults omitted references to [].
      article: { summary: "Updated summary.", references: [] },
    });

    expect(harness.patches[0]).not.toHaveProperty("references");
    expect(harness.document.references).toEqual(storedReferences);
  });
});
