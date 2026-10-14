import { describe, expect, it } from "vitest";
import {
  RefusalError,
  assertCitationsResolve,
  assertNoInventedNumbers,
  mapBindingSite,
  parseRangeText,
  renderProse,
  resolveRouteIndex,
  setByPath,
} from "./reviewDecisionTransforms";

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

describe("renderProse", () => {
  const idMap = new Map([["S1", "doi-10-1000-a"]]);

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

  it("refuses an entry with a target but no measurement", () => {
    expect(() => mapBindingSite({ target: "5-HT1A" })).toThrow(/no affinity or efficacy/);
  });
});

describe("assertNoInventedNumbers", () => {
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
});

describe("setByPath", () => {
  it("refuses to create a container, because auto-vivifying is how orphan keys appear", () => {
    const article = { pharmacology: { pharmacokinetics: "" } };
    expect(() => setByPath(article, "pharmacology.bindingSites.0.target", "x")).toThrow(
      /does not exist on the stored document/,
    );
  });
});
