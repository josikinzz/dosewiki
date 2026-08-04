import { describe, expect, it } from "vitest";

import {
  appendArticleReference,
  MAX_ARTICLE_REFERENCES,
  normalizeIncomingReference,
  PORTAL_MINTED_REFERENCE_SUPPORT_STATUS,
} from "../convex/lib/articleReferenceWrites";

function incomingReference(overrides: Record<string, unknown> = {}) {
  return {
    id: "doi-10-1000-example",
    type: "journal_article",
    title: "An example study",
    authors: ["Author One"],
    year: 2024,
    doi: "10.1000/example",
    url: "https://doi.org/10.1000/example",
    sourceType: "primary_literature",
    quality: "fallback",
    ...overrides,
  };
}

function articleDocument(references: unknown[] = []) {
  return { slug: "example", title: "Example", references };
}

describe("normalizeIncomingReference", () => {
  it("forces the portal-minted support status whatever the caller claimed", () => {
    const result = normalizeIncomingReference(
      incomingReference({ supportStatus: "inspected" }),
    );

    expect(result.ok).toBe(true);
    if (result.ok === false) return;
    expect(result.reference.supportStatus).toBe(PORTAL_MINTED_REFERENCE_SUPPORT_STATUS);
  });

  it("drops keys the reference schema does not name", () => {
    const result = normalizeIncomingReference(
      incomingReference({ smuggled: "value", _id: "not-a-reference-field" }),
    );

    expect(result.ok).toBe(true);
    if (result.ok === false) return;
    expect(result.reference).not.toHaveProperty("smuggled");
    expect(result.reference).not.toHaveProperty("_id");
  });

  it("refuses an id no citation marker could address", () => {
    // `[cite:...]` only matches a restricted charset, so an id outside it would
    // store a source nothing can ever point at.
    expect(normalizeIncomingReference(incomingReference({ id: "has spaces" }))).toEqual({
      ok: false,
      reason: "That source has no usable citation id.",
    });
  });

  it("refuses a source with no title", () => {
    expect(normalizeIncomingReference(incomingReference({ title: "   " }))).toEqual({
      ok: false,
      reason: "A source needs a title.",
    });
  });

  it("refuses a payload that is not a reference at all", () => {
    expect(normalizeIncomingReference({ nope: true })).toEqual({
      ok: false,
      reason: "That source is not a valid reference entry.",
    });
  });
});

describe("appendArticleReference", () => {
  it("appends to the references array and returns only that key", () => {
    const document = articleDocument([{ id: "existing", title: "Existing", type: "webpage" }]);

    const result = appendArticleReference(document, incomingReference());

    expect(result.ok).toBe(true);
    if (result.ok === false) return;
    expect(result.created).toBe(true);
    expect(result.references).toHaveLength(2);
    expect(result.references?.[1].id).toBe("doi-10-1000-example");
    // The stored document is never mutated in place; the mutation patches the
    // returned array instead.
    expect(document.references).toHaveLength(1);
  });

  it("treats an article with no references list as an empty one", () => {
    const result = appendArticleReference({ slug: "example" }, incomingReference());

    expect(result.ok).toBe(true);
    if (result.ok === false) return;
    expect(result.references).toHaveLength(1);
  });

  it("is idempotent: a second append of the same id writes nothing", () => {
    const stored = {
      id: "doi-10-1000-example",
      title: "The title already stored",
      type: "journal_article",
      authors: [],
      sourceType: "primary_literature",
      quality: "fallback",
    };

    const result = appendArticleReference(
      articleDocument([stored]),
      incomingReference({ title: "A newer title" }),
    );

    expect(result.ok).toBe(true);
    if (result.ok === false) return;
    expect(result.created).toBe(false);
    expect(result.references).toBeUndefined();
    // The stored entry wins: an append never edits an existing source.
    expect(result.reference.title).toBe("The title already stored");
  });

  it("returns the canonical stored reference when a different id names the same URL", () => {
    const stored = {
      id: "canonical-source",
      title: "The source already stored",
      type: "webpage",
      authors: [],
      url: "https://example.test/source/",
      sourceType: "unknown",
      quality: "fallback",
    };

    const result = appendArticleReference(
      articleDocument([stored]),
      incomingReference({
        id: "url-example-alias",
        type: "webpage",
        title: "A duplicate intake",
        doi: null,
        url: "https://example.test/source",
        sourceType: "unknown",
      }),
    );

    expect(result.ok).toBe(true);
    if (result.ok === false) return;
    expect(result.created).toBe(false);
    expect(result.references).toBeUndefined();
    expect(result.reference.id).toBe("canonical-source");
  });

  it("refuses when the reference list is not a list", () => {
    expect(
      appendArticleReference({ references: "nope" }, incomingReference()),
    ).toEqual({ ok: false, reason: "This article's reference list is not a list." });
  });

  it("refuses to grow an article past the reference ceiling", () => {
    const references = Array.from({ length: MAX_ARTICLE_REFERENCES }, (_unused, index) => ({
      id: `filler-${index}`,
      title: `Filler ${index}`,
      type: "webpage",
    }));

    const result = appendArticleReference(articleDocument(references), incomingReference());

    expect(result).toEqual({
      ok: false,
      reason: `This article already lists the maximum of ${MAX_ARTICLE_REFERENCES} sources.`,
    });
  });
});
