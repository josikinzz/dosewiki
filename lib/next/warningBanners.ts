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

function malformedPreset(index: number, field: string): Error {
  return new Error(
    `[banners] warningBanners:listPresets returned a malformed preset at index ${index}: invalid ${field}.`,
  );
}

function readStringArray(raw: unknown, index: number, field: string): string[] {
  if (!Array.isArray(raw)) {
    throw malformedPreset(index, field);
  }
  const entries: unknown[] = raw;
  if (!entries.every((item) => typeof item === "string")) {
    throw malformedPreset(index, field);
  }
  return entries.filter((item): item is string => typeof item === "string" && item.length > 0);
}

function readNonEmptyString(record: Record<string, unknown>, field: string, index: number): string {
  const value = record[field];
  if (typeof value !== "string" || value.length === 0) {
    throw malformedPreset(index, field);
  }
  return value;
}

function parseWarningBannerPreset(raw: unknown, index: number): WarningBannerPreset {
  if (!isRecord(raw)) {
    throw malformedPreset(index, "row");
  }
  if (!isWarningBannerTone(raw.tone)) {
    throw malformedPreset(index, "tone");
  }

  return {
    key: readNonEmptyString(raw, "key", index),
    tone: raw.tone,
    icon: readNonEmptyString(raw, "icon", index),
    severityLabel: readNonEmptyString(raw, "severityLabel", index),
    headline: readNonEmptyString(raw, "headline", index),
    points: readStringArray(raw.points, index, "points"),
    enabled: raw.enabled === true,
    enabledSlugs: normalizeEnabledSlugs(readStringArray(raw.enabledSlugs, index, "enabledSlugs")),
  };
}

export const getWarningBannerPresets = cache(
  publicDataCache(async (): Promise<WarningBannerPreset[]> => {
    const rows = await getPublicDataReadAdapter().getPublicWarningBannerPresets();
    if (!Array.isArray(rows)) {
      throw new Error("[banners] warningBanners:listPresets did not return an array.");
    }
    const entries: unknown[] = rows;
    return entries.map(parseWarningBannerPreset);
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
