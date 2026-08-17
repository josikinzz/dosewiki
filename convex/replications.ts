import { internalMutation, mutation, query } from "./_generated/server";
import * as reads from "./lib/replicationReads";
import * as recovery from "./lib/replicationRecovery";
import * as studio from "./lib/replicationStudio";
import * as validators from "./lib/replicationValidators";
import * as writes from "./lib/replicationWrites";

export {
  memoizedStorageUrls,
  resolveReplicationUrls,
} from "./lib/replicationUrls";
export { selectReplicationsByArtistNames } from "./lib/replicationReads";

/** Public and maintenance replication reads. */
export const getAll = query({
  args: {},
  handler: reads.getAllHandler,
});

export const getBySlug = query({
  args: validators.getBySlugArgs.fields,
  handler: reads.getBySlugHandler,
});

export const getReplicationsByEffect = query({
  args: validators.getReplicationsByEffectArgs.fields,
  handler: reads.getReplicationsByEffectHandler,
});

export const getByArtist = query({
  args: validators.getByArtistArgs.fields,
  handler: reads.getByArtistHandler,
});

export const getByArtistNames = query({
  args: validators.getByArtistNamesArgs.fields,
  handler: reads.getByArtistNamesHandler,
});

export const getPublicReplications = query({
  args: {},
  handler: reads.getPublicReplicationsHandler,
});

export const resolveStorageUrls = query({
  args: validators.resolveStorageUrlsArgs.fields,
  handler: reads.resolveStorageUrlsHandler,
});

/** Authenticated maintenance writes and migration-only internal writes. */
export const generateUploadUrl = mutation({
  args: validators.generateUploadUrlArgs.fields,
  handler: writes.generateUploadUrlHandler,
});

export const insertReplication = mutation({
  args: validators.insertReplicationArgs.fields,
  handler: writes.insertReplicationHandler,
});

export const insertMediaAsset = mutation({
  args: validators.insertMediaAssetArgs.fields,
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
  handler: writes.deleteAuditedRowHandler,
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

export const updateStorageIds = mutation({
  args: validators.updateStorageIdsArgs.fields,
  handler: writes.updateStorageIdsHandler,
});

/** Compare-and-swap recovery and provenance operations. */
export const updatePreviewStorageIds = mutation({
  args: validators.updatePreviewStorageIdsArgs.fields,
  handler: recovery.updatePreviewStorageIdsHandler,
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

export const updateEditorialFields = mutation({
  args: validators.updateEditorialFieldsArgs.fields,
  handler: studio.updateEditorialFieldsHandler,
});

export const bulkUpdateEditorialFields = mutation({
  args: validators.bulkUpdateEditorialFieldsArgs.fields,
  handler: studio.bulkUpdateEditorialFieldsHandler,
});

export const deleteAll = internalMutation({
  args: {},
  handler: writes.deleteAllHandler,
});
