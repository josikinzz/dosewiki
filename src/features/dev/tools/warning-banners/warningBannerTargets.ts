/**
 * The Banner Studio's view of the substance corpus: one row per article,
 * carrying only the class strings the candidate finder tests matchers against.
 *
 * The shape lives here rather than beside the route because the route
 * (`src/app/api/dev/warning-banner/targets/route.ts`) is only the transport,
 * and both the Presets candidate finder and the Coverage rail code against this
 * type. Nothing in it can cause a banner to render — `resolveEnabledBanners`
 * takes a slug and never a classification, so these class strings exist purely
 * to suggest slugs an editor may then enable by hand.
 */
export type WarningBannerTarget = {
  slug: string;
  title: string;
  psychoactiveClasses: string[];
  chemicalClasses: string[];
  indexCategories: string[];
};

const TARGETS_API = "/api/dev/warning-banner/targets";

/**
 * The loaded corpus survives leaving and re-entering the Banners tab, mirroring
 * `cachedCandidates` in `SubstanceGalleryPanel.tsx`: the route walks the whole
 * substance table page by page, so rescanning on every visit would spend
 * hundreds of document reads reproducing a list that has not changed. Read as a
 * live ESM binding so a view can seed its state synchronously on the second
 * visit and the rollout denominator never flickers through zero.
 *
 * Only `fetchWarningBannerTargets` assigns it, and a failed read clears it so
 * the retry is a real retry rather than a replay of the failure.
 */
export let cachedWarningBannerTargets: WarningBannerTarget[] | null = null;

export async function fetchWarningBannerTargets(
  options?: { refresh?: boolean },
): Promise<WarningBannerTarget[]> {
  if (!options?.refresh && cachedWarningBannerTargets) {
    return cachedWarningBannerTargets;
  }

  const response = await fetch(TARGETS_API, { headers: { Accept: "application/json" } });

  let payload: { items?: WarningBannerTarget[]; error?: string } = {};
  try {
    payload = (await response.json()) as typeof payload;
  } catch {
    // Most likely an HTML sign-in redirect rather than the route's JSON. The
    // status below carries the real story, so the parse failure needs no
    // message of its own.
  }

  if (!response.ok || !payload.items) {
    cachedWarningBannerTargets = null;
    throw new Error(
      payload.error ?? `The substance list could not be loaded (HTTP ${response.status}).`,
    );
  }

  cachedWarningBannerTargets = payload.items;
  return payload.items;
}
