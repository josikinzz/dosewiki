import { type Infer, v } from "../../lib/postgres/runtime/values"
import { replication } from "./effectMediaSchemaValidators";
import { replicationTaxonomyPatchValidator } from "./replicationTaxonomyValidators";

export const replicationRightsStatus = v.union(
  v.literal("creator-retained"),
  v.literal("explicit-license"),
  v.literal("unknown"),
  v.literal("permission-granted"),
  v.literal("public-domain"),
);

export const replicationRole = v.union(v.literal("replication"), v.literal("figure"));
export const replicationMediaType = v.union(
  v.literal("video"),
  v.literal("image"),
  v.literal("audio"),
);

export const replicationRightsFields = {
  rights_status: v.optional(replicationRightsStatus),
  license_name: v.optional(v.string()),
  license_url: v.optional(v.string()),
  credit_line: v.optional(v.string()),
  source_url: v.optional(v.string()),
  rightsholder: v.optional(v.string()),
  permission_notes: v.optional(v.string()),
  removal_contact: v.optional(v.string()),
};

export const replicationCreditSnapshot = v.object({
  title: v.string(),
  artist: v.string(),
  artist_url: v.union(v.string(), v.null()),
  credit_line: v.union(v.string(), v.null()),
  source_url: v.union(v.string(), v.null()),
  rightsholder: v.union(v.string(), v.null()),
});

export const replicationCreditUpdates = v.object({
  title: v.string(),
  artist: v.string(),
  artist_url: v.optional(v.string()),
  credit_line: v.string(),
  source_url: v.optional(v.string()),
  rightsholder: v.optional(v.string()),
});

export const replicationEditorialSnapshot = v.object({
  title: v.string(),
  artist: v.string(),
  role: replicationRole,
  effect_slug: v.union(v.string(), v.null()),
  credit_line: v.union(v.string(), v.null()),
  effect_tags: v.array(v.string()),
});

export const getBySlugArgs = v.object({ slug: v.string() });
export const getReplicationsByEffectArgs = v.object({ effect_slug: v.string() });
export const getByArtistArgs = v.object({ artist: v.string() });
export const getByArtistNamesArgs = v.object({ artistNames: v.array(v.string()) });
export const getByArtistNamesPageArgs = v.object({
  artistNames: v.array(v.string()),
  cursor: v.optional(v.string()),
  limit: v.optional(v.number()),
});
export const getBySlugsArgs = v.object({ slugs: v.array(v.string()) });
export const resolveStorageUrlsArgs = v.object({ storageIds: v.array(v.string()) });
export const authorizeMediaUploadArgs = v.object({
  apiKey: v.optional(v.string()),
  actorEmail: v.optional(v.string()),
});

/** Full public detail row after media locators have been resolved. */
export const resolvedReplication = v.object({
  _id: v.id("replications"),
  _creationTime: v.number(),
  ...replication.fields,
  url: v.string(),
  thumbnail_url: v.optional(v.string()),
  preview_url: v.optional(v.string()),
  motion_url: v.optional(v.string()),
  motion_poster_url: v.optional(v.string()),
});

export const storedReplication = v.object({
  _id: v.id("replications"),
  _creationTime: v.number(),
  ...replication.fields,
});

export const resolvedReplicationWithNullableUrls = v.object({
  _id: v.id("replications"),
  _creationTime: v.number(),
  ...replication.fields,
  url: v.union(v.string(), v.null()),
  thumbnail_url: v.union(v.string(), v.null()),
  preview_url: v.union(v.string(), v.null()),
  motion_url: v.union(v.string(), v.null()),
  motion_poster_url: v.union(v.string(), v.null()),
});

export const resolvedGalleryReplication = v.object({
  ...resolvedReplicationWithNullableUrls.fields,
  order_index: v.optional(v.number()),
});

export const resolvedReplicationPage = v.object({
  items: v.array(resolvedReplicationWithNullableUrls),
  cursor: v.string(),
  isDone: v.boolean(),
});
const mediaReceipts = v.optional(v.record(v.string(), v.string()));
const mediaKeys = {
  r2_key: v.optional(v.string()),
  thumbnail_r2_key: v.optional(v.string()),
  preview_r2_key: v.optional(v.string()),
  motion_r2_key: v.optional(v.string()),
  motion_poster_r2_key: v.optional(v.string()),
};


export const insertReplicationArgs = v.object({
  apiKey: v.optional(v.string()),
  actorEmail: v.optional(v.string()),
  slug: v.string(),
  title: v.string(),
  artist: v.string(),
  artist_url: v.optional(v.string()),
  type: v.union(v.literal("video"), v.literal("image")),
  storage_id: v.optional(v.string()),
  ...mediaKeys,
  mediaReceipts,
  effect_slug: v.string(),
  thumbnail_storage_id: v.optional(v.string()),
  url: v.optional(v.string()),
  thumbnail_url: v.optional(v.string()),
  width: v.optional(v.number()),
  height: v.optional(v.number()),
  format: v.string(),
  file_size: v.optional(v.number()),
  duration: v.optional(v.number()),
  ...replicationRightsFields,
});

export const insertMediaAssetArgs = v.object({
  apiKey: v.optional(v.string()),
  actorEmail: v.optional(v.string()),
  mediaReceipts,
  expected_absent: v.literal(true),
  slug: v.string(),
  title: v.string(),
  artist: v.string(),
  artist_url: v.optional(v.string()),
  role: replicationRole,
  type: replicationMediaType,
  storage_id: v.optional(v.string()),
  r2_key: v.optional(v.string()),
  thumbnail_r2_key: v.optional(v.string()),
  preview_r2_key: v.optional(v.string()),
  motion_r2_key: v.optional(v.string()),
  motion_poster_r2_key: v.optional(v.string()),
  effect_slug: v.optional(v.string()),
  thumbnail_storage_id: v.optional(v.string()),
  url: v.optional(v.string()),
  thumbnail_url: v.optional(v.string()),
  width: v.optional(v.number()),
  height: v.optional(v.number()),
  format: v.string(),
  file_size: v.optional(v.number()),
  duration: v.optional(v.number()),
  has_audio: v.optional(v.boolean()),
  effect_tags: v.optional(v.array(v.string())),
  source_sha256: v.optional(v.string()),
  taxonomy: v.optional(replicationTaxonomyPatchValidator),
  taxonomy_evidence: v.optional(v.object({
    operation_id: v.string(),
    replication_status_rationale: v.string(),
    viewing_mode_rationale: v.optional(v.string()),
    content_family_rationale: v.string(),
  })),
  rights_status: replicationRightsStatus,
  license_name: v.optional(v.string()),
  license_url: v.optional(v.string()),
  credit_line: v.optional(v.string()),
  source_url: v.optional(v.string()),
  rightsholder: v.optional(v.string()),
  permission_notes: v.optional(v.string()),
  removal_contact: v.optional(v.string()),
});

export const insertMediaAssetResult = v.object({
  inserted: v.boolean(),
  id: v.id("replications"),
  slug: v.string(),
  role: replicationRole,
});

export const bulkImportArgs = v.object({
  replications: v.array(
    v.object({
      slug: v.string(),
      title: v.string(),
      artist: v.string(),
      artist_url: v.optional(v.string()),
      type: v.union(v.literal("video"), v.literal("image")),
      storage_id: v.string(),
      effect_slug: v.string(),
      thumbnail_storage_id: v.optional(v.string()),
      url: v.optional(v.string()),
      thumbnail_url: v.optional(v.string()),
      width: v.optional(v.number()),
      height: v.optional(v.number()),
      format: v.string(),
      file_size: v.optional(v.number()),
      duration: v.optional(v.number()),
      ...replicationRightsFields,
    }),
  ),
});

export const updateGalleryOrderArgs = v.object({
  apiKey: v.optional(v.string()),
  actorEmail: v.optional(v.string()),
  effect_slug: v.string(),
  replication_slugs: v.array(v.string()),
  expected_replication_slugs: v.optional(v.array(v.string())),
  expectedRevision: v.string(),
});

export const renameSlugArgs = v.object({
  apiKey: v.optional(v.string()),
  actorEmail: v.optional(v.string()),
  from: v.string(),
  to: v.string(),
  id: v.optional(v.id("replications")),
});

export const deleteBySlugArgs = v.object({
  apiKey: v.optional(v.string()),
  actorEmail: v.optional(v.string()),
  slug: v.string(),
});

export const deleteAuditedRowArgs = v.object({
  apiKey: v.optional(v.string()),
  actorEmail: v.optional(v.string()),
  id: v.id("replications"),
  expectedSlug: v.string(),
  expectedTitle: v.string(),
  expectedArtist: v.string(),
  expectedStorageId: v.string(),
  requireDuplicate: v.boolean(),
});

export const updateEffectSlugArgs = v.object({
  apiKey: v.optional(v.string()),
  actorEmail: v.optional(v.string()),
  slug: v.string(),
  effect_slug: v.string(),
});

export const updateUrlArgs = v.object({
  apiKey: v.optional(v.string()),
  actorEmail: v.optional(v.string()),
  id: v.id("replications"),
  url: v.string(),
  thumbnail_url: v.optional(v.string()),
});

export const updateDeliveredFileSizeArgs = v.object({
  apiKey: v.optional(v.string()),
  actorEmail: v.optional(v.string()),
  id: v.id("replications"),
  expectedStorageId: v.string(),
  file_size: v.number(),
});

export const updateStorageIdsArgs = v.object({
  apiKey: v.optional(v.string()),
  actorEmail: v.optional(v.string()),
  id: v.id("replications"),
  storage_id: v.string(),
  thumbnail_storage_id: v.optional(v.string()),
});

export const updatePreviewStorageIdsArgs = v.object({
  apiKey: v.optional(v.string()),
  actorEmail: v.optional(v.string()),
  updates: v.array(
    v.object({
      id: v.id("replications"),
      previewStorageId: v.string(),
      expectedStorageId: v.string(),
    }),
  ),
});

export const updateMotionStorageIdsArgs = v.object({
  apiKey: v.optional(v.string()),
  actorEmail: v.optional(v.string()),
  updates: v.array(
    v.object({
      id: v.id("replications"),
      motionStorageId: v.string(),
      motionPosterStorageId: v.string(),
      expectedStorageId: v.string(),
    }),
  ),
});

export const updateMediaRenditionsArgs = v.object({
  apiKey: v.optional(v.string()),
  actorEmail: v.optional(v.string()),
  id: v.id("replications"),
  expected: v.record(v.string(), v.union(v.string(), v.null())),
  keys: v.object(mediaKeys),
  mediaReceipts: v.record(v.string(), v.string()),
  sourceMediaReceipt: v.optional(v.string()),
  file_size: v.optional(v.number()),
  provenance: v.optional(v.object({
    source_url: v.string(),
    expectedSourceUrl: v.union(v.string(), v.null()),
  })),
});

/**
 * Compare-and-swap batch for the R2 media migration. Every entry names the
 * row's current `storage_id`; a variant key may only be set alongside the
 * matching expected variant storage ID, so a repoint that raced this batch
 * fails the whole mutation instead of pinning stale bytes.
 */
export const updateR2KeysArgs = v.object({
  apiKey: v.optional(v.string()),
  actorEmail: v.optional(v.string()),
  updates: v.array(
    v.object({
      id: v.id("replications"),
      expectedStorageId: v.string(),
      r2_key: v.optional(v.string()),
      thumbnail_r2_key: v.optional(v.string()),
      expectedThumbnailStorageId: v.optional(v.string()),
      preview_r2_key: v.optional(v.string()),
      expectedPreviewStorageId: v.optional(v.string()),
      motion_r2_key: v.optional(v.string()),
      expectedMotionStorageId: v.optional(v.string()),
      motion_poster_r2_key: v.optional(v.string()),
      expectedMotionPosterStorageId: v.optional(v.string()),
    }),
  ),
});

export const getResolvedByIdArgs = v.object({
  apiKey: v.optional(v.string()),
  actorEmail: v.optional(v.string()),
  id: v.id("replications"),
});

export const applySourceRecoveryArgs = v.object({
  apiKey: v.optional(v.string()),
  actorEmail: v.optional(v.string()),
  id: v.id("replications"),
  expectedStorageId: v.string(),
  expectedSourceUrl: v.union(v.string(), v.null()),
  storageId: v.string(),
  sourceUrl: v.string(),
});

export const mergeUnknownTwinArgs = v.object({
  apiKey: v.optional(v.string()),
  actorEmail: v.optional(v.string()),
  keeperId: v.id("replications"),
  duplicateId: v.id("replications"),
  expectedSlug: v.string(),
  expectedKeeperEffectSlug: v.string(),
  expectedDuplicateStorageId: v.string(),
  duplicateThumbnailStorageId: v.optional(v.string()),
});

export const applyProvenanceCorrectionArgs = v.object({
  apiKey: v.optional(v.string()),
  actorEmail: v.optional(v.string()),
  id: v.id("replications"),
  expected: replicationCreditSnapshot,
  updates: replicationCreditUpdates,
});

export const updateRightsMetadataArgs = v.object({
  apiKey: v.optional(v.string()),
  actorEmail: v.optional(v.string()),
  slug: v.string(),
  updates: v.object(replicationRightsFields),
});

export const getStudioRowsArgs = v.object({
  apiKey: v.optional(v.string()),
  actorEmail: v.optional(v.string()),
});

export const updateEditorialFieldsArgs = v.object({
  apiKey: v.optional(v.string()),
  actorEmail: v.optional(v.string()),
  id: v.id("replications"),
  expected: replicationEditorialSnapshot,
  updates: replicationEditorialSnapshot,
});

export const bulkUpdateEditorialFieldsArgs = v.object({
  apiKey: v.optional(v.string()),
  actorEmail: v.optional(v.string()),
  ids: v.array(v.id("replications")),
  effect_slug: v.optional(v.string()),
  artist: v.optional(v.string()),
  role: v.optional(replicationRole),
  addEffectTags: v.optional(v.array(v.string())),
  /**
   * Corpus-wide showcase suppression. A toggle rather than an editorial field,
   * so it rides the bulk path for one row or two hundred and never touches the
   * single-edit snapshot's optimistic-concurrency check.
   */
  showcase_excluded: v.optional(v.boolean()),
});

const nullableString = v.union(v.string(), v.null());
const nullableNumber = v.union(v.number(), v.null());

export const compareAndSetEffectTaxonomyArgs = v.object({
  apiKey: v.string(),
  id: v.id("replications"),
  expected: v.object({
    identity: v.object({
      _id: v.id("replications"),
      slug: v.string(),
      title: v.string(),
      artist: v.string(),
      type: replicationMediaType,
      storage_id: nullableString,
      r2_key: nullableString,
    }),
    value: v.object({
      effect_slug: nullableString,
      effect_tags: v.array(v.string()),
      replication_status: v.literal("replication"),
      taxonomy_record_key: nullableString,
      taxonomy_source_digest: nullableString,
      taxonomy_version: nullableNumber,
      taxonomy_updated_at: nullableNumber,
    }),
  }),
  intended: v.object({
    effect_slug: v.string(),
    effect_tags: v.array(v.string()),
  }),
});

export const getStoredForTaxonomyCasArgs = v.object({
  apiKey: v.string(),
  id: v.id("replications"),
});

export const compareAndSetEffectTaxonomyResult = v.object({
  success: v.literal(true),
  id: v.id("replications"),
  slug: v.string(),
  effect_slug: v.string(),
  effect_tags: v.array(v.string()),
});

export const setAudioPresenceArgs = v.object({
  apiKey: v.optional(v.string()),
  actorEmail: v.optional(v.string()),
  entries: v.array(
    v.object({
      id: v.id("replications"),
      has_audio: v.boolean(),
    }),
  ),
});

export type InsertReplicationArgs = Infer<typeof insertReplicationArgs>;
export type InsertMediaAssetArgs = Infer<typeof insertMediaAssetArgs>;
export type BulkImportArgs = Infer<typeof bulkImportArgs>;
export type UpdateGalleryOrderArgs = Infer<typeof updateGalleryOrderArgs>;
export type RenameSlugArgs = Infer<typeof renameSlugArgs>;
export type DeleteBySlugArgs = Infer<typeof deleteBySlugArgs>;
export type DeleteAuditedRowArgs = Infer<typeof deleteAuditedRowArgs>;
export type UpdateEffectSlugArgs = Infer<typeof updateEffectSlugArgs>;
export type UpdateUrlArgs = Infer<typeof updateUrlArgs>;
export type UpdateDeliveredFileSizeArgs = Infer<typeof updateDeliveredFileSizeArgs>;
export type UpdateStorageIdsArgs = Infer<typeof updateStorageIdsArgs>;
export type UpdatePreviewStorageIdsArgs = Infer<typeof updatePreviewStorageIdsArgs>;
export type UpdateMotionStorageIdsArgs = Infer<typeof updateMotionStorageIdsArgs>;
export type UpdateMediaRenditionsArgs = Infer<typeof updateMediaRenditionsArgs>;
export type UpdateR2KeysArgs = Infer<typeof updateR2KeysArgs>;
export type GetResolvedByIdArgs = Infer<typeof getResolvedByIdArgs>;
export type ApplySourceRecoveryArgs = Infer<typeof applySourceRecoveryArgs>;
export type MergeUnknownTwinArgs = Infer<typeof mergeUnknownTwinArgs>;
export type ApplyProvenanceCorrectionArgs = Infer<typeof applyProvenanceCorrectionArgs>;
export type UpdateRightsMetadataArgs = Infer<typeof updateRightsMetadataArgs>;
export type GetStudioRowsArgs = Infer<typeof getStudioRowsArgs>;
export type UpdateEditorialFieldsArgs = Infer<typeof updateEditorialFieldsArgs>;
export type BulkUpdateEditorialFieldsArgs = Infer<typeof bulkUpdateEditorialFieldsArgs>;
export type CompareAndSetEffectTaxonomyArgs = Infer<typeof compareAndSetEffectTaxonomyArgs>;
export type SetAudioPresenceArgs = Infer<typeof setAudioPresenceArgs>;

export type ReplicationEditorialSnapshot = Infer<typeof replicationEditorialSnapshot>;
export type ReplicationRightsPatch = Infer<typeof updateRightsMetadataArgs>["updates"];
