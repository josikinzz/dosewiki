import { describe, expect, it, vi } from "vitest";

import {
  dedupeAllowedReferences,
  enrichKnownReferenceCandidates,
  enrichKnownReferenceCandidatesWithDiagnostics,
  sanitizeAllowedReferenceForArticle,
} from "./formal-citations-reference-enrichment.mjs";
import { canonicalizeArticleReferences } from "./formal-citations-reference-catalog.mjs";

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    json: async () => body,
  };
}

describe("formal citation reference metadata enrichment", () => {
  it("uses Crossref first for DOI candidates and retains provider provenance", async () => {
    const fetchImpl = vi.fn(async (_url) => jsonResponse({
      message: {
        title: ["Crossref paper"],
        author: [{ given: "Ada", family: "Lovelace" }],
        "container-title": ["Journal of Examples"],
        URL: "https://doi.org/10.1000/example",
        issued: { "date-parts": [[2020]] },
        type: "journal-article",
      },
    }));

    const references = await enrichKnownReferenceCandidates([
      { title: "Stored title", doi: "10.1000/example", authors: [] },
    ], { fetchImpl, maxAttempts: 1 });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][0]).toBe("https://api.crossref.org/works/10.1000%2Fexample");
    expect(references[0]).toMatchObject({
      title: "Crossref paper",
      authors: ["Ada Lovelace"],
      doi: "10.1000/example",
      metadataProvenance: [expect.objectContaining({
        provider: "crossref",
        status: "success",
        authorCount: 1,
        fields: expect.arrayContaining(["title", "authors", "doi"]),
      })],
      metadataDiagnostics: [],
    });

    const sanitized = sanitizeAllowedReferenceForArticle(references[0]);
    expect(sanitized.metadataProvenance).toEqual([{
      kind: "fetched",
      source: "formal-citation-reference-enrichment",
      provider: "crossref",
      fields: expect.arrayContaining(["title", "authors", "doi"]),
    }]);

    const catalog = canonicalizeArticleReferences([{
      id: "stored-reference",
      type: "webpage",
      title: "Inspected stored title",
      authors: [],
      doi: "10.1000/example",
      sourceType: "primary_literature",
      quality: "high",
      metadataProvenance: [{
        kind: "inspected",
        source: "citation-workbench",
        fields: ["title"],
      }],
    }, sanitized]);
    expect(catalog.references).toHaveLength(1);
    expect(catalog.references[0]).toMatchObject({
      id: "stored-reference",
      title: "Inspected stored title",
      authors: ["Ada Lovelace"],
      metadataProvenance: expect.arrayContaining([
        expect.objectContaining({ kind: "inspected", source: "citation-workbench" }),
        expect.objectContaining({ kind: "fetched", provider: "crossref" }),
      ]),
    });
  });

  it("uses PubMed first for PMID-only candidates", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({
      result: {
        "19322953": {
          title: "PubMed paper",
          fulljournalname: "Die Pharmazie",
          pubdate: "2009 Feb",
          authors: [{ name: "Markowitz JS" }, { name: "DeVane CL" }],
        },
      },
    }));

    const { references, diagnostics } = await enrichKnownReferenceCandidatesWithDiagnostics([
      { title: "Stored title", pmid: "19322953", authors: [] },
    ], { fetchImpl, maxAttempts: 1 });

    expect(fetchImpl.mock.calls[0][0]).toContain("eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi");
    expect(references[0]).toMatchObject({
      title: "PubMed paper",
      authors: ["Markowitz JS", "DeVane CL"],
      pmid: "19322953",
    });
    expect(sanitizeAllowedReferenceForArticle(references[0]).metadataProvenance).toEqual([
      expect.objectContaining({
        kind: "fetched",
        provider: "pubmed",
        fields: expect.arrayContaining(["title", "authors", "pmid"]),
      }),
    ]);
    expect(diagnostics[0]).toMatchObject({
      providers: [expect.objectContaining({ provider: "pubmed", status: "success" })],
      issues: [],
    });
  });

  it("falls back to OpenAlex by DOI only when Crossref has no usable authors", async () => {
    const fetchImpl = vi.fn(async (url) => {
      if (url.startsWith("https://api.crossref.org/")) {
        return jsonResponse({ message: {
          title: ["Shared paper title"],
          author: [],
          "container-title": ["Primary Journal"],
          issued: { "date-parts": [[2021]] },
          type: "journal-article",
        } });
      }
      if (url.startsWith("https://api.openalex.org/")) {
        return jsonResponse({
          id: "https://openalex.org/W123",
          display_name: "Shared paper title",
          authorships: [
            { author: { display_name: "Author One" } },
            { author: { display_name: "Author Two" } },
          ],
          publication_year: 2021,
          primary_location: { source: { display_name: "Fallback Journal" } },
          type: "article",
        });
      }
      throw new Error(`Unexpected URL ${url}`);
    });

    const { references, diagnostics } = await enrichKnownReferenceCandidatesWithDiagnostics([
      { title: "Stored title", doi: "10.1000/no-authors", authors: [] },
    ], { fetchImpl, maxAttempts: 1 });

    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([
      "https://api.crossref.org/works/10.1000%2Fno-authors",
      "https://api.openalex.org/works/https%3A%2F%2Fdoi.org%2F10.1000%2Fno-authors",
    ]);
    expect(references[0]).toMatchObject({
      title: "Shared paper title",
      authors: ["Author One", "Author Two"],
      siteName: "Primary Journal",
    });
    expect(sanitizeAllowedReferenceForArticle(references[0]).metadataProvenance).toEqual([
      expect.objectContaining({ kind: "fetched", provider: "crossref" }),
      expect.objectContaining({
        kind: "fetched",
        provider: "openalex",
        fields: expect.arrayContaining(["title", "authors"]),
      }),
    ]);
    expect(diagnostics[0].issues).toContainEqual({
      code: "primary_provider_missing_authors",
      provider: "crossref",
    });
  });

  it("adapts Open Library provenance without inventing a timestamp or artifact digest", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({
      "ISBN:9780123456789": {
        title: "A fetched book",
        authors: [{ name: "Book Author" }],
        publish_date: "2022",
        publishers: [{ name: "Example Press" }],
        url: "https://openlibrary.org/books/OL1M",
      },
    }));

    const references = await enrichKnownReferenceCandidates([{
      title: "Stored book",
      isbn: "9780123456789",
      authors: [],
      metadataProvenance: [{
        kind: "cached",
        source: "legacy-import",
        fields: ["title"],
      }],
    }], { fetchImpl, maxAttempts: 1 });
    const sanitized = sanitizeAllowedReferenceForArticle(references[0]);

    expect(sanitized.metadataProvenance).toEqual([
      expect.objectContaining({
        kind: "fetched",
        provider: "openlibrary",
        fields: expect.arrayContaining(["title", "authors", "isbn", "year", "publisher"]),
      }),
      expect.objectContaining({ kind: "cached", source: "legacy-import" }),
    ]);
    expect(sanitized.metadataProvenance[0]).not.toHaveProperty("retrievedAt");
    expect(sanitized.metadataProvenance[0]).not.toHaveProperty("artifactDigest");
  });

  it("reports provider disagreement and bounded provider failures without hiding the primary result", async () => {
    const sleepImpl = vi.fn(async () => {});
    const disagreementFetch = vi.fn(async (url) => {
      if (url.startsWith("https://api.crossref.org/")) {
        return jsonResponse({ message: { title: ["Primary title"], author: [], type: "journal-article" } });
      }
      return jsonResponse({
        id: "https://openalex.org/W456",
        display_name: "Conflicting fallback title",
        authorships: [{ author: { display_name: "Recovered Author" } }],
        type: "article",
      });
    });
    const disagreement = await enrichKnownReferenceCandidatesWithDiagnostics([
      { title: "Stored", doi: "10.1000/disagreement", authors: [] },
    ], { fetchImpl: disagreementFetch, maxAttempts: 1, sleepImpl });

    expect(disagreement.references[0]).toMatchObject({
      title: "Primary title",
      authors: ["Recovered Author"],
    });
    expect(disagreement.diagnostics[0].issues).toContainEqual(expect.objectContaining({
      code: "provider_title_disagreement",
      providers: ["crossref", "openalex"],
      primaryTitle: "Primary title",
      fallbackTitle: "Conflicting fallback title",
    }));

    const failureFetch = vi.fn(async () => jsonResponse({}, { ok: false, status: 503 }));
    const failure = await enrichKnownReferenceCandidatesWithDiagnostics([
      { title: "Stored fallback", pmid: "19322953", authors: [] },
    ], { fetchImpl: failureFetch, maxAttempts: 2, retryDelayMs: 1, sleepImpl });

    expect(failureFetch).toHaveBeenCalledTimes(4);
    expect(sleepImpl).toHaveBeenCalledTimes(2);
    expect(failure.references[0]).toMatchObject({ title: "Stored fallback", authors: [] });
    expect(failure.diagnostics[0].issues.map((issue) => issue.code)).toEqual([
      "primary_provider_failed",
      "fallback_provider_failed",
    ]);
  });

  it("dedupes allowed references behind the reference enrichment seam", () => {
    const references = dedupeAllowedReferences([
      {
        id: "url-erowid",
        title: "Erowid 2C-B Vault",
        authors: ["First Author"],
        siteName: "Erowid",
        url: "https://www.erowid.org/chemicals/2cb/",
        quality: "fallback",
        sourceIds: ["erowid"],
        provenance: [{ kind: "article_reference" }],
      },
      {
        id: "url-erowid",
        title: "Ignored fallback title",
        authors: ["First Author", "Second Author"],
        siteName: "Erowid",
        quality: "medium",
        sourceIds: ["wikipedia"],
        provenance: [{ kind: "wikipedia_reference", sourceId: "wikipedia" }],
      },
    ]);

    expect(references).toEqual([
      expect.objectContaining({
        id: "url-erowid",
        title: "Erowid 2C-B Vault",
        authors: ["First Author", "Second Author"],
        siteName: "Erowid",
        url: "https://www.erowid.org/chemicals/2cb/",
        quality: "medium",
        sourceIds: ["erowid", "wikipedia"],
        provenance: [
          { kind: "article_reference" },
          { kind: "wikipedia_reference", sourceId: "wikipedia" },
        ],
      }),
    ]);
  });
});
