import { type Infer, v } from "../../lib/postgres/runtime/values"

export const contributorProfileMergeTableValidator = v.union(
  v.literal("contributorProfiles"),
  v.literal("replicationIdentityAttributions"),
  v.literal("contributorAliasEvidence"),
  v.literal("contributorAvatarHistory"),
  v.literal("contributorReplicatorVerifications"),
  v.literal("replicationIdentityProfileBindings"),
  v.literal("tripReports"),
);

export const contributorProfileMergeOperationValidator = v.object({
  operation_id: v.string(), payload_digest: v.string(),
  source_profile_id: v.id("contributorProfiles"), source_key: v.string(),
  target_profile_id: v.id("contributorProfiles"), target_key: v.string(),
  pinned_snapshot_digest: v.string(), pinned_snapshot_profile_count: v.number(),
  expected_state_digest: v.string(), applied_state_digest: v.string(),
  actor_email: v.string(), item_count: v.number(),
  status: v.union(v.literal("applied"), v.literal("rolled-back")),
  rollback_operation_id: v.optional(v.string()), created_at: v.number(),
  rolled_back_at: v.optional(v.number()),
});

export const contributorProfileMergeItemValidator = v.object({
  operation_id: v.string(), ordinal: v.number(), table: contributorProfileMergeTableValidator,
  row_id: v.string(), before: v.any(), after: v.any(), created_at: v.number(),
});

export const contributorProfileMergeInputValidator = v.object({
  source_profile_id: v.id("contributorProfiles"), source_key: v.string(),
  target_profile_id: v.id("contributorProfiles"), target_key: v.string(),
  pinned_snapshot_digest: v.string(), pinned_snapshot_profile_count: v.number(),
  expected_state_digest: v.string(), applied_at: v.number(),
});

export type ContributorProfileMergeTable = Infer<typeof contributorProfileMergeTableValidator>;
export type ContributorProfileMergeInput = Infer<typeof contributorProfileMergeInputValidator>;
