/**
 * The Banner Studio's one read of the substance corpus.
 *
 * `WarningBannerTarget` itself lives in `src/data/substanceWarningBanners.ts`
 * beside `searchWarningBannerTargets`, which is the only thing that reads its
 * `classes`: the shape is shared with `server/warningBanners.listSubstanceTargetsPage`
 * and the route that drains it, so it cannot live in a view module. What is
 * local here is the transport and its cache.
 */

import type { WarningBannerTarget } from "@/data/substanceWarningBanners";
import { WarningRequestError } from "./warningEditing";

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

  const response = await fetch(TARGETS_API, { cache: "no-store", headers: { Accept: "application/json" } });

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
    throw new WarningRequestError(
      payload.error ?? `The substance list could not be loaded (HTTP ${response.status}).`,
      response.status,
    );
  }

  cachedWarningBannerTargets = payload.items;
  return payload.items;
}
