import { isEffectIndex } from "@/config/siteFlavor";
import manifest from "../pageSocialCardManifest.generated.json";

export const PAGE_SOCIAL_CARD_SIZE = 1200;

export const PAGE_SOCIAL_CARD_KEYS = [
  "home",
  "substances",
  "effects",
  "replications",
  "chemical-classes",
  "about",
  "china",
  "languages",
] as const;

export type PageSocialCardKey = (typeof PAGE_SOCIAL_CARD_KEYS)[number];

type PageSocialCardImage = {
  path: string;
  width: number;
  height: number;
  alt: string;
};

const CARD_PATH_BY_KEY = manifest.cards as Partial<Record<PageSocialCardKey, string>>;

export function pageSocialCardUrl(key: PageSocialCardKey): string | null {
  if (isEffectIndex()) return null;
  return CARD_PATH_BY_KEY[key] ?? null;
}

export function pageSocialCardImage(
  key: PageSocialCardKey,
  alt: string,
): PageSocialCardImage | undefined {
  const path = pageSocialCardUrl(key);
  return path
    ? {
        path,
        width: PAGE_SOCIAL_CARD_SIZE,
        height: PAGE_SOCIAL_CARD_SIZE,
        alt,
      }
    : undefined;
}
