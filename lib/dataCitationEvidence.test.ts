import { describe, expect, it } from "vitest";
import { applyCitationArticlePatch } from "../server/citationEvidence";

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
});
