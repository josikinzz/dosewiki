import { describe, expect, it } from "vitest";
import {
  getCategoryRouteAlias,
  getCategoryRouteAliasParams,
  getEffectCategoryRouteAlias,
  getEffectCategoryRouteAliasParams,
  getSubstanceRouteAlias,
} from "./publicRouteAliases";

describe("public route aliases", () => {
  it("redirects high-volume substance aliases to canonical article slugs", () => {
    expect(getSubstanceRouteAlias("psilocybin")).toBe("psilocybin-mushrooms");
    expect(getSubstanceRouteAlias("magic-mushrooms")).toBe("psilocybin-mushrooms");
    expect(getSubstanceRouteAlias("2cb")).toBe("2c-b");
    expect(getSubstanceRouteAlias("dxm")).toBe("dextromethorphan");
    expect(getSubstanceRouteAlias("not-real")).toBeNull();
  });

  it("redirects common plural category guesses to canonical category keys", () => {
    expect(getCategoryRouteAlias("psychedelics")).toBe("psychedelic");
    expect(getCategoryRouteAlias("dissociatives")).toBe("dissociative");
    expect(getCategoryRouteAlias("nootropics")).toBe("nootropic");
    expect(getCategoryRouteAlias("not-real")).toBeNull();
  });

  it("redirects broad effect category guesses without accepting invalid slugs", () => {
    expect(getEffectCategoryRouteAlias("visual")).toBe("visual-effects");
    expect(getEffectCategoryRouteAlias("hallucinatory-state")).toBe("hallucinatory-states");
    expect(getEffectCategoryRouteAlias("not-real")).toBeNull();
  });

  it("exposes taxonomy alias params so closed taxonomy routes can redirect", () => {
    expect(getCategoryRouteAliasParams()).toContainEqual({ categoryKey: "psychedelics" });
    expect(getCategoryRouteAliasParams()).toContainEqual({ categoryKey: "nootropics" });
    expect(getEffectCategoryRouteAliasParams()).toContainEqual({ categorySlug: "visual" });
  });
});
