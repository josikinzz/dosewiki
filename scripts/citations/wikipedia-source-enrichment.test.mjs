import { describe, expect, it, vi } from "vitest";

import {
  fetchWikipediaPageSource,
  resolveWikipediaPageTitleFromUrl,
  scanWikipediaRefs,
  selectWikipediaSectionsForCitationRun,
} from "./wikipedia-source-enrichment.mjs";

describe("wikipedia source enrichment", () => {
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
});
