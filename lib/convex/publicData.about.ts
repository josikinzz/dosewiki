import "server-only";

import { cache } from "react";
import type { NormalizedUserProfile } from "../../src/data/userProfiles";
import { getPublicContributorProfiles } from "./publicData.contributors";
import { getPublicDataReadAdapter } from "./publicData.reads";
import type { PublicAboutData } from "./publicData.shared";

export const getPublicAboutData = cache(async (): Promise<PublicAboutData> => {
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
});
