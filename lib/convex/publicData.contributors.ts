import "server-only";

import { cache } from "react";
import {
  findProfileByAuthorNameInList,
  normalizeProfileKey,
  type NormalizedUserProfile,
} from "../../src/data/userProfiles";
import { queryConvex } from "./serverClient";
import { getServerConvexAdminKey } from "./serverWriteHealth";
import type { TripReportDetailRecord, TripReportRecord } from "./publicData.shared";

export const resolveContributorProfile = (
  profiles: readonly NormalizedUserProfile[],
  authorName: string,
) => findProfileByAuthorNameInList(profiles, authorName);

export const collapseContributorProfiles = (
  profiles: readonly NormalizedUserProfile[],
): NormalizedUserProfile[] => {
  const aliasKeys = new Set(
    profiles.flatMap((profile) => profile.aliases.map((alias) => normalizeProfileKey(alias))),
  );

  return profiles.filter((profile) => !aliasKeys.has(profile.key));
};

export const withResolvedReportProfile = <T extends TripReportRecord | TripReportDetailRecord>(
  report: T,
  profiles: readonly NormalizedUserProfile[],
): T => {
  const matchedProfile = resolveContributorProfile(profiles, report.subject.name);

  if (!matchedProfile) {
    return report;
  }

  return {
    ...report,
    subject: {
      ...report.subject,
      profile_key: matchedProfile.key,
      avatar_url: report.subject.avatar_url ?? matchedProfile.avatarUrl ?? undefined,
    },
  };
};

export const getPublicContributorProfiles = cache(async (): Promise<NormalizedUserProfile[]> => {
  const profiles = await queryConvex<NormalizedUserProfile[]>("contributorProfiles:getAll", {});
  return collapseContributorProfiles(profiles);
});

export const getPublicContributorKeys = cache(async (): Promise<string[]> => {
  return (await getPublicContributorProfiles()).map((profile) => profile.key);
});

export const getPublicContributorByKey = cache(async (key: string): Promise<NormalizedUserProfile | null> => {
  const profiles = await getPublicContributorProfiles();
  const normalizedKey = normalizeProfileKey(key);
  if (!normalizedKey) {
    return null;
  }

  const exactMatch = profiles.find((profile) => profile.key === normalizedKey);
  if (exactMatch) {
    return exactMatch;
  }

  const aliasMatch = profiles.find((profile) => profile.aliases.includes(normalizedKey.toLowerCase()));
  return aliasMatch ?? null;
});

export const getOwnedContributorProfile = cache(async (email: string): Promise<NormalizedUserProfile | null> => {
  const apiKey = getServerConvexAdminKey();
  if (!apiKey) {
    return null;
  }

  return await queryConvex<NormalizedUserProfile | null, { apiKey: string; email: string }>(
    "contributorProfiles:getOwnedProfile",
    { apiKey, email },
  );
});
