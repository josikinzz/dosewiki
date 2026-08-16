import { describe, expect, it } from "vitest";

import {
  MAX_BANNERS_PER_ARTICLE,
  normalizeLinks,
  resolveEnabledBanners,
  resolveSuppressedBanners,
  substanceClassTokens,
  matcherHits,
  warningBannerPresetState,
  type WarningBannerLink,
  type WarningBannerPreset,
} from "./substanceWarningBanners";

/**
 * The render rule is the safety-critical contract in this feature: a banner may
 * only reach a reader because an editor enabled it on that slug. Every test here
 * defends an observable behaviour that a plausible bug would break — an inverted
 * default, a forgotten cap, a case-sensitive slug compare, or a future "helpful"
 * change that starts inferring assignment from a substance's classification.
 */

function preset(overrides: Partial<WarningBannerPreset> = {}): WarningBannerPreset {
  return {
    key: "depressant-respiratory",
    label: "Depressant respiratory risk",
    tone: "danger",
    icon: "lucide:wind",
    severityLabel: "Fatal combination",
    headline: "Mixing depressants stops breathing",
    points: ["CNS depression is additive."],
    links: [{ label: "Dangerous combinations", sectionId: "interactions" }],
    priority: 10,
    enabled: false,
    enabledSlugs: [],
    candidateMatchers: ["gabaergic"],
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

  it("compares slugs case-insensitively so a capitalised article cannot slip through unbannered", () => {
    const presets = [preset({ enabled: true, enabledSlugs: ["mdma"] })];
    expect(resolveEnabledBanners(presets, "MDMA")).toHaveLength(1);
    expect(resolveEnabledBanners(presets, "  mdma  ")).toHaveLength(1);
  });

  it("orders danger before unsafe before caution, then by priority", () => {
    const presets = [
      preset({ key: "c", tone: "caution", enabled: true, enabledSlugs: ["x"] }),
      preset({ key: "d-late", tone: "danger", priority: 90, enabled: true, enabledSlugs: ["x"] }),
      preset({ key: "u", tone: "unsafe", enabled: true, enabledSlugs: ["x"] }),
      preset({ key: "d-early", tone: "danger", priority: 10, enabled: true, enabledSlugs: ["x"] }),
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
      preset({ key, enabled: true, enabledSlugs: ["x"], priority: key.charCodeAt(0) }),
    );

    expect(resolveEnabledBanners(presets, "x")).toHaveLength(MAX_BANNERS_PER_ARTICLE);
    expect(resolveSuppressedBanners(presets, "x").map((entry) => entry.key)).toEqual(["c", "d"]);
  });

  it("returns nothing for a blank slug rather than matching a blank entry", () => {
    const presets = [preset({ enabled: true, enabledSlugs: [""] })];
    expect(resolveEnabledBanners(presets, "")).toEqual([]);
    expect(resolveEnabledBanners(presets, "   ")).toEqual([]);
  });

  it("ignores classification entirely — a matcher that hits does not enable", () => {
    const presets = [
      preset({
        enabled: true,
        enabledSlugs: [],
        candidateMatchers: ["gabaergic", "depressant", "benzodiazepine"],
      }),
    ];

    // The same substance a matcher would obviously propose.
    const tokens = substanceClassTokens({
      psychoactiveClasses: ["Depressant", "GABAergic"],
      chemicalClasses: ["Benzodiazepine"],
      indexCategories: ["Common"],
    });
    expect(matcherHits(presets[0], tokens)).toHaveLength(3);

    // …and it still renders nothing, because suggestion is not assignment.
    expect(resolveEnabledBanners(presets, "diazepam")).toEqual([]);
  });
});

describe("warningBannerPresetState", () => {
  it("separates off from enabled-but-empty, because they need different editor prompts", () => {
    expect(warningBannerPresetState({ enabled: false, enabledSlugs: ["diazepam"] })).toBe("off");
    expect(warningBannerPresetState({ enabled: true, enabledSlugs: [] })).toBe("dormant");
    expect(warningBannerPresetState({ enabled: true, enabledSlugs: ["diazepam"] })).toBe("live");
  });
});

describe("substanceClassTokens", () => {
  it("exposes both the raw and paren-stripped form so either can be targeted", () => {
    const tokens = substanceClassTokens({
      chemicalClasses: ["Phenethylamine (N-benzylated)"],
    });
    expect(tokens).toContain("phenethylamine (n-benzylated)");
    expect(tokens).toContain("phenethylamine");
  });

  it("survives the v.any() payloads Convex actually stores", () => {
    expect(
      substanceClassTokens({
        psychoactiveClasses: [null, 42, "  Opioid  ", ""],
        chemicalClasses: undefined,
        indexCategories: null,
      }),
    ).toEqual(["opioid"]);
  });
});

describe("normalizeLinks", () => {
  it("keeps one link per anchor and drops targets no article renders", () => {
    // The Convex column is `v.string()`, so a hand-edited or older document can
    // name a section the article never renders. Cast because the bad value is
    // the point of the test and no runtime check can produce it in TypeScript.
    const stored = [
      { label: "First", sectionId: "interactions" },
      { label: "Second", sectionId: "interactions" },
      { label: "Nowhere", sectionId: "made-up" },
    ] as unknown as WarningBannerLink[];

    expect(normalizeLinks(stored)).toEqual([{ label: "Second", sectionId: "interactions" }]);
  });

  it("falls back to the suggested wording rather than rendering a blank chip", () => {
    expect(normalizeLinks([{ label: "   ", sectionId: "harm-potential" }])).toEqual([
      { label: "Harm potential", sectionId: "harm-potential" },
    ]);
  });
});
