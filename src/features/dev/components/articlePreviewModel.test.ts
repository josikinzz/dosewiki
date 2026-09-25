import { describe, expect, it } from "vitest";

import type { WarningBannerPreset } from "@/data/substanceWarningBanners";
import { draftMoleculeImageUrl, previewBannerStack } from "./articlePreviewModel";

function preset(overrides: Partial<WarningBannerPreset>): WarningBannerPreset {
  return {
    key: "preset",
    tone: "danger",
    icon: "custom:benzene",
    severityLabel: "Danger",
    headline: "Headline",
    points: [],
    enabled: true,
    allSubstances: false,
    enabledSlugs: ["lsd"],
    ...overrides,
  };
}

describe("previewBannerStack", () => {
  it("orders the draft among saved presets by the route's rule", () => {
    const saved = preset({ key: "b-caution", tone: "caution" });
    const draft = preset({ key: "a-danger" });
    const stack = previewBannerStack({ presets: [saved], draft, slug: "lsd", showBetaDisclaimer: false });
    expect(stack.banners.map((banner) => banner.key)).toEqual(["a-danger", "b-caution"]);
    expect(stack).toMatchObject({ hiddenBy: null, forced: false });
  });

  it("marks a draft the audited-article rule drops", () => {
    const draft = preset({ key: "citation-system-overhaul-1", allSubstances: true });
    const stack = previewBannerStack({ presets: [], draft, slug: "lsd", showBetaDisclaimer: true });
    expect(stack.banners).toEqual([]);
    expect(stack.hiddenBy).toBe("audited");
  });

  it("forces a draft that is off on this slug into the stack", () => {
    const draft = preset({ key: "draft", enabledSlugs: ["mdma"] });
    const stack = previewBannerStack({ presets: [], draft, slug: "lsd", showBetaDisclaimer: false });
    expect(stack.forced).toBe(true);
    expect(stack.banners.map((banner) => banner.headline)).toEqual(["Headline"]);
  });
});

describe("draftMoleculeImageUrl", () => {
  it("encodes the draft bytes as an SVG data URL", () => {
    const url = draftMoleculeImageUrl('<svg xmlns="http://www.w3.org/2000/svg"></svg>', "light");
    expect(url.startsWith("data:image/svg+xml;charset=utf-8,")).toBe(true);
    expect(decodeURIComponent(url.split(",")[1])).toContain("<svg");
  });
});
