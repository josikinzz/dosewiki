import type { WarningBannerTarget } from "@/data/substanceWarningBanners";
import { WarningRequestError } from "./warningEditing";

const TARGETS_API = "/api/dev/warning-banner/targets";

export let cachedWarningBannerTargets: WarningBannerTarget[] | null = null;

export async function fetchWarningBannerTargets(
  options?: { refresh?: boolean },
): Promise<WarningBannerTarget[]> {
  if (!options?.refresh && cachedWarningBannerTargets) {
    return cachedWarningBannerTargets;
  }

  const response = await fetch(TARGETS_API, { cache: "no-store", headers: { Accept: "application/json" } });

  let payload: { items?: WarningBannerTarget[]; error?: string } = {};
  try {
    payload = (await response.json()) as typeof payload;
  } catch {
  }

  if (!response.ok || !payload.items) {
    cachedWarningBannerTargets = null;
    throw new WarningRequestError(
      payload.error ?? `The substance list could not be loaded (HTTP ${response.status}).`,
      response.status,
    );
  }

  cachedWarningBannerTargets = payload.items;
  return payload.items;
}

export const BANNER_PRESET_SLUG_PREFIX = "preset:";

export function bannerPresetFromSlug(slug: string | undefined): string | null {
  return slug?.startsWith(BANNER_PRESET_SLUG_PREFIX) ? slug.slice(BANNER_PRESET_SLUG_PREFIX.length) || null : null;
}
