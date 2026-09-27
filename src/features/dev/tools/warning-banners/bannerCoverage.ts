import {
  resolveSuppressedBanners,
  WARNING_BANNER_TONES,
  type WarningBannerPreset,
  type WarningBannerTone,
} from "@/data/substanceWarningBanners";

type ToneCoverage = {
  /** Substances a live preset of this tone names on its list. */
  listed: ReadonlySet<string>;
  /** Live presets of this tone that reach every substance article. */
  sitewide: number;
}

/**
 * The rollout readout, split the way an editor asks about it: which tone
 * reaches which substances. A sitewide preset is counted as a preset, never as
 * every slug in the corpus, because "every article carries a caution notice"
 * says nothing about how many articles carry a death warning, and folding the
 * two together is what made the old headline read 100% no matter what.
 */
export type BannerCoverage = {
  /** Substances named on the list of at least one live preset, any tone. */
  listed: ReadonlySet<string>;
  /** Live presets that reach every substance article. */
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

/**
 * Where the two-banner cap hides a preset that applies: for each preset key,
 * how many of `slugs` it is enabled on but does not render on, and how many
 * articles hit the cap at all. The readout and the preset list say this, so
 * a count never promises a banner a reader does not see.
 */
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

/**
 * The slugs of `slugs` on which `preset`, with `enabledSlugs` as its list,
 * would be enabled but hidden by the cap: the question an Enable confirm has
 * to answer before a banner is promised to readers who will not see it.
 */
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
