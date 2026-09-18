import { describe, expect, it } from "vitest";
import {
  RefusalError,
  assertCitationsResolve,
  assertNoInventedNumbers,
  getByPath,
  mapBindingSite,
  mergeReferences,
  normalizeFieldPath,
  parseRangeText,
  renderProse,
  resolveRouteIndex,
  setByPath,
  visibilityFields,
} from "./reviewDecisionTransforms";

describe("normalizeFieldPath", () => {
  it("rewrites the dead binding-site spellings onto the one live path", () => {
    // receptor_profile is asserted absent from the contract and bindingSites
    // exists nowhere, yet both carry binding-site payloads in the review data.
    expect(normalizeFieldPath("pharmacology.bindingSites")).toBe("pharmacology.binding_sites");
    expect(normalizeFieldPath("pharmacology.receptor_profile")).toBe("pharmacology.binding_sites");
    expect(normalizeFieldPath("/pharmacology/bindingSites")).toBe("pharmacology.binding_sites");
  });

  it("preserves the genuinely camelCase legality keys", () => {
    expect(normalizeFieldPath("legality.countries[United States].canonicalStatus")).toBe(
      "legality.countries[United States].canonicalStatus",
    );
  });

  it("refuses a path naming two targets rather than picking one", () => {
    expect(() => normalizeFieldPath("index_categories|priority")).toThrow(RefusalError);
  });
});

describe("resolveRouteIndex", () => {
  const routes = [{ route: "insufflated" }, { route: "Oral" }];

  it("matches on the route name value, not array position", () => {
    expect(resolveRouteIndex(routes, "oral")).toBe(1);
  });

  it("refuses an absent route instead of defaulting to routes[0]", () => {
    expect(() => resolveRouteIndex(routes, "smoked")).toThrow(/not found/);
  });
});

describe("parseRangeText", () => {
  it("parses the review model's range strings into the stored triple", () => {
    expect(parseRangeText("30–45 minutes")).toEqual({ min: 30, max: 45, unit: "minutes" });
    expect(parseRangeText("1–2 hours")).toEqual({ min: 1, max: 2, unit: "hours" });
    expect(parseRangeText("2-3 hours")).toEqual({ min: 2, max: 3, unit: "hours" });
  });

  it("refuses text it cannot parse rather than emitting a null range", () => {
    expect(() => parseRangeText("a while")).toThrow(RefusalError);
    expect(() => parseRangeText("")).toThrow(RefusalError);
  });

  it("refuses an inverted range", () => {
    expect(() => parseRangeText("5-2 hours")).toThrow(/inverted/);
  });
});

describe("mergeReferences", () => {
  const sources = [
    {
      id: "S1",
      bibliography:
        "Riba J, Anderer P. Topographic pharmaco-EEG mapping of ayahuasca in healthy volunteers. Br J Clin Pharmacol. 2002. doi:10.1046/j.1365-2125.2002.01609.x.",
      url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC1874340/",
    },
  ];

  it("reuses an existing reference when the DOI already appears in the article", () => {
    const existing = [
      {
        id: "doi-10-1046-j-1365-2125-2002-01609-x",
        type: "journal_article" as const,
        title: "Existing",
        authors: [],
        doi: "10.1046/j.1365-2125.2002.01609.x",
        sourceType: "unknown" as const,
        quality: "fallback" as const,
      },
    ];
    const merged = mergeReferences(existing as never, sources, ["S1"]);
    expect(merged.references).toHaveLength(1);
    expect(merged.idMap.get("S1")).toBe("doi-10-1046-j-1365-2125-2002-01609-x");
  });

  it("mints a deterministic id and appends when the source is new", () => {
    const merged = mergeReferences([], sources, ["S1"]);
    expect(merged.references).toHaveLength(1);
    expect(merged.idMap.get("S1")).toMatch(/^doi-10-1046/);
    // Schema defaults must be filled in, not omitted.
    expect(merged.references[0].sourceType).toBe("unknown");
    expect(merged.references[0].quality).toBe("fallback");
  });

  it("refuses when a patch cites a source the record never supplied", () => {
    expect(() => mergeReferences([], sources, ["S9"])).toThrow(/absent from the record/);
  });
});

describe("renderProse", () => {
  const idMap = new Map([
    ["S1", "doi-10-1000-a"],
    ["S2", "pmid-12345"],
  ]);

  it("joins paragraphs on a blank line and appends resolved cite markers", () => {
    const prose = renderProse(
      [
        { text: "First claim.", source_ids: ["S1"] },
        { text: "Second claim.", source_ids: ["S1", "S2"] },
      ],
      idMap,
    );
    expect(prose).toBe(
      "First claim.[cite:doi-10-1000-a]\n\nSecond claim.[cite:doi-10-1000-a][cite:pmid-12345]",
    );
  });

  it("passes already-marked text through instead of duplicating markers", () => {
    const prose = renderProse([{ text: "Known.[cite:pmid-12345]", source_ids: ["S2"] }], idMap);
    expect(prose).toBe("Known.[cite:pmid-12345]");
  });

  it("refuses a paragraph citing an unmapped source", () => {
    expect(() => renderProse([{ text: "Claim.", source_ids: ["S7"] }], idMap)).toThrow(
      /unmapped source S7/,
    );
  });
});

describe("mapBindingSite", () => {
  it("collapses the review model's extra measurement keys into efficacy", () => {
    expect(
      mapBindingSite({
        target: "human 5-HT2A",
        assay: "Gq-mediated calcium flux",
        EC50: "103 nM",
        Emax: "79.2% of the serotonin maximum",
        interpretation: "partial agonist",
      }),
    ).toEqual({
      target: "human 5-HT2A",
      tag: "partial agonist",
      efficacy: "EC50 103 nM; Emax 79.2% of the serotonin maximum; (Gq-mediated calcium flux)",
    });
  });

  it("maps Ki onto affinity", () => {
    expect(mapBindingSite({ target: "5-HT2C", Ki: "1510 ± 360 nM" }).affinity).toBe(
      "1510 ± 360 nM",
    );
  });

  it("refuses an entry with a target but no measurement", () => {
    expect(() => mapBindingSite({ target: "5-HT1A" })).toThrow(/no affinity or efficacy/);
  });
});

describe("assertNoInventedNumbers", () => {
  it("accepts a rewrite that only reuses reviewed numbers", () => {
    expect(() =>
      assertNoInventedNumbers("Peak at 103 nM and 79.2% maximum.", {
        EC50: "103 nM",
        Emax: "79.2%",
      }),
    ).not.toThrow();
  });

  it("refuses a value that introduces an unreviewed measurement", () => {
    expect(() =>
      assertNoInventedNumbers("Peak at 250 nM.", { EC50: "103 nM" }),
    ).toThrow(/unreviewed numbers: 250/);
  });

  it("accepts the upper bound of an ASCII-hyphen range", () => {
    // Regression: a signed number pattern read "30-45 minutes" as 30 and -45,
    // so 45 was never allowed and every faithful value for such a row refused.
    expect(() =>
      assertNoInventedNumbers({ min: 30, max: 45, unit: "minutes" }, { onset: "30-45 minutes" }),
    ).not.toThrow();
    expect(() =>
      assertNoInventedNumbers("Onset is 30 to 45 minutes.", { onset: "30-45 minutes" }),
    ).not.toThrow();
  });

  it("still refuses a bound that appears nowhere in the reviewed range", () => {
    expect(() =>
      assertNoInventedNumbers({ min: 30, max: 90, unit: "minutes" }, { onset: "30-45 minutes" }),
    ).toThrow(/unreviewed numbers: 90/);
  });
});

describe("assertCitationsResolve", () => {
  it("refuses prose citing an id with no reference entry", () => {
    expect(() =>
      assertCitationsResolve(
        { references: [{ id: "pmid-1" }], pharmacology: { pharmacokinetics: "X.[cite:pmid-9]" } },
        "test",
      ),
    ).toThrow(/resolve to no reference: pmid-9/);
  });

  it("accepts prose whose markers all resolve", () => {
    expect(() =>
      assertCitationsResolve(
        { references: [{ id: "pmid-1" }], pharmacology: { pharmacokinetics: "X.[cite:pmid-1]" } },
        "test",
      ),
    ).not.toThrow();
  });
});

describe("setByPath", () => {
  it("writes a nested stage through a resolved route index", () => {
    const article = { duration: { routes: [{ route: "oral", stages: { peak: null } }] } };
    setByPath(article, "duration.routes[0].stages.peak", { min: 1, max: 2, unit: "hours" });
    expect(article.duration.routes[0].stages.peak).toEqual({ min: 1, max: 2, unit: "hours" });
  });

  it("refuses to create a container, because auto-vivifying is how orphan keys appear", () => {
    const article = { pharmacology: { pharmacokinetics: "" } };
    expect(() => setByPath(article, "pharmacology.bindingSites.0.target", "x")).toThrow(
      /does not exist on the stored document/,
    );
  });

  it("reads back what it wrote", () => {
    const article = { tolerance: { full_tolerance: "" } };
    setByPath(article, "tolerance.full_tolerance", "two weeks");
    expect(getByPath(article, "tolerance.full_tolerance")).toBe("two weeks");
  });
});

describe("visibilityFields", () => {
  it("hides an article by adding the index category and lowering priority", () => {
    expect(visibilityFields({ index_categories: [], priority: "high" }, "hidden")).toEqual({
      index_categories: ["hidden"],
      priority: "hide_for_now",
    });
  });

  it("leaves the article reachable by direct URL when only priority drops", () => {
    expect(
      visibilityFields({ index_categories: ["psychedelic"], priority: "high" }, "direct_url_only"),
    ).toEqual({ index_categories: ["psychedelic"], priority: "hide_for_now" });
  });

  it("does not duplicate the hidden category", () => {
    expect(
      visibilityFields({ index_categories: ["hidden"], priority: "hide_for_now" }, "hidden")
        .index_categories,
    ).toEqual(["hidden"]);
  });
});
