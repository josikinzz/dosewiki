import {
  materializeContributorProfile,
  sanitizeContributorAvatarUrl,
} from "../../lib/contributorProfileIdentity";
import { normalizeOrderSlugs } from "./contributorProfileOrdering";
import type { PublicProfile, StoredProfile } from "./contributorProfiles";
import { isValidR2Key, replicationMediaBaseUrl } from "./replicationUrls";

type StorageCtx = {
  storage: {
    getUrl: (storageId: string) => Promise<string | null>;
  };
};

export async function materializeProfile(
  ctx: StorageCtx,
  profile: StoredProfile,
): Promise<PublicProfile> {
  let resolvedAvatarUrl = sanitizeContributorAvatarUrl(profile.avatarUrl);

  const r2BaseUrl = replicationMediaBaseUrl();
  if (r2BaseUrl && isValidR2Key(profile.avatarR2Key)) {
    resolvedAvatarUrl = `${r2BaseUrl}/${profile.avatarR2Key}`;
  } else if (profile.avatarStorageId) {
    resolvedAvatarUrl = (await ctx.storage.getUrl(profile.avatarStorageId)) ?? resolvedAvatarUrl;
  }

  return {
    ...(materializeContributorProfile({
      key: profile.key,
      displayName: profile.displayName,
      aliases: profile.aliases,
      avatarUrl: resolvedAvatarUrl,
      bio: profile.bio,
      links: profile.links,
      role: profile.role,
    }) ?? {
      key: "CONTRIBUTOR",
      displayName: "Contributor",
      aliases: [],
      avatarUrl: null,
      bio: "",
      links: [],
      hasCustomBio: false,
    }),
    avatarUrl: resolvedAvatarUrl ?? null,
    // Read-side passthrough only. Consumers still own the merge: listed slugs
    // first in this order, everything else after in the default sort, and any
    // slug that no longer matches an item is simply not found and ignored.
    replicationOrder: normalizeOrderSlugs(profile.replicationOrder),
    reportOrder: normalizeOrderSlugs(profile.reportOrder),
    // Passthrough of the gallery opt-out; spread so an included profile's
    // public projection carries no key at all rather than an explicit false.
    ...(profile.exclude_from_gallery === true ? { exclude_from_gallery: true } : {}),
    ...(profile.archival === true ? { archival: true } : {}),
    ...(profile.approved_replicator === true ? { approved_replicator: true } : {}),
    // Passthrough of the staff commentary; spread so an absent note stays a
    // missing key rather than an explicit null.
    ...(profile.staffNote?.markdown ? { staffNote: profile.staffNote } : {}),
  };
}
