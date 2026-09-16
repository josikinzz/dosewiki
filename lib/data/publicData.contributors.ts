import "server-only";

import { publicDataCache } from "./publicData.cache"
import { cache } from "react";
import type { NormalizedUserProfile } from "../../src/data/userProfiles";
import {
  PUBLIC_DATA_CACHE_REVALIDATE_SECONDS,
  PUBLIC_DATA_CACHE_TAGS,
} from "./publicData.cache";
import {
  findContributorProfileByKeyOrAlias,
  normalizeProfileKey,
} from "../contributorProfileIdentity";
import type { ContributorDirectory } from "../contributorDirectory";
import { getPublicDataReadAdapter } from "./publicData.reads";
import { queryData } from "./serverClient";
import { getServerDataAdminIntentToken } from "./serverWriteHealth";
import {
  collapseContributorProfiles,
  resolveReportContributorProfile,
} from "./publicData.reportProfileProjection";

export { collapseContributorProfiles };

export const resolveContributorProfile = resolveReportContributorProfile;



export const getPublicContributorProfiles = cache(
  publicDataCache(async (): Promise<NormalizedUserProfile[]> => {
    const profiles =
      await getPublicDataReadAdapter().getPublicContributorProfiles();
    return collapseContributorProfiles(profiles);
  },
  ["data-public-contributor-profiles"],
  {
    revalidate: PUBLIC_DATA_CACHE_REVALIDATE_SECONDS,
    tags: [
      PUBLIC_DATA_CACHE_TAGS.all,
      PUBLIC_DATA_CACHE_TAGS.contributors,
    ],
  },),
);

/** Identity-only profiles preserve shared alias and attribution rules without bios. */
export const getPublicContributorIdentities = cache(publicDataCache(
  async (): Promise<NormalizedUserProfile[]> =>
    collapseContributorProfiles(await getPublicDataReadAdapter().getPublicContributorIdentities()),
  ["data-public-contributor-identities"],
  {
    revalidate: PUBLIC_DATA_CACHE_REVALIDATE_SECONDS,
    tags: [PUBLIC_DATA_CACHE_TAGS.all, PUBLIC_DATA_CACHE_TAGS.contributors],
  },
));

/** Compact identities whose canonical keys or aliases claim one of the requested keys. */
export const getPublicContributorIdentitiesByLookupKeys = cache(publicDataCache(
  async (lookupKeys: string[]): Promise<NormalizedUserProfile[]> => {
    const normalizedKeys = [...new Set(lookupKeys.map(normalizeProfileKey).filter(Boolean))];
    if (normalizedKeys.length === 0) {
      return [];
    }
    const profiles = await queryData<NormalizedUserProfile[], { lookupKeys: string[] }>(
      "contributorProfiles:getPublicIdentities",
      { lookupKeys: normalizedKeys },
    );
    return collapseContributorProfiles(profiles);
  },
  ["data-public-contributor-identities-by-lookup-keys"],
  {
    revalidate: PUBLIC_DATA_CACHE_REVALIDATE_SECONDS,
    tags: [PUBLIC_DATA_CACHE_TAGS.all, PUBLIC_DATA_CACHE_TAGS.contributors],
  },
));

export const getPublicContributorDirectory = cache(
  async (): Promise<ContributorDirectory> => {
    const profiles = await getPublicContributorIdentities();
    return profiles.map((profile) => ({
      key: profile.key,
      displayName: profile.displayName,
      aliases: profile.aliases,
      avatarUrl: profile.avatarUrl,
      // Threaded so the gallery can star and lift approved artists' rails.
      ...(profile.approved_replicator === true ? { approvedReplicator: true } : {}),
    }));
  },
);

export const getPublicContributorByKey = cache(
  async (key: string): Promise<NormalizedUserProfile | null> => {
    const normalizedKey = normalizeProfileKey(key);
    if (!normalizedKey) {
      return null;
    }
    const profiles = await getPublicContributorIdentities();

    const identity = findContributorProfileByKeyOrAlias(profiles, normalizedKey);
    return identity ? getPublicContributorDetail(identity.key) : null;
  },
);

const getPublicContributorDetail = cache(publicDataCache(
  async (key: string) => getPublicDataReadAdapter().getPublicContributorByKey(key),
  ["data-public-contributor-by-key"],
  {
    revalidate: PUBLIC_DATA_CACHE_REVALIDATE_SECONDS,
    tags: [PUBLIC_DATA_CACHE_TAGS.all, PUBLIC_DATA_CACHE_TAGS.contributors],
  },
));

export const getOwnedContributorProfile = cache(
  async (email: string): Promise<NormalizedUserProfile | null> => {
    const apiKey = getServerDataAdminIntentToken("profileMediaWrite");
    if (!apiKey) {
      return null;
    }

    return await queryData<
      NormalizedUserProfile | null,
      { apiKey: string; email: string }
    >("contributorProfiles:getOwnedProfile", { apiKey, email });
  },
);

/** Minimal authenticated ownership lookup for route shells that need only a key. */
export const getOwnedContributorProfileKey = cache(
  async (email: string): Promise<string | null> => {
    const apiKey = getServerDataAdminIntentToken("profileMediaWrite");
    if (!apiKey) {
      return null;
    }
    return await queryData<string | null, { apiKey: string; email: string }>(
      "contributorProfiles:getOwnedProfileKey",
      { apiKey, email },
    );
  },
);
