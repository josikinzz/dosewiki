import "server-only";

import { unstable_cache } from "next/cache";
import { cache } from "react";
import type { NormalizedUserProfile } from "../../src/data/userProfiles";
import { dropAliasDuplicateProfiles } from "../../src/data/contributorRoster";
import { PUBLIC_CONVEX_CACHE_REVALIDATE_SECONDS, PUBLIC_CONVEX_CACHE_TAGS } from "./publicData.cache";
import { findContributorProfileByKeyOrAlias, normalizeProfileKey } from "../contributorProfileIdentity";
import type { ContributorDirectory } from "../contributorDirectory";
import { getPublicDataReadAdapter } from "./publicData.reads";
import { queryConvex } from "./serverClient";
import { getServerConvexAdminIntentToken } from "./serverWriteHealth";
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

export const getPublicContributorProfiles = cache(unstable_cache(async (): Promise<NormalizedUserProfile[]> => {
  const profiles = await getPublicDataReadAdapter().getPublicContributorProfiles();
  return collapseContributorProfiles(profiles);
}, ["convex-public-contributor-profiles"], {
  revalidate: PUBLIC_CONVEX_CACHE_REVALIDATE_SECONDS,
  tags: [PUBLIC_CONVEX_CACHE_TAGS.all, PUBLIC_CONVEX_CACHE_TAGS.contributors],
}));

/**
 * Every public contributor profile, for the About page's contributor roster.
 *
 * Deliberately not `getPublicContributorProfiles`: that read applies
 * `collapseContributorProfiles`, which currently mistakes a profile's own self-alias for an
 * alias-duplicate row and removes almost the whole table. `dropAliasDuplicateProfiles` does the
 * de-duplication the roster actually wants. The shared read keeps its behaviour because
 * dose.wiki's curated founder list and the report author projection both depend on it.
 *
 * Only reached on the Effect Index build, so the second read of this ~26-row table costs one
 * cached Convex query per build and nothing on dose.wiki.
 */
export const getPublicContributorRosterProfiles = cache(unstable_cache(async (): Promise<NormalizedUserProfile[]> => {
  const profiles = await getPublicDataReadAdapter().getPublicContributorProfiles();
  return dropAliasDuplicateProfiles(profiles);
}, ["convex-public-contributor-roster-profiles"], {
  revalidate: PUBLIC_CONVEX_CACHE_REVALIDATE_SECONDS,
  tags: [PUBLIC_CONVEX_CACHE_TAGS.all, PUBLIC_CONVEX_CACHE_TAGS.contributors],
}));

export const getPublicContributorKeys = cache(async (): Promise<string[]> => {
  return (await getPublicContributorProfiles()).map((profile) => profile.key);
});

export const getPublicContributorDirectory = cache(async (): Promise<ContributorDirectory> => {
  const profiles = await getPublicContributorProfiles();
  return profiles.map((profile) => ({
    key: profile.key,
    displayName: profile.displayName,
    aliases: profile.aliases,
  }));
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
  const apiKey = getServerConvexAdminIntentToken("profileMediaWrite");
  if (!apiKey) {
    return null;
  }

  return await queryConvex<NormalizedUserProfile | null, { apiKey: string; email: string }>(
    "contributorProfiles:getOwnedProfile",
    { apiKey, email },
  );
});
