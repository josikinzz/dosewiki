import "server-only";

import { publicDataCache, PUBLIC_DATA_CACHE_REVALIDATE_SECONDS } from "../data/publicData.cache";
import { PUBLIC_DATA_CACHE_TAGS } from "../data/publicData.cacheTags";
import { cache } from "react";
import { CORPORA } from "../../scripts/translation/corpora.mjs";
import { localizeDataset } from "../translation/liveTranslation";

import { getPublicDataReadAdapter } from "../data/publicData.reads";
import {
  clampSafetyBannerIconSize,
  isWarningBannerTone,
  normalizeEnabledSlugs,
  SAFETY_BANNER_ICON_SIZE_DEFAULT,
  type WarningBannerPreset,
} from "../../src/data/substanceWarningBanners";

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function readStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const entries: unknown[] = raw;
  return entries.filter((item): item is string => typeof item === "string" && item.length > 0);
}

function parseWarningBannerPreset(raw: unknown): WarningBannerPreset | null {
  if (!isRecord(raw)) {
    return null;
  }

  const { key, icon, severityLabel, headline, tone } = raw;
  if (
    typeof key !== "string" ||
    key.length === 0 ||
    typeof icon !== "string" ||
    icon.length === 0 ||
    typeof severityLabel !== "string" ||
    severityLabel.length === 0 ||
    typeof headline !== "string" ||
    headline.length === 0 ||
    !isWarningBannerTone(tone)
  ) {
    return null;
  }

  return {
    key,
    tone,
    icon,
    severityLabel,
    headline,
    points: readStringArray(raw.points),
    enabled: raw.enabled === true,
    enabledSlugs: normalizeEnabledSlugs(readStringArray(raw.enabledSlugs)),
  };
}

export const getWarningBannerPresets = cache(
  publicDataCache(async (): Promise<WarningBannerPreset[]> => {
    try {
      const rows = await getPublicDataReadAdapter().getPublicWarningBannerPresets();
      if (!Array.isArray(rows)) {
        return [];
      }
      return rows.flatMap((row: unknown) => {
        const parsed = parseWarningBannerPreset(row);
        return parsed ? [parsed] : [];
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(
        `[banners] warningBanners:listPresets failed; no safety banners will render. Cause: ${message}`,
      );
      return [];
    }
  },
  ["data-public-warning-banners"],
  {
    revalidate: PUBLIC_DATA_CACHE_REVALIDATE_SECONDS,
    tags: [PUBLIC_DATA_CACHE_TAGS.all, PUBLIC_DATA_CACHE_TAGS.banners],
  },),
);

export async function localizeWarningBannerPresets(
  presets: WarningBannerPreset[],
  locale: string,
): Promise<WarningBannerPreset[]> {
  if (presets.length === 0) {
    return presets;
  }

  const localized = await localizeDataset(
    { items: presets as unknown as Record<string, unknown>[] },
    CORPORA.banners,
    locale,
  );
  return localized.dataset.items as unknown as WarningBannerPreset[];
}

export const getLocalizedWarningBannerPresets = cache(async (
  locale: string,
): Promise<WarningBannerPreset[]> => (
  localizeWarningBannerPresets(await getWarningBannerPresets(), locale)
));

export const getSafetyBannerIconSize = cache(
  publicDataCache(async (): Promise<number> => {
    try {
      const config = await getPublicDataReadAdapter().getPublicBannerDisplayConfig();
      return clampSafetyBannerIconSize(isRecord(config) ? config.iconSize : undefined);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(
        `[banners] siteConfig:getBannerDisplay failed; safety banner glyphs render at the default ${SAFETY_BANNER_ICON_SIZE_DEFAULT}px. Cause: ${message}`,
      );
      return SAFETY_BANNER_ICON_SIZE_DEFAULT;
    }
  },
  ["data-public-safety-banner-icon-size"],
  {
    revalidate: PUBLIC_DATA_CACHE_REVALIDATE_SECONDS,
    tags: [PUBLIC_DATA_CACHE_TAGS.all, PUBLIC_DATA_CACHE_TAGS.banners],
  },),
);
