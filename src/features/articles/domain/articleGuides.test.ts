import { describe, expect, it } from "vitest";
import {
  ARTICLE_GUIDES_BY_CLASS,
  resolveGuideClass,
  resolveSubstanceGuide,
} from "./articleGuides";

describe("article guides", () => {
  it("names the class from whatever wording the classification uses", () => {
    expect(resolveGuideClass(["Dissociative"])).toBe("dissociative");
    expect(resolveGuideClass(["Serotonergic psychedelic"])).toBe("psychedelic");
    expect(resolveGuideClass(["Deliriants"])).toBe("deliriant");
    // The first class in the editor's order wins, and an unlisted class
    // resolves to nothing rather than to a neighbouring guide.
    expect(resolveGuideClass(["Dissociative", "Psychedelic"])).toBe("dissociative");
    expect(resolveGuideClass(["Stimulant"])).toBeUndefined();
    expect(resolveGuideClass([])).toBeUndefined();
  });

  it("offers a substance guide only on the page of the substance it covers", () => {
    const dissociatives = ARTICLE_GUIDES_BY_CLASS.dissociative;

    expect(resolveSubstanceGuide(dissociatives, "dextromethorphan")?.slug).toBe("dxm");
    // The bug this rule exists to stop: the DXM guide is about DXM, so no other
    // dissociative page may present it as its own reading.
    expect(resolveSubstanceGuide(dissociatives, "ketamine")).toBeUndefined();
    expect(resolveSubstanceGuide(dissociatives, "pcp")).toBeUndefined();
    expect(resolveSubstanceGuide(dissociatives, undefined)).toBeUndefined();
    expect(resolveSubstanceGuide(ARTICLE_GUIDES_BY_CLASS.psychedelic, "dmt")?.slug).toBe("dmt");
    expect(resolveSubstanceGuide(ARTICLE_GUIDES_BY_CLASS.psychedelic, "lsd")).toBeUndefined();
  });

  it("gives every class a scale or an honest absence", () => {
    // Deliriants have no scale written yet, and the caption renders nothing
    // rather than inventing a link.
    expect(ARTICLE_GUIDES_BY_CLASS.deliriant.scale).toBeUndefined();
    expect(ARTICLE_GUIDES_BY_CLASS.deliriant.guides).toHaveLength(0);
    expect(ARTICLE_GUIDES_BY_CLASS.dissociative.scale?.slug).toBe("dissociative-intensity-scale");
    expect(ARTICLE_GUIDES_BY_CLASS.psychedelic.scale?.slug).toBe("psychedelic-intensity-scale");
  });

  it("carries every class summary page, read off the route definitions", () => {
    // Psychedelics own three general descriptions; collapsing them to one would
    // hide two published articles from every psychedelic substance page.
    expect(
      ARTICLE_GUIDES_BY_CLASS.psychedelic.summaries.map((summary) => summary.href),
    ).toEqual([
      "/psychoactive/psychedelic/visual",
      "/psychoactive/psychedelic/cognitive",
      "/psychoactive/psychedelic/miscellaneous",
    ]);
    expect(ARTICLE_GUIDES_BY_CLASS.dissociative.summaries).toEqual([
      { href: "/psychoactive/dissociative", title: "Subjective Effects of Dissociatives" },
    ]);
    // A class with no scale and no guide still has something to point at, which
    // is why the deliriant caption renders at all.
    expect(ARTICLE_GUIDES_BY_CLASS.deliriant.summaries).toEqual([
      { href: "/psychoactive/deliriant", title: "Subjective Effects of Deliriants" },
    ]);
  });
});
