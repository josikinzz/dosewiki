import { type Infer, v } from "../../lib/postgres/runtime/values"

export const identityEvidenceKindValidator = v.union(
  v.literal("profile"), v.literal("source-post"), v.literal("explicit-credit"),
  v.literal("watermark"), v.literal("earlier-exact-source"), v.literal("editorial-review"),
);
export const identityEvidenceValidator = v.object({
  kind: identityEvidenceKindValidator, reference_url: v.optional(v.string()), published_at: v.optional(v.number()),
  note: v.optional(v.string()), digest: v.string(), supports_source_digest: v.optional(v.string()),
});

export const projectionKindValidator = v.union(
  v.literal("creator-attribution"), v.literal("replicator-verification"), v.literal("profile-alias"),
  v.literal("profile-avatar"), v.literal("social-asset"), v.literal("profile-binding"),
);
export const socialEntityKindValidator = v.union(
  v.literal("replications"), v.literal("contributors"), v.literal("effects"), v.literal("reports"),
);
const nullableString = v.union(v.string(), v.null());
const projectionSourceReference = v.object({
  reference_id: v.string(), post_id: v.string(), post_url: v.string(),
  poster_display_name: v.optional(v.string()), poster_profile_url: v.optional(v.string()),
  source_url: v.optional(v.string()), role: v.optional(v.string()),
});
const projectionSourceHistory = v.object({
  posterDisplayName: v.string(), posterProfileUrl: nullableString, sourcePostUrl: nullableString,
  sourceUrl: nullableString, sourceReferences: v.array(projectionSourceReference), sourceEraArtistDisplayName: v.string(),
});
export const creatorExpectedBeforeValidator = v.object({
  replicationId: v.string(), currentArtist: v.string(), attributionDisposition: nullableString,
  creditLine: nullableString, sourceHistory: projectionSourceHistory,
});
export const verificationExpectedBeforeValidator = v.object({
  profileKey: v.string(), displayName: v.string(), verificationStatus: v.string(), aliases: v.array(v.string()),
  profileLinks: v.array(v.object({ label: v.string(), url: v.string() })),
});
export const avatarExpectedBeforeValidator = v.object({
  currentAvatarSha256: nullableString, currentAvatarUrl: nullableString, currentAvatarProvenance: nullableString,
});
export const aliasExpectedBeforeValidator = v.object({
  currentState: v.string(), normalizedAliasOwners: v.union(v.number(), v.null()),
  collisionAuditProfileSnapshotCount: v.union(v.number(), v.null()),
  fullProductionProfileSetSha256: v.string(),
  sourceProfileCanonicalSha256: nullableString,
  targetProfileCanonicalSha256: nullableString,
});
const projectionCommon = {
  operationId: v.string(), action: v.string(), expectedBeforeSha256: v.string(), after: v.any(), evidence: v.any(),
  cas: v.object({
    comparison: v.literal("canonical-json-sha256"),
    expectedBeforeSha256: v.string(),
    onMismatch: v.literal("abort-without-write"),
  }),
};
export const projectionOperationValidator = v.union(
  v.object({ kind: v.literal("creator-attribution"), target: v.object({ replicationId: v.string(), slug: v.string() }), expectedBefore: creatorExpectedBeforeValidator, ...projectionCommon }),
  v.object({ kind: v.literal("replicator-verification"), target: v.object({ artistId: v.string(), profileKey: v.string() }), expectedBefore: verificationExpectedBeforeValidator, ...projectionCommon }),
  v.object({ kind: v.literal("profile-alias"), target: v.object({ profileKey: v.string(), alias: v.string() }), expectedBefore: aliasExpectedBeforeValidator, ...projectionCommon }),
  v.object({ kind: v.literal("profile-avatar"), target: v.object({ profileKey: v.string() }), expectedBefore: avatarExpectedBeforeValidator, ...projectionCommon }),
  v.object({ kind: v.literal("social-asset"), target: v.object({ entityType: socialEntityKindValidator, entityKey: v.string() }), expectedBefore: v.null(), ...projectionCommon }),
  v.object({ kind: v.literal("profile-binding"), target: v.object({ artistId: v.string(), profileKey: v.union(v.string(), v.null()) }), expectedBefore: v.any(), ...projectionCommon }),
);

export const replicationIdentityAttributionValidator = v.object({
  replication_id: v.id("replications"), poster_display_name: v.string(),
  poster_profile_id: v.optional(v.id("contributorProfiles")), poster_profile_url: v.optional(v.string()),
  poster_platform: v.optional(v.string()), poster_posted_at: v.optional(v.number()), creator_display_name: v.string(),
  creator_profile_id: v.optional(v.id("contributorProfiles")),
  creator_determination: v.union(v.literal("poster-presumed-creator"), v.literal("proven-different-creator"), v.literal("unresolved")),
  review_status: v.union(v.literal("not-reviewed"), v.literal("reviewed-no-obvious-conflict"), v.literal("obvious-conflict-needs-research"), v.literal("creator-proven")),
  evidence: v.array(identityEvidenceValidator), source_digest: v.string(), operation_id: v.string(), updated_at: v.number(),
});
export const contributorAliasEvidenceValidator = v.object({
  profile_id: v.id("contributorProfiles"), alias: v.string(), normalized_alias: v.string(), platform: v.optional(v.string()),
  first_seen_at: v.optional(v.number()), last_seen_at: v.optional(v.number()), evidence: v.array(identityEvidenceValidator),
  operation_id: v.string(), recorded_at: v.number(),
});
export const deliveryVerificationValidator = v.union(v.literal("pending"), v.literal("verified"), v.literal("failed"));
export const deliveryReceiptValidator = v.object({
  url: v.string(), content_sha256: v.string(), byte_size: v.number(), http_status: v.number(),
  verified_at: v.number(), verifier: v.string(), receipt_digest: v.string(),
});
export const contributorAvatarHistoryValidator = v.object({
  profile_id: v.id("contributorProfiles"), provenance: v.union(v.literal("profile-controlled"), v.literal("artwork-derived"), v.literal("untraced")),
  storage_id: v.optional(v.id("_storage")), r2_key: v.optional(v.string()), public_url: v.optional(v.string()),
  source_url: v.optional(v.string()), media_digest: v.string(), delivery_verification: deliveryVerificationValidator,
  delivery_verified_at: v.optional(v.number()), delivery_receipt: v.optional(deliveryReceiptValidator),
  evidence: v.array(identityEvidenceValidator), operation_id: v.string(), recorded_at: v.number(),
});
export const contributorReplicatorVerificationValidator = v.object({
  profile_id: v.id("contributorProfiles"), status: v.union(v.literal("verified"), v.literal("not-verified"), v.literal("unclear")),
  basis: v.union(v.literal("artist-sheet-review"), v.literal("explicit-self-identification"), v.literal("editorial-review")),
  work_count_reviewed: v.number(), rationale: v.string(), evidence: v.array(identityEvidenceValidator),
  source_digest: v.string(), operation_id: v.string(), reviewed_at: v.number(),
  review_contributions: v.optional(v.array(v.object({
    artist_id: v.string(), status: v.union(v.literal("verified"), v.literal("not-verified"), v.literal("unclear")),
    basis: v.union(v.literal("artist-sheet-review"), v.literal("explicit-self-identification"), v.literal("editorial-review")),
    work_count_reviewed: v.number(), rationale: v.string(), evidence: v.array(identityEvidenceValidator), source_digest: v.string(),
  }))),
});

export const replicationSocialAssetValidator = v.object({
  entity_kind: socialEntityKindValidator, entity_key: v.string(), replication_id: v.optional(v.id("replications")),
  variant: v.union(v.literal("open-graph"), v.literal("twitter-card")), storage_id: v.optional(v.id("_storage")),
  r2_key: v.optional(v.string()), public_url: v.optional(v.string()), width: v.number(), height: v.number(),
  mime_type: v.string(), media_digest: v.string(), source_digest: v.string(),
  status: v.union(v.literal("ready"), v.literal("held"), v.literal("failed")), delivery_verification: deliveryVerificationValidator,
  delivery_verified_at: v.optional(v.number()), delivery_receipt: v.optional(deliveryReceiptValidator),
  failure_reason: v.optional(v.string()), operation_id: v.string(), generated_at: v.number(),
});

export const replicationIdentityProfileBindingValidator = v.object({
  artist_id: v.string(), profile_id: v.id("contributorProfiles"), profile_key: v.string(),
  decision: v.union(v.literal("created-profile"), v.literal("bound-existing-profile")),
  snapshot_digest: v.string(), operation_id: v.string(), bound_at: v.number(),
});
export const profileBindingVerificationInputValidator = v.object({
  status: contributorReplicatorVerificationValidator.fields.status,
  basis: contributorReplicatorVerificationValidator.fields.basis,
  work_count_reviewed: v.number(), rationale: v.string(), evidence: v.array(identityEvidenceValidator), source_digest: v.string(),
});
export const profileBindingEntryValidator = v.object({
  kind: v.literal("profile-binding"), item_operation_id: v.string(), projection: projectionOperationValidator,
  base_projection_digest: v.string(), receipt_sidecar_digest: nullableString,
  artist_id: v.string(), decision: v.union(v.literal("create"), v.literal("bind"), v.literal("unresolved")),
  snapshot_digest: v.string(), snapshot_profile_count: v.number(),
  profile_key: v.optional(v.string()), existing_profile_id: v.optional(v.id("contributorProfiles")),
  profile: v.optional(v.object({ display_name: v.string(), aliases: v.array(v.string()), links: v.array(v.object({ label: v.string(), url: v.string() })) })),
  verification: v.optional(profileBindingVerificationInputValidator),
  shared_profile_group_digest: v.optional(v.string()),
  shared_profile_group_size: v.optional(v.number()),
});

export const identitySocialOperationKindValidator = v.union(
  v.literal("attribution"), v.literal("alias"), v.literal("avatar"), v.literal("verification"), v.literal("social-asset"), v.literal("profile-binding"),
);
export const identitySocialStoredValueValidator = v.union(
  replicationIdentityAttributionValidator, contributorAliasEvidenceValidator, contributorAvatarHistoryValidator,
  contributorReplicatorVerificationValidator, replicationSocialAssetValidator, replicationIdentityProfileBindingValidator,
);
export const identitySocialTargetValidator = v.union(
  v.object({ kind: v.literal("attribution"), replication_id: v.id("replications") }),
  v.object({ kind: v.literal("alias"), profile_id: v.id("contributorProfiles"), normalized_alias: v.string() }),
  v.object({ kind: v.literal("avatar"), profile_id: v.id("contributorProfiles"), media_digest: v.string() }),
  v.object({ kind: v.literal("verification"), profile_id: v.id("contributorProfiles") }),
  v.object({ kind: v.literal("social-asset"), entity_kind: socialEntityKindValidator, entity_key: v.string(), variant: v.union(v.literal("open-graph"), v.literal("twitter-card")) }),
  v.object({ kind: v.literal("profile-binding"), artist_id: v.string() }),
);
export const replicationIdentitySocialOperationValidator = v.object({
  operation_id: v.string(), kind: identitySocialOperationKindValidator, payload_digest: v.string(), actor_email: v.string(),
  record_count: v.number(), changed_count: v.number(), unchanged_count: v.number(), rollback_of: v.optional(v.string()), created_at: v.number(),
});
export const identitySocialProfileProjectionStateValidator = v.union(
  v.object({ kind: v.literal("alias-profile"), profile_id: v.id("contributorProfiles"), aliases: v.array(v.string()) }),
  v.object({
    kind: v.literal("avatar-profile"), profile_id: v.id("contributorProfiles"),
    avatarUrl: nullableString, avatarR2Key: nullableString, avatarStorageId: nullableString,
    avatarSha256: nullableString, avatarProvenance: nullableString,
  }),
);
export const replicationIdentitySocialOperationItemValidator = v.object({
  item_operation_id: v.string(), batch_operation_id: v.string(), kind: identitySocialOperationKindValidator,
  target: identitySocialTargetValidator, before: v.union(identitySocialStoredValueValidator, v.null()),
  after: v.union(identitySocialStoredValueValidator, v.null()), changed: v.boolean(), created_at: v.number(),
  profile_before: v.optional(identitySocialProfileProjectionStateValidator),
  profile_after: v.optional(identitySocialProfileProjectionStateValidator),
  created_profile_id: v.optional(v.id("contributorProfiles")),
  created_profile_snapshot: v.optional(v.any()),
  verification_before: v.optional(v.union(contributorReplicatorVerificationValidator, v.null())),
  verification_after: v.optional(v.union(contributorReplicatorVerificationValidator, v.null())),
  satisfied_item_operation_ids: v.optional(v.array(v.string())),
});
export const contributorIdentityTokenSnapshotValidator = v.object({
  snapshot_digest: v.string(), profile_count: v.number(), normalized_token: v.string(),
  owner_count: v.number(), owner_profile_ids: v.array(v.id("contributorProfiles")),
  materialization_operation_id: v.optional(v.string()), created_at: v.number(),
});
export const contributorIdentitySnapshotMaterializationValidator = v.object({
  snapshot_digest: v.string(), profile_count: v.number(), profile_ids_digest: v.string(), token_count: v.number(),
  operation_id: v.string(), created_at: v.number(),
});

const attributionInput = v.object({
  replication_id: v.id("replications"), poster_display_name: v.string(), poster_profile_id: v.optional(v.id("contributorProfiles")),
  poster_profile_url: v.optional(v.string()), poster_platform: v.optional(v.string()), poster_posted_at: v.optional(v.number()),
  creator_display_name: v.string(), creator_profile_id: v.optional(v.id("contributorProfiles")),
  creator_determination: replicationIdentityAttributionValidator.fields.creator_determination,
  review_status: replicationIdentityAttributionValidator.fields.review_status, evidence: v.array(identityEvidenceValidator), source_digest: v.string(),
});
const aliasInput = v.object({
  profile_id: v.id("contributorProfiles"), alias: v.string(), normalized_alias: v.string(), platform: v.optional(v.string()),
  first_seen_at: v.optional(v.number()), last_seen_at: v.optional(v.number()), evidence: v.array(identityEvidenceValidator),
});
const avatarInput = v.object({
  profile_id: v.id("contributorProfiles"), provenance: contributorAvatarHistoryValidator.fields.provenance,
  storage_id: v.optional(v.id("_storage")), r2_key: v.optional(v.string()), public_url: v.optional(v.string()), source_url: v.optional(v.string()),
  media_digest: v.string(), delivery_verification: deliveryVerificationValidator, delivery_verified_at: v.optional(v.number()),
  delivery_receipt: v.optional(deliveryReceiptValidator), evidence: v.array(identityEvidenceValidator),
});
const verificationContributionInput = v.object({
  artist_id: v.string(), status: contributorReplicatorVerificationValidator.fields.status,
  basis: contributorReplicatorVerificationValidator.fields.basis, work_count_reviewed: v.number(), rationale: v.string(),
  evidence: v.array(identityEvidenceValidator), source_digest: v.string(),
});
const verificationInput = v.object({
  profile_id: v.id("contributorProfiles"), status: contributorReplicatorVerificationValidator.fields.status,
  basis: contributorReplicatorVerificationValidator.fields.basis, work_count_reviewed: v.number(), rationale: v.string(),
  evidence: v.array(identityEvidenceValidator), source_digest: v.string(),
  review_contributions: v.optional(v.array(verificationContributionInput)),
});
const socialInput = v.object({
  entity_kind: socialEntityKindValidator, entity_key: v.string(), replication_id: v.optional(v.id("replications")),
  variant: replicationSocialAssetValidator.fields.variant, storage_id: v.optional(v.id("_storage")), r2_key: v.optional(v.string()),
  public_url: v.optional(v.string()), width: v.number(), height: v.number(), mime_type: v.string(), media_digest: v.string(),
  source_digest: v.string(), status: replicationSocialAssetValidator.fields.status, delivery_verification: deliveryVerificationValidator,
  delivery_verified_at: v.optional(v.number()), delivery_receipt: v.optional(deliveryReceiptValidator), failure_reason: v.optional(v.string()),
});
const common = { item_operation_id: v.string(), expected_operation_id: nullableString, projection: projectionOperationValidator, base_projection_digest: v.string(), receipt_sidecar_digest: nullableString, satisfied_item_operation_ids: v.optional(v.array(v.string())) };
export const identitySocialBatchEntryValidator = v.union(
  v.object({ kind: v.literal("attribution"), ...common, value: attributionInput }),
  v.object({ kind: v.literal("alias"), ...common, identity_snapshot_digest: v.string(), value: aliasInput }),
  v.object({ kind: v.literal("avatar"), ...common, value: avatarInput }),
  v.object({ kind: v.literal("verification"), ...common, value: verificationInput }),
  v.object({ kind: v.literal("social-asset"), ...common, value: socialInput }),
);

export type IdentitySocialBatchEntry = Infer<typeof identitySocialBatchEntryValidator>;
export type IdentitySocialStoredValue = Infer<typeof identitySocialStoredValueValidator>;
export type IdentitySocialTarget = Infer<typeof identitySocialTargetValidator>;
export type ProfileBindingEntry = Infer<typeof profileBindingEntryValidator>;
