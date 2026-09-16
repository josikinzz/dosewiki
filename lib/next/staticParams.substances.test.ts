import { describe, expect, it } from "vitest";
import {
  PRERENDERED_SUBSTANCE_PRIORITIES,
  selectPrerenderedSubstanceSlugs,
} from "./staticParams";
import { substanceRouteAliases } from "./substanceRouteAliases";

const aliasSlug = Object.keys(substanceRouteAliases)[0];

describe("selectPrerenderedSubstanceSlugs", () => {
  it("prerenders every directly reachable priority tier", () => {
    expect(PRERENDERED_SUBSTANCE_PRIORITIES).toEqual(["high", "normal", "low"]);

    const slugs = selectPrerenderedSubstanceSlugs([
      { slug: "lsd", priority: "high" },
      { slug: "2c-b", priority: "normal" },
      { slug: "obscure-rc", priority: "low" },
    ]);

    expect(slugs).toEqual(["lsd", "2c-b", "obscure-rc"]);
  });

  it("honours an explicit tier list", () => {
    const slugs = selectPrerenderedSubstanceSlugs(
      [
        { slug: "lsd", priority: "high" },
        { slug: "2c-b", priority: "normal" },
      ],
      ["high"],
    );

    expect(slugs).toEqual(["lsd"]);
  });

  it("drops empty slugs, alias slugs, and duplicates", () => {
    expect(aliasSlug).toBeTruthy();

    const slugs = selectPrerenderedSubstanceSlugs([
      { slug: "", priority: "high" },
      { slug: aliasSlug, priority: "high" },
      { slug: "lsd", priority: "high" },
      { slug: "lsd", priority: "high" },
    ]);

    expect(slugs).toEqual(["lsd"]);
  });

  it("keeps a duplicated slug when any of its rows is in a prerendered tier", () => {
    const slugs = selectPrerenderedSubstanceSlugs([
      { slug: "lsd", priority: "low" },
      { slug: "lsd", priority: "high" },
    ]);

    expect(slugs).toEqual(["lsd"]);
  });

  it("preserves lookup order", () => {
    const slugs = selectPrerenderedSubstanceSlugs([
      { slug: "b", priority: "normal" },
      { slug: "a", priority: "high" },
    ]);

    expect(slugs).toEqual(["b", "a"]);
  });
});
