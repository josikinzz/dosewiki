import { v } from "../lib/postgres/runtime/values";
import { query } from "../lib/postgres/runtime/server";
import { isValidR2Key, replicationMediaBaseUrl } from "./lib/replicationUrls";

const MAX_AVATAR_HISTORY_READ = 50;

const publicIdentityPartyValidator = v.object({
  display_name: v.string(),
  profile_key: v.union(v.string(), v.null()),
});
const publicAttributionValidator = v.object({
  poster: v.object({
    ...publicIdentityPartyValidator.fields,
    profile_url: v.union(v.string(), v.null()),
    platform: v.union(v.string(), v.null()),
    posted_at: v.union(v.number(), v.null()),
  }),
  creator: publicIdentityPartyValidator,
  proven_different_creator: v.boolean(),
});
const publicProfileIdentityValidator = v.object({
  canonical_key: v.string(),
  aliases: v.array(v.string()),
  avatar_url: v.union(v.string(), v.null()),
  verified_replicator: v.boolean(),
});

type AttributionForPublicProjection = {
  poster_display_name: string;
  poster_profile_id?: string;
  poster_profile_url?: string;
  poster_platform?: string;
  poster_posted_at?: number;
  creator_display_name: string;
  creator_profile_id?: string;
  creator_determination: "poster-presumed-creator" | "proven-different-creator" | "unresolved";
  review_status: "not-reviewed" | "reviewed-no-obvious-conflict" | "obvious-conflict-needs-research" | "creator-proven";
  evidence: Array<{
    kind: string;
    reference_url?: string;
    published_at?: number;
    supports_source_digest?: string;
  }>;
  source_digest: string;
};

/**
 * Fail closed when projecting creator changes. A malformed, unresolved, or
 * incomplete row is presented as poster-as-creator and never as a repost hint.
 */
export function hasPublicDifferentCreatorProof(value: AttributionForPublicProjection) {
  if (
    value.creator_determination !== "proven-different-creator" ||
    value.review_status !== "creator-proven" ||
    value.poster_posted_at === undefined ||
    value.creator_display_name.trim() === value.poster_display_name.trim() ||
    value.creator_profile_id === value.poster_profile_id
  ) {
    return false;
  }
  return value.evidence.some((item) =>
    (item.kind === "explicit-credit" || item.kind === "earlier-exact-source") &&
    typeof item.reference_url === "string" &&
    typeof item.published_at === "number" &&
    item.published_at < value.poster_posted_at &&
    item.supports_source_digest === value.source_digest
  );
}

/** One indexed public attribution read for a replication permalink. */
export const getAttributionByReplicationId = query({
  args: { replication_id: v.id("replications") },
  returns: v.union(publicAttributionValidator, v.null()),
  handler: async (ctx, args) => {
    const attribution = await ctx.db
      .query("replicationIdentityAttributions")
      .withIndex("by_replication_id", (q) => q.eq("replication_id", args.replication_id))
      .unique();
    if (!attribution) return null;

    const posterProfile = attribution.poster_profile_id
      ? await ctx.db.get(attribution.poster_profile_id)
      : null;
    const provenDifferentCreator = hasPublicDifferentCreatorProof(attribution);
    const creatorProfile = provenDifferentCreator && attribution.creator_profile_id
      ? await ctx.db.get(attribution.creator_profile_id)
      : posterProfile;

    return {
      poster: {
        display_name: attribution.poster_display_name,
        profile_key: posterProfile?.key ?? null,
        profile_url: attribution.poster_profile_url ?? null,
        platform: attribution.poster_platform ?? null,
        posted_at: attribution.poster_posted_at ?? null,
      },
      creator: {
        display_name: provenDifferentCreator
          ? attribution.creator_display_name
          : attribution.poster_display_name,
        profile_key: creatorProfile?.key ?? null,
      },
      proven_different_creator: provenDifferentCreator,
    };
  },
});

/**
 * One indexed public profile read. Aliases come from contributorProfiles so
 * canonical search and redirects keep their existing single source of truth.
 */
export const getProfileIdentityByKey = query({
  args: { key: v.string() },
  returns: v.union(publicProfileIdentityValidator, v.null()),
  handler: async (ctx, args) => {
    const normalizedKey = args.key.trim().toUpperCase();
    if (!normalizedKey) return null;
    const profile = await ctx.db
      .query("contributorProfiles")
      .withIndex("by_key", (q) => q.eq("key", normalizedKey))
      .unique();
    if (!profile) return null;

    const [verification, avatarRows] = await Promise.all([
      ctx.db
        .query("contributorReplicatorVerifications")
        .withIndex("by_profile_id", (q) => q.eq("profile_id", profile._id))
        .unique(),
      ctx.db
        .query("contributorAvatarHistory")
        .withIndex("by_profile_id_and_recorded_at", (q) => q.eq("profile_id", profile._id))
        .order("desc")
        .take(MAX_AVATAR_HISTORY_READ),
    ]);

    const deliveredAvatar = avatarRows.find((row) =>
      row.delivery_verification === "verified" &&
      row.delivery_verified_at !== undefined &&
      row.delivery_receipt !== undefined &&
      row.delivery_receipt.content_sha256 === row.media_digest &&
      (row.public_url !== undefined || row.r2_key !== undefined || row.storage_id !== undefined)
    );
    let avatarUrl: string | null = null;
    if (deliveredAvatar?.public_url) {
      avatarUrl = deliveredAvatar.public_url;
    } else if (deliveredAvatar?.r2_key) {
      const base = replicationMediaBaseUrl();
      avatarUrl = base && isValidR2Key(deliveredAvatar.r2_key)
        ? `${base}/${deliveredAvatar.r2_key}`
        : null;
    } else if (deliveredAvatar?.storage_id) {
      avatarUrl = await ctx.storage.getUrl(deliveredAvatar.storage_id);
    }

    return {
      canonical_key: profile.key,
      aliases: profile.aliases,
      avatar_url: avatarUrl,
      verified_replicator: verification?.status === "verified",
    };
  },
});
