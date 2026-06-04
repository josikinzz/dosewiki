import { describe, expect, it } from "vitest";
import {
  getCategoryRouteAlias,
  getCategoryRouteAliasParams,
  getEffectCategoryRouteAlias,
  getEffectCategoryRouteAliasParams,
} from "./publicRouteAliases";

describe("public route aliases", () => {
  it("redirects common plural category guesses to canonical category keys", () => {
    expect(getCategoryRouteAlias("psychedelics")).toBe("psychedelic");
    expect(getCategoryRouteAlias("dissociatives")).toBe("dissociative");
    expect(getCategoryRouteAlias("not-real")).toBeNull();
  });

  it("redirects broad effect category guesses without accepting invalid slugs", () => {
    expect(getEffectCategoryRouteAlias("visual")).toBe("visual-effects");
    expect(getEffectCategoryRouteAlias("hallucinatory-state")).toBe("hallucinatory-states");
    expect(getEffectCategoryRouteAlias("not-real")).toBeNull();
  });

  it("exposes alias params so static routes can redirect with dynamic params closed", () => {
    expect(getCategoryRouteAliasParams()).toContainEqual({ categoryKey: "psychedelics" });
    expect(getEffectCategoryRouteAliasParams()).toContainEqual({ categorySlug: "visual" });
  });
});
