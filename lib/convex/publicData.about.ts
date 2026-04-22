import "server-only";

import { cache } from "react";
import type { NormalizedUserProfile } from "../../src/data/userProfiles";
import { getPublicContributorProfiles } from "./publicData.contributors";
import { queryConvex } from "./serverClient";
import type { AboutConfigRecord, PublicAboutData } from "./publicData.shared";

export const getPublicAboutData = cache(async (): Promise<PublicAboutData> => {
  const about = await queryConvex<AboutConfigRecord | null>("siteConfig:getAbout", {});
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
