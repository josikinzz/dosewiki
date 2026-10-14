import { describe, expect, it } from "vitest";

import {
  MAX_BANNERS_PER_ARTICLE,
  resolveEnabledBanners,
  resolveSuppressedBanners,
  searchWarningBannerTargets,
  substanceClassValues,
  type WarningBannerPreset,
  type WarningBannerTarget,
} from "./substanceWarningBanners";

/**
 * The render rule is the safety-critical contract in this feature: a banner may
 * only reach a reader because an editor enabled it on that slug. Every test here
 * defends an observable behaviour that a plausible bug would break: an inverted
 * default, a forgotten cap, a case-sensitive slug compare, or a future "helpful"
 * change that starts inferring assignment from a substance's classification.
 */

function preset(overrides: Partial<WarningBannerPreset> = {}): WarningBannerPreset {
  return {
    key: "depressant-respiratory",
    tone: "danger",
    icon: "lucide:wind",
    severityLabel: "Fatal combination",
    headline: "Mixing depressants stops breathing",
    points: ["CNS depression is additive."],
    enabled: false,
    enabledSlugs: [],
    ...overrides,
  };
}

describe("resolveEnabledBanners", () => {
  it("renders nothing when a preset is enabled but names no substance", () => {
    const presets = [preset({ enabled: true, enabledSlugs: [] })];
    expect(resolveEnabledBanners(presets, "diazepam")).toEqual([]);
  });

  it("renders nothing when a substance is named but the preset is switched off", () => {
    const presets = [preset({ enabled: false, enabledSlugs: ["diazepam"] })];
    expect(resolveEnabledBanners(presets, "diazepam")).toEqual([]);
  });

  it("renders only on the named substance, never on a sibling", () => {
    const presets = [preset({ enabled: true, enabledSlugs: ["diazepam"] })];

    expect(resolveEnabledBanners(presets, "diazepam").map((entry) => entry.key)).toEqual([
      "depressant-respiratory",
    ]);
    expect(resolveEnabledBanners(presets, "alprazolam")).toEqual([]);
  });

  it("renders an explicitly sitewide preset on every non-blank substance slug", () => {
    const presets = [preset({ enabled: true, allSubstances: true })];

    expect(resolveEnabledBanners(presets, "diazepam")).toHaveLength(1);
    expect(resolveEnabledBanners(presets, "newly-published-substance")).toHaveLength(1);
    expect(resolveEnabledBanners(presets, "   ")).toEqual([]);
  });

  it("compares slugs case-insensitively so a capitalised article cannot slip through unbannered", () => {
    const presets = [preset({ enabled: true, enabledSlugs: ["mdma"] })];
    expect(resolveEnabledBanners(presets, "MDMA")).toHaveLength(1);
    expect(resolveEnabledBanners(presets, "  mdma  ")).toHaveLength(1);
  });

  it("orders danger before unsafe before caution, then alphabetically by key", () => {
    const presets = [
      preset({ key: "c", tone: "caution", enabled: true, enabledSlugs: ["x"] }),
      preset({ key: "d-late", tone: "danger", enabled: true, enabledSlugs: ["x"] }),
      preset({ key: "u", tone: "unsafe", enabled: true, enabledSlugs: ["x"] }),
      preset({ key: "d-early", tone: "danger", enabled: true, enabledSlugs: ["x"] }),
    ];

    // The cap trims the tail, so assert against the full ordering first.
    expect(resolveSuppressedBanners(presets, "x").map((entry) => entry.key)).toEqual(["u", "c"]);
    expect(resolveEnabledBanners(presets, "x").map((entry) => entry.key)).toEqual([
      "d-early",
      "d-late",
    ]);
  });

  it("caps what renders and reports the remainder separately", () => {
    const presets = ["a", "b", "c", "d"].map((key) =>
      preset({ key, enabled: true, enabledSlugs: ["x"] }),
    );

    expect(resolveEnabledBanners(presets, "x")).toHaveLength(MAX_BANNERS_PER_ARTICLE);
    expect(resolveSuppressedBanners(presets, "x").map((entry) => entry.key)).toEqual(["c", "d"]);
  });

  it("returns nothing for a blank slug rather than matching a blank entry", () => {
    const presets = [preset({ enabled: true, enabledSlugs: [""] })];
    expect(resolveEnabledBanners(presets, "")).toEqual([]);
    expect(resolveEnabledBanners(presets, "   ")).toEqual([]);
  });

  it("ignores classification entirely; a substance the search finds is still unbannered", () => {
    const presets = [preset({ enabled: true, enabledSlugs: [] })];
    const targets: WarningBannerTarget[] = [
      {
        slug: "diazepam",
        title: "Diazepam",
        classes: substanceClassValues({
          psychoactiveClasses: ["Depressant", "GABAergic"],
          chemicalClasses: ["Benzodiazepine"],
          indexCategories: ["Common"],
        }),
      },
    ];

    // The Studio search finds exactly the substance an editor is looking for…
    expect(searchWarningBannerTargets("benzodiazepine", targets).map((hit) => hit.slug)).toEqual([
      "diazepam",
    ]);

    // …and it still renders nothing, because finding is not enabling. Class
    // strings never reach `resolveEnabledBanners`, which takes a slug only.
    expect(resolveEnabledBanners(presets, "diazepam")).toEqual([]);
  });
});
