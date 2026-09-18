import "server-only";

import { publicDataCache } from "./publicData.cache"
import { cache } from "react";
import type { NormalizedUserProfile } from "../../src/data/userProfiles";
import { PUBLIC_DATA_CACHE_REVALIDATE_SECONDS, PUBLIC_DATA_CACHE_TAGS } from "./publicData.cache";
import { getPublicContributorByKey, getPublicContributorIdentities } from "./publicData.contributors";
import { getPublicDataReadAdapter } from "./publicData.reads";
import type { PublicAboutData } from "./publicData.shared";

/** The About config document, a leaf read persisted at the top level. */
const getPublicAboutConfig = cache(publicDataCache(async () => {
  return await getPublicDataReadAdapter().getPublicAboutConfig();
}, ["data-public-about-config-v1"], {
  revalidate: PUBLIC_DATA_CACHE_REVALIDATE_SECONDS,
  tags: [PUBLIC_DATA_CACHE_TAGS.all, PUBLIC_DATA_CACHE_TAGS.about],
}));

/**
 * Composed under React `cache()` from two top-level persisted reads. Not an
 * `unstable_cache` of its own: Next bypasses an `unstable_cache` called from
 * inside another, which made the contributor profile read miss here.
 */
export const getPublicAboutData = cache(async (): Promise<PublicAboutData> => {
  const about = await getPublicAboutConfig();
  const keys = about?.founderProfileKeys ?? [];
  const identities = keys.length ? await getPublicContributorIdentities() : [];
  const founderProfiles = (await Promise.all(keys.map((profileKey) => {
    const key = profileKey.trim().toUpperCase();
    return identities.some((profile) => profile.key === key) ? getPublicContributorByKey(key) : null;
  }))).filter((profile): profile is NormalizedUserProfile => profile !== null);

  return {
    subtitle: about?.aboutSubtitle?.trim() ?? "",
    markdown: about?.aboutMarkdown?.trim() ?? "",
    founderProfiles,
    updatedAt: about?.updatedAt ?? null,
  };
});
