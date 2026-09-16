import { v } from "../lib/postgres/runtime/values";
import { query } from "../lib/postgres/runtime/server";
import { internalMutation, mutation } from "./lib/indexedMutation";
import * as reads from "./lib/replicationReads";
import {
  getPublicGalleryMembershipHandler,
  getPublicGalleryPageHandler,
  publicGalleryMembershipResult,
  publicGalleryPageArgs,
  publicGalleryPageResult,
} from "./lib/replicationGalleryReads";
import * as recovery from "./lib/replicationRecovery";
import * as studio from "./lib/replicationStudio";
import * as taxonomyCas from "./lib/replicationTaxonomyCas";
import * as validators from "./lib/replicationValidators";
import * as writes from "./lib/replicationWrites";
import { deleteAuditedRowHandler } from "./lib/replicationAuditedDeletion";

export {
  memoizedStorageUrls,
  resolveReplicationUrls,
} from "./lib/replicationUrls";
export { selectReplicationsByArtistNames } from "./lib/replicationReads";

/** Public and maintenance replication reads. */
export const getAll = query({
  args: {},
  returns: v.array(validators.storedReplication),
  handler: reads.getAllHandler,
});

export const getBySlug = query({
  args: validators.getBySlugArgs.fields,
  returns: v.union(validators.resolvedReplicationWithNullableUrls, v.null()),
  handler: reads.getBySlugHandler,
});

export const getBySlugs = query({
  args: validators.getBySlugsArgs.fields,
  returns: v.array(validators.resolvedReplication),
  handler: reads.getBySlugsHandler,
});

export const getReplicationsByEffect = query({
  args: validators.getReplicationsByEffectArgs.fields,
  returns: v.array(validators.resolvedReplicationWithNullableUrls),
  handler: reads.getReplicationsByEffectHandler,
});

export const getByArtist = query({
  args: validators.getByArtistArgs.fields,
  returns: v.array(validators.resolvedReplicationWithNullableUrls),
  handler: reads.getByArtistHandler,
});

export const getByArtistNames = query({
  args: validators.getByArtistNamesArgs.fields,
  returns: v.array(validators.resolvedReplicationWithNullableUrls),
  handler: reads.getByArtistNamesHandler,
});

export const getByArtistNamesPage = query({
  args: validators.getByArtistNamesPageArgs.fields,
  returns: validators.resolvedReplicationPage,
  handler: reads.getByArtistNamesPageHandler,
});

export const getPublicReplications = query({
  args: {},
  returns: v.array(validators.resolvedGalleryReplication),
  handler: reads.getPublicReplicationsHandler,
});

export const getPublicGalleryPage = query({
  args: publicGalleryPageArgs,
  returns: publicGalleryPageResult,
  handler: getPublicGalleryPageHandler,
});

export const getPublicGalleryMembership = query({
  args: {},
  returns: publicGalleryMembershipResult,
  handler: getPublicGalleryMembershipHandler,
});

export const resolveStorageUrls = query({
  args: validators.resolveStorageUrlsArgs.fields,
  returns: v.array(v.union(v.string(), v.null())),
  handler: reads.resolveStorageUrlsHandler,
});

/** Authenticated maintenance writes and migration-only internal writes. */
export const authorizeMediaUpload = query({
  args: validators.authorizeMediaUploadArgs.fields,
  handler: writes.authorizeMediaUploadHandler,
});

export const insertReplication = mutation({
  args: validators.insertReplicationArgs.fields,
  returns: v.id("replications"),
  handler: writes.insertReplicationHandler,
});

export const insertMediaAsset = mutation({
  args: validators.insertMediaAssetArgs.fields,
  returns: validators.insertMediaAssetResult,
  handler: writes.insertMediaAssetHandler,
});

export const bulkImport = internalMutation({
  args: validators.bulkImportArgs.fields,
  handler: writes.bulkImportHandler,
});

export const updateGalleryOrder = mutation({
  args: validators.updateGalleryOrderArgs.fields,
  handler: writes.updateGalleryOrderHandler,
});

export const renameSlug = mutation({
  args: validators.renameSlugArgs.fields,
  handler: writes.renameSlugHandler,
});

export const deleteBySlug = mutation({
  args: validators.deleteBySlugArgs.fields,
  handler: writes.deleteBySlugHandler,
});

export const deleteAuditedRow = mutation({
  args: validators.deleteAuditedRowArgs.fields,
  handler: deleteAuditedRowHandler,
});

export const updateEffectSlug = mutation({
  args: validators.updateEffectSlugArgs.fields,
  handler: writes.updateEffectSlugHandler,
});

export const updateUrl = mutation({
  args: validators.updateUrlArgs.fields,
  handler: writes.updateUrlHandler,
});

export const updateDeliveredFileSize = mutation({
  args: validators.updateDeliveredFileSizeArgs.fields,
  handler: writes.updateDeliveredFileSizeHandler,
});

export const setAudioPresence = mutation({
  args: validators.setAudioPresenceArgs.fields,
  handler: writes.setAudioPresenceHandler,
});

export const updateStorageIds = mutation({
  args: validators.updateStorageIdsArgs.fields,
  handler: writes.updateStorageIdsHandler,
});

/** Compare-and-swap recovery and provenance operations. */
export const updatePreviewStorageIds = mutation({
  args: validators.updatePreviewStorageIdsArgs.fields,
  handler: recovery.updatePreviewStorageIdsHandler,
});

export const updateMotionStorageIds = mutation({
  args: validators.updateMotionStorageIdsArgs.fields,
  handler: recovery.updateMotionStorageIdsHandler,
});

export const updateMediaRenditions = mutation({
  args: validators.updateMediaRenditionsArgs.fields,
  handler: recovery.updateMediaRenditionsHandler,
});

export const updateR2Keys = mutation({
  args: validators.updateR2KeysArgs.fields,
  handler: recovery.updateR2KeysHandler,
});

export const getResolvedById = query({
  args: validators.getResolvedByIdArgs.fields,
  handler: recovery.getResolvedByIdHandler,
});

export const applySourceRecovery = mutation({
  args: validators.applySourceRecoveryArgs.fields,
  handler: recovery.applySourceRecoveryHandler,
});

export const mergeUnknownTwin = mutation({
  args: validators.mergeUnknownTwinArgs.fields,
  handler: recovery.mergeUnknownTwinHandler,
});

export const applyProvenanceCorrection = mutation({
  args: validators.applyProvenanceCorrectionArgs.fields,
  handler: recovery.applyProvenanceCorrectionHandler,
});

export const updateRightsMetadata = mutation({
  args: validators.updateRightsMetadataArgs.fields,
  handler: recovery.updateRightsMetadataHandler,
});

/** Replication Studio read and guarded editorial writes. */
export const getStudioRows = query({
  args: validators.getStudioRowsArgs.fields,
  handler: studio.getStudioRowsHandler,
});

export const getStudioTotal = query({
  args: validators.getStudioRowsArgs.fields,
  returns: v.object({ totalCount: v.number() }),
  handler: studio.getStudioTotalHandler,
});

export const getStudioPreview = query({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    slug: v.string(),
  },
  returns: v.union(
    v.object({
      slug: v.string(),
      preview_url: v.union(v.string(), v.null()),
    }),
    v.null(),
  ),
  handler: studio.getStudioPreviewHandler,
});

export const updateEditorialFields = mutation({
  args: validators.updateEditorialFieldsArgs.fields,
  handler: studio.updateEditorialFieldsHandler,
});

export const bulkUpdateEditorialFields = mutation({
  args: validators.bulkUpdateEditorialFieldsArgs.fields,
  handler: studio.bulkUpdateEditorialFieldsHandler,
});

export const getStoredForTaxonomyCas = query({
  args: validators.getStoredForTaxonomyCasArgs.fields,
  returns: v.union(validators.storedReplication, v.null()),
  handler: taxonomyCas.getStoredForTaxonomyCasHandler,
});

export const compareAndSetEffectTaxonomy = mutation({
  args: validators.compareAndSetEffectTaxonomyArgs.fields,
  returns: validators.compareAndSetEffectTaxonomyResult,
  handler: taxonomyCas.compareAndSetEffectTaxonomyHandler,
});

export const deleteAll = internalMutation({
  args: {},
  handler: writes.deleteAllHandler,
});
