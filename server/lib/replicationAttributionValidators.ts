import { type Infer, v } from "../../lib/postgres/runtime/values"

export const redditPosterStateValidator = v.union(
  v.literal("named"),
  v.literal("deleted"),
  v.literal("multiple"),
  v.literal("unavailable"),
);

export const attributionDispositionValidator = v.union(
  v.literal("poster-as-artist-default"),
  v.literal("reviewed-creator-override"),
  v.literal("multiple-posters-require-review"),
  v.literal("unknown-no-named-poster"),
);

export const redditPosterValidator = v.object({
  display_name: v.optional(v.string()),
  normalized_name: v.optional(v.string()),
  profile_url: v.optional(v.string()),
  state: redditPosterStateValidator,
  source_role: v.literal("submitter"),
});

export const redditSourceReferenceValidator = v.object({
  reference_id: v.string(),
  post_id: v.string(),
  post_url: v.string(),
  poster_display_name: v.optional(v.string()),
  poster_profile_url: v.optional(v.string()),
  source_url: v.optional(v.string()),
  role: v.optional(v.string()),
});

export const reviewedCreatorOverrideValidator = v.object({
  creator_name: v.string(),
  creator_kind: v.string(),
  decision: v.literal("verified"),
  evidence_digest: v.string(),
});

/**
 * Cold provenance record for one replication.
 *
 * This intentionally lives outside the hot `replications` gallery document:
 * a work can have many Reddit posts and submitters, and gallery pagination does
 * not need to repeatedly serialize that audit trail.
 */
export const replicationSourceAttribution = v.object({
  replication_id: v.id("replications"),
  source_catalog_id: v.string(),
  source_sha256: v.string(),
  reddit_post_ids: v.array(v.string()),
  poster: redditPosterValidator,
  source_references: v.array(redditSourceReferenceValidator),
  disposition: attributionDispositionValidator,
  proposed_artist: v.string(),
  reviewed_creator_override: v.optional(reviewedCreatorOverrideValidator),
  review_required: v.boolean(),
  source_digest: v.string(),
  operation_id: v.string(),
  updated_at: v.number(),
});

export const attributionExpectedReplicationValidator = v.object({
  id: v.id("replications"),
  slug: v.string(),
  artist: v.string(),
  artist_url: v.union(v.string(), v.null()),
  credit_line: v.union(v.string(), v.null()),
  rightsholder: v.union(v.string(), v.null()),
  source_catalog_id: v.string(),
  source_sha256: v.string(),
});

export const attributionIntendedCreditValidator = v.object({
  artist: v.string(),
  artist_url: v.union(v.string(), v.null()),
  credit_line: v.string(),
  rightsholder: v.union(v.string(), v.null()),
});

export const attributionRollbackUpdateValidator = v.object({
  expected_current: attributionExpectedReplicationValidator,
  rollback_credit: v.object({
    artist: v.string(),
    artist_url: v.union(v.string(), v.null()),
    credit_line: v.union(v.string(), v.null()),
    rightsholder: v.union(v.string(), v.null()),
  }),
  source_digest: v.string(),
  expected_attribution_operation_id: v.string(),
});

export const attributionBatchUpdateValidator = v.object({
  expected: attributionExpectedReplicationValidator,
  intended_credit: attributionIntendedCreditValidator,
  attribution: v.object({
    reddit_post_ids: v.array(v.string()),
    poster: redditPosterValidator,
    source_references: v.array(redditSourceReferenceValidator),
    disposition: attributionDispositionValidator,
    proposed_artist: v.string(),
    reviewed_creator_override: v.optional(reviewedCreatorOverrideValidator),
    review_required: v.boolean(),
    source_digest: v.string(),
  }),
});

export type AttributionBatchUpdate = Infer<typeof attributionBatchUpdateValidator>;
export type AttributionRollbackUpdate = Infer<typeof attributionRollbackUpdateValidator>;
