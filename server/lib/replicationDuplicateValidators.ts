import { type Infer, v } from "../../lib/postgres/runtime/values"
import { redditSourceReferenceValidator } from "./replicationAttributionValidators";

export const duplicatePublicationStateValidator = v.union(
  v.literal("published"),
  v.literal("duplicate-suppressed"),
);

export const duplicateKeeperPolicyValidator = v.union(
  v.literal("original-collection-default"),
  v.literal("measured-quality-exception-reddit-version"),
);

export const duplicateExpectedReplicationValidator = v.object({
  id: v.id("replications"),
  slug: v.string(),
  artist: v.string(),
  source_catalog_id: v.union(v.string(), v.null()),
  source_sha256: v.union(v.string(), v.null()),
  publication_state: v.union(duplicatePublicationStateValidator, v.null()),
  duplicate_of_replication_id: v.union(v.id("replications"), v.null()),
});

export const duplicateReconciliationValidator = v.object({
  component_id: v.string(),
  evidence_digest: v.string(),
  classification: v.literal("same-work-confirmed-prior-multi-method-review"),
  keeper_policy: duplicateKeeperPolicyValidator,
  reddit_post_ids: v.array(v.string()),
  source_references: v.array(redditSourceReferenceValidator),
});

export const duplicateSuppressionUpdateValidator = v.object({
  expected_keeper: duplicateExpectedReplicationValidator,
  expected_suppressed: duplicateExpectedReplicationValidator,
  reconciliation: duplicateReconciliationValidator,
});

export const duplicateSuppressionArgs = v.object({
  apiKey: v.string(),
  operation_id: v.string(),
  dry_run: v.boolean(),
  updates: v.array(duplicateSuppressionUpdateValidator),
});

export const duplicateSuppressionResult = v.object({
  operation_id: v.string(),
  dry_run: v.boolean(),
  suppressed: v.number(),
  unchanged: v.number(),
  rows: v.array(v.object({
    component_id: v.string(),
    keeper_id: v.id("replications"),
    suppressed_id: v.id("replications"),
    action: v.union(
      v.literal("would-suppress"),
      v.literal("suppressed"),
      v.literal("unchanged"),
    ),
  })),
});

export const duplicateRollbackUpdateValidator = v.object({
  component_id: v.string(),
  keeper_id: v.id("replications"),
  suppressed_id: v.id("replications"),
  evidence_digest: v.string(),
});

export const duplicateRollbackArgs = v.object({
  apiKey: v.string(),
  operation_id: v.string(),
  dry_run: v.boolean(),
  updates: v.array(duplicateRollbackUpdateValidator),
});

export const duplicateRollbackResult = v.object({
  operation_id: v.string(),
  dry_run: v.boolean(),
  restored: v.number(),
  unchanged: v.number(),
  rows: v.array(v.object({
    component_id: v.string(),
    suppressed_id: v.id("replications"),
    action: v.union(
      v.literal("would-restore"),
      v.literal("restored"),
      v.literal("unchanged"),
    ),
  })),
});

export const replicationDuplicateReconciliation = v.object({
  component_id: v.string(),
  keeper_replication_id: v.id("replications"),
  suppressed_replication_id: v.id("replications"),
  evidence_digest: v.string(),
  classification: v.literal("same-work-confirmed-prior-multi-method-review"),
  keeper_policy: duplicateKeeperPolicyValidator,
  reddit_post_ids: v.array(v.string()),
  source_references: v.array(redditSourceReferenceValidator),
  state: v.union(v.literal("active"), v.literal("rolled-back")),
  operation_id: v.string(),
  rollback_operation_id: v.optional(v.string()),
  created_at: v.number(),
  updated_at: v.number(),
});

export const storedDuplicateReconciliation = v.object({
  _id: v.id("replicationDuplicateReconciliations"),
  _creationTime: v.number(),
  ...replicationDuplicateReconciliation.fields,
});

export type DuplicateSuppressionUpdate = Infer<typeof duplicateSuppressionUpdateValidator>;
export type DuplicateRollbackUpdate = Infer<typeof duplicateRollbackUpdateValidator>;
