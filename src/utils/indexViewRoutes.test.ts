import { describe, expect, it } from "vitest";

import {
  EFFECT_INDEX_VIEW_PARAMS,
  REPORTS_INDEX_VIEW_PARAMS,
  SUBSTANCE_INDEX_VIEW_PARAMS,
  effectIndexViewFromSlug,
  effectIndexViewPath,
  parseLegacyEffectIndexHash,
  parseLegacySubstanceIndexHash,
  reportsIndexViewFromSlug,
  reportsIndexViewPath,
  substanceIndexViewFromSlug,
  substanceIndexViewPath,
} from "./indexViewRoutes";
import { replaceCurrentIndexViewPath } from "./navigation";

describe("canonical index view routes", () => {
  it("round-trips every Substance Index view and keeps All on the bare route", () => {
    expect(substanceIndexViewPath("all")).toBe("/substances");

    for (const { view, slug } of SUBSTANCE_INDEX_VIEW_PARAMS) {
      expect(substanceIndexViewPath(view)).toBe(`/substances/group/${slug}`);
      expect(substanceIndexViewFromSlug(slug)).toBe(view);
    }
  });

  it("round-trips every Effect Index view and keeps All on the bare route", () => {
    expect(effectIndexViewPath("all")).toBe("/effects");

    for (const { view, slug } of EFFECT_INDEX_VIEW_PARAMS) {
      expect(effectIndexViewPath(view)).toBe(`/effects/group/${slug}`);
      expect(effectIndexViewFromSlug(slug)).toBe(view);
    }
  });

  it("round-trips shareable report groupings and keeps Substance on the bare route", () => {
    expect(reportsIndexViewPath("substance")).toBe("/reports");

    for (const { view, slug } of REPORTS_INDEX_VIEW_PARAMS) {
      expect(reportsIndexViewPath(view)).toBe(`/reports/group/${slug}`);
      expect(reportsIndexViewFromSlug(slug)).toBe(view);
    }
  });

  it("migrates only recognized legacy tab fragments", () => {
    expect(parseLegacySubstanceIndexHash("#stimulant")).toBe("stimulant");
    expect(parseLegacySubstanceIndexHash("#super%3Adepressants")).toBe(
      "super:depressants",
    );

    expect(parseLegacySubstanceIndexHash("#article-heading")).toBeNull();
    expect(parseLegacyEffectIndexHash("#Cognitive")).toBe("cognitive");
    expect(parseLegacyEffectIndexHash("#visual-gamma")).toBeNull();
  });
  it("writes client-side view changes to canonical App Paths", () => {
    window.history.replaceState({}, "", "/effects");
    replaceCurrentIndexViewPath("/effects/group/physical");
    expect(window.location.pathname).toBe("/effects/group/physical");
  });
});
