import { describe, expect, it } from "vitest";

import { CORPORA } from "../../scripts/translation/corpora.mjs";
import { assembleLocaleDataset, extractSegments } from "../../scripts/translation/segment-manifest.mjs";
import type { WarningBannerPreset } from "../../src/data/substanceWarningBanners";

describe("warning banner semantic overlay", () => {
  it("translates reader copy while preserving identity, membership, tone, icon, and missing copy", () => {
    const canonical: WarningBannerPreset = {
      key: "opioid-respiratory-depression",
      tone: "danger",
      icon: "lucide:skull",
      severityLabel: "Danger",
      headline: "Respiratory depression",
      points: ["Opioids can suppress breathing.", "Combining depressants increases this risk."],
      enabled: true,
      enabledSlugs: ["heroin", "morphine"],
    };
    const dataset = { items: [canonical] };
    const { segments } = extractSegments(dataset, CORPORA.banners);
    const translated = new Map([
      ["Danger", "危险"],
      ["Respiratory depression", "呼吸抑制"],
      ["Opioids can suppress breathing.", "阿片类物质可抑制呼吸。"],
    ]);
    const translations = new Map(segments.flatMap((segment) => {
      const target = translated.get(segment.source);
      return target ? [[segment.hash, target] as const] : [];
    }));
    const localized = assembleLocaleDataset(dataset, segments, translations, { locale: "zh-Hans", corpus: CORPORA.banners }).dataset.items;
    expect(localized).toEqual([{
      ...canonical,
      severityLabel: "危险",
      headline: "呼吸抑制",
      points: ["阿片类物质可抑制呼吸。", "Combining depressants increases this risk."],
    }]);
    expect(segments.some((segment) => [canonical.key, canonical.icon, canonical.tone, ...canonical.enabledSlugs].includes(segment.source))).toBe(false);
    expect(canonical.headline).toBe("Respiratory depression");
  });
});
