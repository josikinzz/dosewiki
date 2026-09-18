import { describe, expect, it } from "vitest";

import {
  buildFormalCitationSourcePacket,
  extractWikipediaReferenceCandidates,
} from "./formal-citations-source-resolver.mjs";

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

  it("builds a deliberate pharmacology packet with quote corpus and allowed references", async () => {
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
      pharmacology: {
        pharmacodynamics: "2C-B is a psychedelic phenethylamine.",
        pharmacokinetics: "",
      },
    };

    const sourcePacket = await buildFormalCitationSourcePacket({
      article,
      sectionKey: "pharmacology",
      quoteDocument: `
# 2C-B - Pharmacology Quotes

## Source: Erowid

2C-B is a psychedelic phenethylamine.
`,
      articleSources: {
        sources: [
          { id: "erowid", displayName: "Erowid", fileName: "erowid.md" },
          { id: "wikipedia", displayName: "Wikipedia", fileName: "wikipedia.md" },
        ],
        contents: {
          erowid: "2C-B is a psychedelic phenethylamine with pharmacology discussion.",
          wikipedia: `Some narrative.<ref>{{cite journal|title=Recovered paper|doi=10.1000/example|url=https://example.org/paper}}</ref>`,
        },
      },
      fetchImpl: null,
    });

    expect(sourcePacket.quoteCorpus).toEqual([
      expect.objectContaining({
        sourceId: "erowid",
        sourceName: "Erowid",
      }),
    ]);
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
