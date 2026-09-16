import { describe, expect, it } from "vitest";

import {
  MAX_BANNERS_PER_ARTICLE,
  SAFETY_BANNER_ICON_SIZE_DEFAULT,
  SAFETY_BANNER_ICON_SIZE_MAX,
  SAFETY_BANNER_ICON_SIZE_MIN,
  clampSafetyBannerIconSize,
  compareWarningBanners,
  resolveEnabledBanners,
  resolveSuppressedBanners,
  searchWarningBannerTargets,
  substanceClassValues,
  toWarningBannerBlocks,
  warningBannerPresetState,
  type WarningBannerPreset,
  type WarningBannerTarget,
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

  it("ignores classification entirely — a substance the search finds is still unbannered", () => {
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

describe("compareWarningBanners", () => {
  it("sorts by tone first, so a danger preset outranks a caution one whatever its key", () => {
    const sorted = [
      preset({ key: "a-caution", tone: "caution" }),
      preset({ key: "z-danger", tone: "danger" }),
      preset({ key: "m-unsafe", tone: "unsafe" }),
    ]
      .sort(compareWarningBanners)
      .map((entry) => entry.key);

    expect(sorted).toEqual(["z-danger", "m-unsafe", "a-caution"]);
  });

  it("breaks a same-tone tie on key, the only tiebreak an editor can see", () => {
    const sorted = [
      preset({ key: "opioid-tolerance", tone: "danger" }),
      preset({ key: "gabaergic-withdrawal", tone: "danger" }),
    ]
      .sort(compareWarningBanners)
      .map((entry) => entry.key);

    expect(sorted).toEqual(["gabaergic-withdrawal", "opioid-tolerance"]);
  });
});

describe("warningBannerPresetState", () => {
  it("separates off from enabled-but-empty, because they need different editor prompts", () => {
    expect(warningBannerPresetState({ enabled: false, enabledSlugs: ["diazepam"] })).toBe("off");
    expect(warningBannerPresetState({ enabled: true, enabledSlugs: [] })).toBe("dormant");
    expect(warningBannerPresetState({ enabled: true, enabledSlugs: ["diazepam"] })).toBe("live");
    expect(
      warningBannerPresetState({ enabled: true, allSubstances: true, enabledSlugs: [] }),
    ).toBe("live");
  });
});

describe("substanceClassValues", () => {
  it("keeps the reader-facing casing, because the Studio prints the class that matched", () => {
    expect(
      substanceClassValues({
        psychoactiveClasses: ["Depressant"],
        chemicalClasses: ["Phenethylamine (N-benzylated)"],
      }),
    ).toEqual(["Depressant", "Phenethylamine (N-benzylated)"]);
  });

  it("deduplicates case-insensitively so one class cannot appear twice in the finder", () => {
    expect(
      substanceClassValues({
        psychoactiveClasses: ["Depressant"],
        chemicalClasses: ["depressant"],
        indexCategories: ["DEPRESSANT"],
      }),
    ).toEqual(["Depressant"]);
  });

  it("survives the v.any() payloads Postgres actually stores", () => {
    expect(
      substanceClassValues({
        psychoactiveClasses: [null, 42, "  Opioid  ", ""],
        chemicalClasses: undefined,
        indexCategories: null,
      }),
    ).toEqual(["Opioid"]);
  });
});

/**
 * One search box does both jobs an editor has: find a named drug, or find a
 * whole class of them. It is the reason per-substance enabling is no harder than
 * per-class enabling — and, being search, it stores nothing.
 */
describe("searchWarningBannerTargets", () => {
  const targets: WarningBannerTarget[] = [
    { slug: "phenethylamine", title: "Phenethylamine", classes: ["Stimulant"] },
    { slug: "25i-nbome", title: "25I-NBOMe", classes: ["Phenethylamine (N-benzylated)"] },
    { slug: "diazepam", title: "Diazepam", classes: ["GABAergic", "Benzodiazepine"] },
  ];

  it("ranks a name match above a class match, because typing a drug name means that drug", () => {
    const hits = searchWarningBannerTargets("phenethylamine", targets);

    expect(hits.map((hit) => [hit.slug, hit.kind])).toEqual([
      ["phenethylamine", "name"],
      ["25i-nbome", "class"],
    ]);
  });

  it("returns nothing below two characters rather than proposing the whole corpus", () => {
    expect(searchWarningBannerTargets("p", targets)).toEqual([]);
    expect(searchWarningBannerTargets(" ", targets)).toEqual([]);
  });

  it("matches a class through its parenthetical qualifier", () => {
    const hits = searchWarningBannerTargets("Phenethylamine", [targets[1]]);

    expect(hits).toHaveLength(1);
    expect(hits[0].kind).toBe("class");
  });

  it("reports the matched string in its own casing, so the evidence line is quotable", () => {
    const [hit] = searchWarningBannerTargets("gabaergic", targets);

    expect(hit.reason).toBe("GABAergic");
    expect(searchWarningBannerTargets("diaze", targets)[0].reason).toBe("Diazepam");
  });
});

/**
 * One size for every banner, resolved identically by the Postgres mutation, the
 * public read, the write route and the Studio control. The default is not an
 * arbitrary pick: 44 is what `SafetyBanner` shipped with, so a deployment that
 * has never stored a setting must render exactly as it did before the setting
 * existed. And because the number lands in an SVG `width`/`height`, anything
 * that is not a finite number has to become one here rather than downstream.
 */
describe("clampSafetyBannerIconSize", () => {
  it("falls back to the shipped 44 for an unset or unusable value", () => {
    expect(SAFETY_BANNER_ICON_SIZE_DEFAULT).toBe(44);
    expect(clampSafetyBannerIconSize(undefined)).toBe(44);
    expect(clampSafetyBannerIconSize(null)).toBe(44);
    expect(clampSafetyBannerIconSize("48")).toBe(44);
    expect(clampSafetyBannerIconSize(Number.NaN)).toBe(44);
    expect(clampSafetyBannerIconSize(Number.POSITIVE_INFINITY)).toBe(44);
    expect(clampSafetyBannerIconSize({ iconSize: 48 })).toBe(44);
  });

  it("passes an in-range size through untouched", () => {
    expect(clampSafetyBannerIconSize(32)).toBe(32);
    expect(clampSafetyBannerIconSize(SAFETY_BANNER_ICON_SIZE_MIN)).toBe(24);
    expect(clampSafetyBannerIconSize(SAFETY_BANNER_ICON_SIZE_MAX)).toBe(72);
  });

  it("rounds a fractional size, because the glyph is measured in whole pixels", () => {
    expect(clampSafetyBannerIconSize(43.4)).toBe(43);
    expect(clampSafetyBannerIconSize(43.5)).toBe(44);
  });

  it("pulls an out-of-range size to the nearer bound instead of to the default", () => {
    expect(clampSafetyBannerIconSize(8)).toBe(24);
    expect(clampSafetyBannerIconSize(-40)).toBe(24);
    expect(clampSafetyBannerIconSize(200)).toBe(72);
  });
});

describe("toWarningBannerBlocks", () => {
  it("leaves unmarked lines as separate paragraphs, however many there are", () => {
    expect(toWarningBannerBlocks(["First sentence.", "Second sentence."])).toEqual([
      { kind: "paragraph", text: "First sentence." },
      { kind: "paragraph", text: "Second sentence." },
    ]);
  });

  it("only makes a bullet when the line opens with a markdown marker", () => {
    expect(toWarningBannerBlocks(["- Additive with other depressants"])).toEqual([
      { kind: "list", items: ["Additive with other depressants"] },
    ]);
    expect(toWarningBannerBlocks(["* Naloxone does not reverse benzodiazepines"])).toEqual([
      { kind: "list", items: ["Naloxone does not reverse benzodiazepines"] },
    ]);
  });

  it("collapses consecutive markers into one list rather than a run of one-item lists", () => {
    expect(toWarningBannerBlocks(["- one", "- two", "- three"])).toEqual([
      { kind: "list", items: ["one", "two", "three"] },
    ]);
  });

  it("keeps a lead paragraph ahead of a list, and resumes prose after it", () => {
    expect(toWarningBannerBlocks(["Lead.", "- a", "- b", "Trailing."])).toEqual([
      { kind: "paragraph", text: "Lead." },
      { kind: "list", items: ["a", "b"] },
      { kind: "paragraph", text: "Trailing." },
    ]);
  });

  it("does not mistake a mid-sentence hyphen for a marker", () => {
    // The shipped opioid preset opens a line exactly like this.
    const line = "Seriously - this is by far the most common way people die in this space :(";
    expect(toWarningBannerBlocks([line])).toEqual([{ kind: "paragraph", text: line }]);
  });

  it("drops blank lines and empty markers instead of rendering an empty block", () => {
    expect(toWarningBannerBlocks(["", "   ", "-", "- ", "Real."])).toEqual([
      { kind: "paragraph", text: "Real." },
    ]);
  });
});
