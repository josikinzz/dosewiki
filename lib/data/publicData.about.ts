import "server-only";

import { publicDataCache, PUBLIC_DATA_CACHE_REVALIDATE_SECONDS } from "./publicData.cache";
import { PUBLIC_DATA_CACHE_TAGS } from "./publicData.cacheTags";
import { cache } from "react";
import type { NormalizedUserProfile } from "../../src/data/userProfiles";
import { getPublicContributorByKey, getPublicContributorIdentities } from "./publicData.contributors";
import { getPublicDataReadAdapter } from "./publicData.reads";
import type { PublicAboutData } from "./publicData.shared";
import {
  projectTranslationCredits,
  translationCreditsFor,
  type PublicTranslationCredit,
} from "../../src/data/content/translationCredits";

const getPublicAboutConfig = cache(publicDataCache(async () => {
  return await getPublicDataReadAdapter().getPublicAboutConfig();
}, ["data-public-about-config-v1"], {
  revalidate: PUBLIC_DATA_CACHE_REVALIDATE_SECONDS,
  tags: [PUBLIC_DATA_CACHE_TAGS.all, PUBLIC_DATA_CACHE_TAGS.about],
}));

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

export const getPublicTranslationCredits = cache(async (locale: string): Promise<PublicTranslationCredit[]> => {
  const about = await getPublicAboutConfig();
  const credits = translationCreditsFor(about?.translationCredits, locale);
  if (!credits.length) return [];
  const profiles = await Promise.all(credits.map((credit) => getPublicContributorByKey(credit.profileKey)));
  const byKey = new Map(
    profiles.flatMap((profile, index) => (profile ? [[credits[index].profileKey, profile] as const] : [])),
  );
  return projectTranslationCredits(credits, (key) => byKey.get(key) ?? null);
});
