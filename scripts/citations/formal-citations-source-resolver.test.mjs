import { describe, expect, it, vi } from "vitest";

import {
  buildFormalCitationSourcePacket,
  enrichKnownReferenceCandidates,
  extractWikipediaReferenceCandidates,
} from "./formal-citations-source-resolver.mjs";
import {
  fetchWikipediaPageSource,
  resolveWikipediaPageTitleFromUrl,
  scanWikipediaRefs,
  selectWikipediaSectionsForCitationRun,
} from "./wikipedia-source-enrichment.mjs";

describe("formal citation source resolver", () => {
  it("extracts Wikipedia references with named-ref recovery and original identifiers", () => {
    const content = `
Lead text.<ref name="alpha">{{cite journal|title=Recovered paper|journal=Journal of Tests|doi=10.1000/example|pmid=12345678|url=https://example.org/paper}}</ref>
More text.<ref name="alpha" />
Book text.<ref>{{cite book|title=Reference Book|isbn=9780140328721|publisher=Example Press}}</ref>
`;

    const candidates = extractWikipediaReferenceCandidates({
      sourceId: "wikipedia",
      sourceName: "Wikipedia",
      content,
    });

    expect(candidates).toHaveLength(2);
    expect(candidates[0]).toMatchObject({
      title: "Recovered paper",
      doi: "10.1000/example",
      pmid: "12345678",
      url: "https://example.org/paper",
      sourceIds: ["wikipedia"],
      provenance: [
        expect.objectContaining({
          kind: "wikipedia_reference",
          sourceId: "wikipedia",
          refName: "alpha",
        }),
      ],
    });
    expect(candidates[1]).toMatchObject({
      title: "Reference Book",
      isbn: "9780140328721",
    });
  });

  it("scans self-closing Wikipedia refs without swallowing later paired refs", () => {
    const refs = scanWikipediaRefs(`
{{Infobox|data=<ref name="infobox" />}}
Lead.<ref name="alpha">{{cite journal|title=Alpha paper|journal=Journal A|doi=10.1000/alpha}}</ref>
Later.<ref name="alpha" />
Final.<ref>{{cite web|title=Final source|website=Example|url=https://example.org/final}}</ref>
`);

    expect(refs).toEqual([
      expect.objectContaining({ refName: "infobox", kind: "reuse", body: "" }),
      expect.objectContaining({ refName: "alpha", kind: "definition", body: expect.stringContaining("Alpha paper") }),
      expect.objectContaining({ refName: "alpha", kind: "reuse", body: expect.stringContaining("Alpha paper") }),
      expect.objectContaining({ refName: null, kind: "definition", body: expect.stringContaining("Final source") }),
    ]);
  });

  it("parses nested Wikipedia citation templates at top-level field boundaries", () => {
    const candidates = extractWikipediaReferenceCandidates({
      sourceId: "wikipedia",
      sourceName: "Wikipedia",
      content: `<ref name="nested">{{cite journal|title=[[2C-B|Nested {{nowrap|paper}}]]|journal=Journal {{!}} With Pipe|last1=Shulgin|first1=Alexander|date=1991|doi=10.1000/nested|url=https://example.org/{{urlencode:paper}}}}</ref>`,
    });

    expect(candidates).toEqual([
      expect.objectContaining({
        title: "Nested {{nowrap|paper}}",
        siteName: "Journal {{!}} With Pipe",
        authors: ["Alexander Shulgin"],
        doi: "10.1000/nested",
        year: 1991,
      }),
    ]);
  });

  it("resolves and fetches Wikipedia page source with injected fetch", async () => {
    expect(resolveWikipediaPageTitleFromUrl("https://en.wikipedia.org/wiki/2C-B")).toBe("2C-B");

    const fetchMock = vi.fn(async (url, options) => ({
      ok: true,
      json: async () => ({
        title: "2C-B",
        key: "2C-B",
        source: "Wikitext <ref>{{cite journal|title=Fetched paper|doi=10.1000/fetched}}</ref>",
        latest: { id: 123, timestamp: "2026-05-01T00:00:00Z" },
        content_urls: { desktop: { page: "https://en.wikipedia.org/wiki/2C-B" } },
      }),
      url,
      options,
    }));

    const document = await fetchWikipediaPageSource({
      title: "2C-B",
      fetchImpl: fetchMock,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://en.wikipedia.org/w/rest.php/v1/page/2C-B",
      expect.objectContaining({
        headers: expect.objectContaining({
          Accept: "application/json",
          "User-Agent": "DoseWikiFormalCitations/1.0 (https://dose.wiki)",
        }),
      }),
    );
    expect(document).toMatchObject({
      pageTitle: "2C-B",
      revisionId: 123,
      sourceOrigin: "mediawiki_rest",
      source: expect.stringContaining("Fetched paper"),
    });
  });

  it("enriches DOI, PMID, and ISBN candidates through stable metadata APIs", async () => {
    const fetchMock = vi.fn(async (url) => {
      if (url.startsWith("https://api.crossref.org/works/")) {
        return {
          ok: true,
          json: async () => ({
            message: {
              title: ["Crossref Title"],
              author: [{ given: "Ada", family: "Lovelace" }],
              "container-title": ["Journal of Examples"],
              URL: "https://doi.org/10.1000/example",
              issued: { "date-parts": [[2020, 1, 1]] },
              publisher: "Example Publisher",
              type: "journal-article",
            },
          }),
        };
      }

      if (url.startsWith("https://eutils.ncbi.nlm.nih.gov/")) {
        return {
          ok: true,
          json: async () => ({
            result: {
              uids: ["7654321"],
              "7654321": {
                uid: "7654321",
                title: "PubMed Title",
                fulljournalname: "PubMed Journal",
                pubdate: "2019 Jan",
                authors: [{ name: "Grace Hopper" }],
              },
            },
          }),
        };
      }

      if (url.startsWith("https://openlibrary.org/api/books")) {
        return {
          ok: true,
          json: async () => ({
            "ISBN:9780140328721": {
              title: "Open Library Book",
              authors: [{ name: "Octavia Butler" }],
              publishers: [{ name: "Open Library Press" }],
              publish_date: "1987",
              url: "https://openlibrary.org/books/OL1M/Open_Library_Book",
            },
          }),
        };
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    const references = await enrichKnownReferenceCandidates([
      {
        title: "Recovered DOI",
        doi: "10.1000/example",
        sourceIds: ["wikipedia"],
        provenance: [{ kind: "wikipedia_reference", sourceId: "wikipedia" }],
      },
      {
        title: "Recovered PMID",
        pmid: "7654321",
        sourceIds: ["wikipedia"],
        provenance: [{ kind: "wikipedia_reference", sourceId: "wikipedia" }],
      },
      {
        title: "Recovered ISBN",
        isbn: "9780140328721",
        sourceIds: ["wikipedia"],
        provenance: [{ kind: "wikipedia_reference", sourceId: "wikipedia" }],
      },
    ], { fetchImpl: fetchMock });

    expect(references).toEqual([
      expect.objectContaining({
        title: "Crossref Title",
        doi: "10.1000/example",
        authors: ["Ada Lovelace"],
        sourceType: "primary_literature",
        quality: "high",
      }),
      expect.objectContaining({
        title: "PubMed Title",
        pmid: "7654321",
        authors: ["Grace Hopper"],
        quality: "high",
      }),
      expect.objectContaining({
        title: "Open Library Book",
        isbn: "9780140328721",
        authors: ["Octavia Butler"],
        type: "book",
      }),
    ]);
  });

  it("builds a deliberate dosage-duration packet with quote corpus, matcher output, and allowed references", async () => {
    const article = {
      slug: "2c-b",
      title: "2C-B",
      references: [
        {
          id: "url-erowid-abc123",
          title: "Erowid 2C-B Vault",
          siteName: "Erowid",
          url: "https://www.erowid.org/chemicals/2cb/",
        },
      ],
      dosage: {
        routes: [
          {
            route: "Oral",
            dose_ranges: {
              threshold: { min: 2, max: 5, unit: "mg" },
              light: { min: 5, max: 15, unit: "mg" },
              moderate: { min: 15, max: 25, unit: "mg" },
              strong: { min: 25, max: 50, unit: "mg" },
              heavy: { min: null, max: null, unit: "mg" },
            },
          },
        ],
      },
      duration: {
        routes: [
          {
            route: "Oral",
            stages: {
              onset: { min: 45, max: 75, unit: "minutes" },
              come_up: { min: 15, max: 30, unit: "minutes" },
              peak: { min: 2, max: 4, unit: "hours" },
              offset: { min: 1, max: 2, unit: "hours" },
              after_effects: { min: 2, max: 4, unit: "hours" },
              total_duration: { min: 4, max: 8, unit: "hours" },
            },
          },
        ],
      },
    };

    const sourcePacket = await buildFormalCitationSourcePacket({
      article,
      sectionKey: "dosage_duration",
      quoteDocument: `
# 2C-B - Dosage & Duration Quotes

## Source: Erowid

**2C-B Dosages**
**Oral**
- Threshold: 2 - 5 mg
- Light: 5 - 15 mg
- Common: 15 - 25 mg
- Strong: 25 - 50 mg
`,
      articleSources: {
        sources: [
          { id: "erowid", displayName: "Erowid", fileName: "erowid.md" },
          { id: "wikipedia", displayName: "Wikipedia", fileName: "wikipedia.md" },
        ],
        contents: {
          erowid: "2C-B Dosages Oral Threshold 2 - 5 mg Light 5 - 15 mg Common 15 - 25 mg Strong 25 - 50 mg. Oral duration: Total Duration 4 - 8 hrs. Onset 45 - 75 mins.",
          wikipedia: `Some narrative.<ref>{{cite journal|title=Recovered paper|doi=10.1000/example|url=https://example.org/paper}}</ref>`,
        },
      },
      fetchImpl: null,
      parsedSourceSubstance: {
        dosage: [
          {
            route: "Oral",
            source: "erowid",
            ranges: {
              threshold: { min: 2, max: 5, unit: "mg" },
              light: { min: 5, max: 15, unit: "mg" },
              common: { min: 15, max: 25, unit: "mg" },
              strong: { min: 25, max: 50, unit: "mg" },
            },
          },
        ],
        duration: [
          {
            route: "Oral",
            source: "erowid",
            stages: {
              total: { min: 4, max: 8, unit: "hours" },
              onset: { min: 45, max: 75, unit: "minutes" },
              comeUp: { min: 15, max: 30, unit: "minutes" },
              peak: { min: 2, max: 4, unit: "hours" },
              offset: { min: 1, max: 2, unit: "hours" },
              afterEffects: { min: 2, max: 4, unit: "hours" },
            },
          },
        ],
      },
    });

    expect(sourcePacket.quoteCorpus).toEqual([
      expect.objectContaining({
        sourceId: "erowid",
        sourceName: "Erowid",
      }),
    ]);
    expect(sourcePacket.matcherResults.selectedSourceIds).toEqual(["erowid"]);
    expect(sourcePacket.matcherResults.dosage[0]).toMatchObject({
      route: "Oral",
      selectedSourceId: "erowid",
      accepted: true,
    });
    expect(sourcePacket.compiledSources.map((source) => source.id)).toEqual(
      expect.arrayContaining(["erowid", "wikipedia"]),
    );
    expect(sourcePacket.wikipediaReferences).toEqual([
      expect.objectContaining({
        title: "Recovered paper",
        doi: "10.1000/example",
      }),
    ]);
    expect(sourcePacket.wikipediaCitationPacket).toMatchObject({
      enabled: true,
      status: "ready",
      references: [
        expect.objectContaining({
          title: "Recovered paper",
          doi: "10.1000/example",
        }),
      ],
    });
    expect(sourcePacket.allowedReferences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "url-erowid-abc123",
        }),
        expect.objectContaining({
          doi: "10.1000/example",
          sourceIds: ["wikipedia"],
        }),
      ]),
    );
  });

  it("keeps Wikipedia enrichment off available for source packet building", async () => {
    const sourcePacket = await buildFormalCitationSourcePacket({
      article: {
        slug: "2c-b",
        title: "2C-B",
        references: [
          { id: "url-wiki", title: "Wikipedia", siteName: "Wikipedia", url: "https://en.wikipedia.org/wiki/2C-B" },
        ],
      },
      sectionKey: "pharmacology",
      quoteDocument: "",
      articleSources: {
        sources: [{ id: "wikipedia", displayName: "Wikipedia", fileName: "wikipedia.md" }],
        contents: {
          wikipedia: "Pharmacology receptor activity without raw refs.",
        },
      },
      fetchImpl: async () => {
        throw new Error("fetch should not be called");
      },
      wikipediaEnrichment: false,
    });

    expect(sourcePacket.wikipediaCitationPacket).toMatchObject({
      enabled: false,
      status: "disabled",
    });
    expect(sourcePacket.wikipediaReferences).toEqual([]);
  });

  it("selects harm potential Wikipedia excerpts from preferred headings before generic needles", () => {
    const sections = selectWikipediaSectionsForCitationRun({
      sectionKey: "harm_potential",
      sectionConfig: { sourceNeedles: ["harm", "toxicity", "risk", "addiction"] },
      source: `
== Pharmacology ==
Mechanism text mentions toxicity only in passing.

== Adverse effects ==
Adverse effects text.<ref>{{cite journal|title=Adverse paper|doi=10.1000/adverse}}</ref>

== Overdose ==
Overdose text.
`,
    });

    expect(sections.map((section) => section.heading)).toEqual(["Adverse effects", "Overdose"]);
  });

  it("builds legality Wikipedia citation packet from legal-status headings and keeps government references allowed", async () => {
    const sourcePacket = await buildFormalCitationSourcePacket({
      article: {
        slug: "2c-b",
        title: "2C-B",
        references: [
          { id: "url-wiki", title: "Wikipedia", siteName: "Wikipedia", url: "https://en.wikipedia.org/wiki/2C-B" },
        ],
      },
      sectionKey: "legality",
      quoteDocument: "",
      articleSources: {
        sources: [{ id: "wikipedia", displayName: "Wikipedia", fileName: "wikipedia.md" }],
        contents: {
          wikipedia: `
== Pharmacology ==
Receptor text mentions legal control only in passing.

== Legal status ==
2C-B is controlled in several jurisdictions.<ref>{{cite web|title=Controlled Substances Act|website=DEA Diversion Control Division|url=https://www.deadiversion.usdoj.gov/schedules/}}</ref>

== Regulation ==
Additional regulation text.
`,
        },
      },
      fetchImpl: null,
    });

    expect(sourcePacket.wikipediaCitationPacket.excerpts.map((entry) => entry.heading)).toEqual([
      "Legal status",
      "Regulation",
    ]);
    expect(sourcePacket.allowedReferences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: "Controlled Substances Act",
          url: "https://www.deadiversion.usdoj.gov/schedules/",
          sourceIds: ["wikipedia"],
        }),
      ]),
    );
  });
});
