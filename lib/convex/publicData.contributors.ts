import "server-only";

import { unstable_cache } from "next/cache";
import { cache } from "react";
import type { NormalizedUserProfile } from "../../src/data/userProfiles";
import {
  PUBLIC_CONVEX_CACHE_REVALIDATE_SECONDS,
  PUBLIC_CONVEX_CACHE_TAGS,
} from "./publicData.cache";
import {
  findContributorProfileByKeyOrAlias,
  normalizeProfileKey,
} from "../contributorProfileIdentity";
import type { ContributorDirectory } from "../contributorDirectory";
import { getPublicDataReadAdapter } from "./publicData.reads";
import { queryConvex } from "./serverClient";
import { getServerConvexAdminIntentToken } from "./serverWriteHealth";
import type {
  TripReportDetailRecord,
  TripReportRecord,
} from "./publicData.shared";
import {
  collapseContributorProfiles,
  projectPublicReportDetail,
  resolveReportContributorProfile,
} from "./publicData.reportProfileProjection";

export { collapseContributorProfiles };

export const resolveContributorProfile = resolveReportContributorProfile;

export const withResolvedReportProfile = <
  T extends TripReportRecord | TripReportDetailRecord,
>(
  report: T,
  profiles: readonly NormalizedUserProfile[],
): T => projectPublicReportDetail(report, profiles);

export const getPublicContributorProfiles = cache(
  unstable_cache(
    async (): Promise<NormalizedUserProfile[]> => {
      const profiles =
        await getPublicDataReadAdapter().getPublicContributorProfiles();
      return collapseContributorProfiles(profiles);
    },
    ["convex-public-contributor-profiles"],
    {
      revalidate: PUBLIC_CONVEX_CACHE_REVALIDATE_SECONDS,
      tags: [
        PUBLIC_CONVEX_CACHE_TAGS.all,
        PUBLIC_CONVEX_CACHE_TAGS.contributors,
      ],
    },
  ),
);

export const getPublicContributorDirectory = cache(
  async (): Promise<ContributorDirectory> => {
    const profiles = await getPublicContributorProfiles();
    return profiles.map((profile) => ({
      key: profile.key,
      displayName: profile.displayName,
      aliases: profile.aliases,
      // Threaded so the by-artist gallery can honour the contributor's curation
      // without reading profiles of its own; see `applyCuratedOrder`.
      replicationOrder: profile.replicationOrder,
      avatarUrl: profile.avatarUrl,
    }));
  },
);

export const getPublicContributorByKey = cache(
  async (key: string): Promise<NormalizedUserProfile | null> => {
    const profiles = await getPublicContributorProfiles();
    const normalizedKey = normalizeProfileKey(key);
    if (!normalizedKey) {
      return null;
    }

    return findContributorProfileByKeyOrAlias(profiles, normalizedKey);
  },
);

export const getOwnedContributorProfile = cache(
  async (email: string): Promise<NormalizedUserProfile | null> => {
    const apiKey = getServerConvexAdminIntentToken("profileMediaWrite");
    if (!apiKey) {
      return null;
    }

    return await queryConvex<
      NormalizedUserProfile | null,
      { apiKey: string; email: string }
    >("contributorProfiles:getOwnedProfile", { apiKey, email });
  },
);
