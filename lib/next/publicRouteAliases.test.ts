import { describe, expect, it } from "vitest";
import REPLICATION_SLUG_ALIASES from "@data/effects/replicationSlugAliases.json";
import {
  getCategoryRouteAlias,
  getEffectCategoryRouteAlias,
  getEffectCategoryRouteAliasParams,
  getReplicationRouteAlias,
  getReplicationRouteAliasParams,
  getSubstanceRouteAlias,
} from "./publicRouteAliases";

describe("public route aliases", () => {
  it("redirects high-volume substance aliases to canonical article slugs", () => {
    expect(getSubstanceRouteAlias("psilocybin")).toBe("psilocybin-mushrooms");
    expect(getSubstanceRouteAlias("magic-mushrooms")).toBe("psilocybin-mushrooms");
    expect(getSubstanceRouteAlias("2cb")).toBe("2c-b");
    expect(getSubstanceRouteAlias("dxm")).toBe("dextromethorphan");
    expect(getSubstanceRouteAlias("lean")).toBe("codeine");
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
    expect(getEffectCategoryRouteAliasParams()).toContainEqual({ categorySlug: "visual" });
  });

  describe("replication slug aliases", () => {
    it("returns null for a slug with no recorded rename", () => {
      expect(getReplicationRouteAlias("tree-bark-chelsea-morgan")).toBeNull();
    });

    it("matches case-insensitively and ignores surrounding whitespace", () => {
      for (const [from, to] of Object.entries(REPLICATION_SLUG_ALIASES)) {
        expect(getReplicationRouteAlias(` ${from.toUpperCase()} `)).toBe(to);
        break;
      }
    });

    it("never redirects a slug to itself", () => {
      for (const [from, to] of Object.entries(REPLICATION_SLUG_ALIASES)) {
        expect(from).not.toBe(to);
        expect(getReplicationRouteAlias(from)).toBe(to);
      }
    });

    it("exposes every alias as a param shape for callers that need one", () => {
      // The route itself no longer prerenders these — middleware redirects them
      // before routing, because a prerendered permanentRedirect() soft-404s.
      expect(getReplicationRouteAliasParams()).toEqual(
        Object.keys(REPLICATION_SLUG_ALIASES).map((slug) => ({ slug })),
      );
    });

    it("covers every rename the corpus actually needed", () => {
      expect(Object.keys(REPLICATION_SLUG_ALIASES).length).toBeGreaterThan(0);
      // Filename debris is exactly what the rename removed, so no target may
      // still carry it or the alias would point at another unreadable URL.
      for (const target of Object.values(REPLICATION_SLUG_ALIASES)) {
        expect(target).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
        expect(target).not.toMatch(/unknown$|upscayl|realesrgan|photos-v\d/);
      }
    });

    it("never aliases a slug that a real replication already owns", () => {
      const targets = new Set(Object.values(REPLICATION_SLUG_ALIASES));

      for (const from of Object.keys(REPLICATION_SLUG_ALIASES)) {
        expect(targets.has(from)).toBe(false);
      }
    });
  });
});
