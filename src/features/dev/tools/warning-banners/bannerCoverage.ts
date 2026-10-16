import {
  resolveSuppressedBanners,
  WARNING_BANNER_TONES,
  type WarningBannerPreset,
  type WarningBannerTone,
} from "@/data/substanceWarningBanners";

type ToneCoverage = {
  listed: ReadonlySet<string>;
  sitewide: number;
}

export type BannerCoverage = {
  listed: ReadonlySet<string>;
  sitewide: number;
  byTone: Record<WarningBannerTone, ToneCoverage>;
};

export function summarizeBannerCoverage(
  presets: readonly WarningBannerPreset[],
): BannerCoverage {
  const listed = new Set<string>();
  let sitewide = 0;
  const byTone = Object.fromEntries(
    WARNING_BANNER_TONES.map((tone) => [tone, { listed: new Set<string>(), sitewide: 0 }]),
  ) as Record<WarningBannerTone, { listed: Set<string>; sitewide: number }>;

  for (const preset of presets) {
    if (!preset.enabled) {
      continue;
    }
    const tone = byTone[preset.tone];
    if (preset.allSubstances) {
      sitewide += 1;
      tone.sitewide += 1;
      continue;
    }
    for (const slug of preset.enabledSlugs) {
      listed.add(slug);
      tone.listed.add(slug);
    }
  }

  return { listed, sitewide, byTone };
}

export type CapSuppression = { byKey: ReadonlyMap<string, number>; articles: number };

export function summarizeCapSuppression(
  presets: readonly WarningBannerPreset[],
  slugs: readonly string[],
): CapSuppression {
  const byKey = new Map<string, number>();
  let articles = 0;
  for (const slug of slugs) {
    const hidden = resolveSuppressedBanners(presets, slug);
    if (hidden.length === 0) continue;
    articles += 1;
    for (const preset of hidden) byKey.set(preset.key, (byKey.get(preset.key) ?? 0) + 1);
  }
  return { byKey, articles };
}

export function slugsHiddenByCap(
  presets: readonly WarningBannerPreset[],
  preset: WarningBannerPreset,
  enabledSlugs: readonly string[],
  slugs: readonly string[],
): string[] {
  const next = [...presets.filter((candidate) => candidate.key !== preset.key), { ...preset, enabledSlugs: [...enabledSlugs] }];
  return slugs.filter((slug) =>
    resolveSuppressedBanners(next, slug).some((hidden) => hidden.key === preset.key),
  );
}
