import "server-only";

import { publicDataCache } from "./publicData.cache"
import { cache } from "react";
import type { NormalizedUserProfile } from "../../src/data/userProfiles";
import { PUBLIC_CONVEX_CACHE_REVALIDATE_SECONDS, PUBLIC_CONVEX_CACHE_TAGS } from "./publicData.cache";
import { getPublicContributorProfiles } from "./publicData.contributors";
import { getPublicDataReadAdapter } from "./publicData.reads";
import type { PublicAboutData } from "./publicData.shared";

/** The About config document, a leaf read persisted at the top level. */
const getPublicAboutConfig = cache(publicDataCache(async () => {
  return await getPublicDataReadAdapter().getPublicAboutConfig();
}, ["convex-public-about-config-v1"], {
  revalidate: PUBLIC_CONVEX_CACHE_REVALIDATE_SECONDS,
  tags: [PUBLIC_CONVEX_CACHE_TAGS.all, PUBLIC_CONVEX_CACHE_TAGS.about],
}));

/**
 * Composed under React `cache()` from two top-level persisted reads. Not an
 * `unstable_cache` of its own: Next bypasses an `unstable_cache` called from
 * inside another, which made the contributor profile read miss here.
 */
export const getPublicAboutData = cache(async (): Promise<PublicAboutData> => {
  const [about, allProfiles] = await Promise.all([
    getPublicAboutConfig(),
    getPublicContributorProfiles(),
  ]);
  const founderProfiles = (about?.founderProfileKeys ?? [])
    .map((profileKey) => allProfiles.find((profile) => profile.key === profileKey.trim().toUpperCase()) ?? null)
    .filter((profile): profile is NormalizedUserProfile => profile !== null);

  return {
    subtitle: about?.aboutSubtitle?.trim() ?? "",
    markdown: about?.aboutMarkdown?.trim() ?? "",
    founderProfiles,
    updatedAt: about?.updatedAt ?? null,
  };
});
