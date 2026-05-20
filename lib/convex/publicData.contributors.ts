import "server-only";

import { cache } from "react";
import type { NormalizedUserProfile } from "../../src/data/userProfiles";
import { findContributorProfileByKeyOrAlias, normalizeProfileKey } from "../contributorProfileIdentity";
import { getPublicDataReadAdapter } from "./publicData.reads";
import { queryConvex } from "./serverClient";
import { getServerConvexAdminKey } from "./serverWriteHealth";
import type { TripReportDetailRecord, TripReportRecord } from "./publicData.shared";
import {
  collapseContributorProfiles,
  projectPublicReportDetail,
  resolveReportContributorProfile,
} from "./publicData.reportProfileProjection";

export { collapseContributorProfiles };

export const resolveContributorProfile = resolveReportContributorProfile;

export const withResolvedReportProfile = <T extends TripReportRecord | TripReportDetailRecord>(
  report: T,
  profiles: readonly NormalizedUserProfile[],
): T => projectPublicReportDetail(report, profiles);

export const getPublicContributorProfiles = cache(async (): Promise<NormalizedUserProfile[]> => {
  const profiles = await getPublicDataReadAdapter().getPublicContributorProfiles();
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

  return findContributorProfileByKeyOrAlias(profiles, normalizedKey);
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
