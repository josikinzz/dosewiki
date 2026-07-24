import "server-only";

import { unstable_cache } from "next/cache";
import { cache } from "react";
import type { NormalizedUserProfile } from "../../src/data/userProfiles";
import { PUBLIC_CONVEX_CACHE_REVALIDATE_SECONDS, PUBLIC_CONVEX_CACHE_TAGS } from "./publicData.cache";
import { getPublicContributorProfiles } from "./publicData.contributors";
import { getPublicDataReadAdapter } from "./publicData.reads";
import type { PublicAboutData } from "./publicData.shared";

export const getPublicAboutData = cache(unstable_cache(async (): Promise<PublicAboutData> => {
  const about = await getPublicDataReadAdapter().getPublicAboutConfig();
  const allProfiles = await getPublicContributorProfiles();
  const founderProfiles = (about?.founderProfileKeys ?? [])
    .map((profileKey) => allProfiles.find((profile) => profile.key === profileKey.trim().toUpperCase()) ?? null)
    .filter((profile): profile is NormalizedUserProfile => profile !== null);

  return {
    subtitle: about?.aboutSubtitle?.trim() ?? "",
    markdown: about?.aboutMarkdown?.trim() ?? "",
    founderProfiles,
    updatedAt: about?.updatedAt ?? null,
  };
}, ["convex-public-about-data"], {
  revalidate: PUBLIC_CONVEX_CACHE_REVALIDATE_SECONDS,
  tags: [PUBLIC_CONVEX_CACHE_TAGS.all, PUBLIC_CONVEX_CACHE_TAGS.about, PUBLIC_CONVEX_CACHE_TAGS.contributors],
}));
