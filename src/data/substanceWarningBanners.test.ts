import { describe, expect, it } from "vitest";

import {
  MAX_BANNERS_PER_ARTICLE,
  resolveEnabledBanners,
  resolveSuppressedBanners,
  type WarningBannerPreset,
} from "./substanceWarningBanners";

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
});
