import type { MutationCtx, QueryCtx } from "../../lib/postgres/runtime/server"
import { requireRole } from "./auth";
import { definedReplicationRightsPatch } from "./replicationPolicy";
import {
  isPlaceholderStorageId,
  isValidR2Key,
  resolveReplicationUrls,
} from "./replicationUrls";
import { verifyMediaPublicationReceipts } from "./replicationWrites";
import { REPLICATION_MEDIA_IDENTITY_FIELDS, replicationMediaKeyFromUrl } from "../../lib/runtime/replicationMediaIdentity.mjs";
import { assertDataWritesNotFrozen } from "../../lib/runtime/dataWriteFreeze";
import { assertMediaPublicationReceipt } from "../../lib/runtime/r2MediaStorage";
import type {
  ApplyProvenanceCorrectionArgs,
  ApplySourceRecoveryArgs,
  GetResolvedByIdArgs,
  MergeUnknownTwinArgs,
  UpdatePreviewStorageIdsArgs,
  UpdateMotionStorageIdsArgs,
  UpdateR2KeysArgs,
  UpdateMediaRenditionsArgs,
  UpdateRightsMetadataArgs,
} from "./replicationValidators";

const LEGACY_STORAGE_ID_SHAPE = /^[a-z0-9]{16,64}$/;

export async function updatePreviewStorageIdsHandler(
  ctx: MutationCtx,
  args: UpdatePreviewStorageIdsArgs,
) {
  await requireRole(
    ctx,
    { apiKey: args.apiKey, actorEmail: args.actorEmail, adminIntent: "replicationMaintenance" },
    "admin",
  );
  const validated: Array<{
    id: (typeof args.updates)[number]["id"];
    previewStorageId: string;
  }> = [];

  for (const update of args.updates) {
    if (
      isPlaceholderStorageId(update.previewStorageId)
      || !LEGACY_STORAGE_ID_SHAPE.test(update.previewStorageId)
    ) {
      throw new Error(
        `Preview storage id is malformed or a placeholder: ${update.previewStorageId}`,
      );
    }
    const replication = await ctx.db.get(update.id);
    if (!replication) {
      throw new Error("Preview rendition target row no longer exists.");
    }
    if (replication.storage_id !== update.expectedStorageId) {
      throw new Error(
        `Preview rendition precondition failed: ${replication.slug} storage_id changed since the plan.`,
      );
    }
    validated.push({ id: update.id, previewStorageId: update.previewStorageId });
  }

  for (const entry of validated) {
    await ctx.db.patch(entry.id, { preview_storage_id: entry.previewStorageId });
  }
  return { success: true, updated: validated.length };
}

export async function updateMotionStorageIdsHandler(
  ctx: MutationCtx,
  args: UpdateMotionStorageIdsArgs,
) {
  await requireRole(
    ctx,
    { apiKey: args.apiKey, actorEmail: args.actorEmail, adminIntent: "replicationMaintenance" },
    "admin",
  );
  const validated: Array<{
    id: (typeof args.updates)[number]["id"];
    motionStorageId: string;
    motionPosterStorageId: string;
  }> = [];

  for (const update of args.updates) {
    if (
      isPlaceholderStorageId(update.motionStorageId)
      || !LEGACY_STORAGE_ID_SHAPE.test(update.motionStorageId)
      || isPlaceholderStorageId(update.motionPosterStorageId)
      || !LEGACY_STORAGE_ID_SHAPE.test(update.motionPosterStorageId)
    ) {
      throw new Error(
        `Motion rendition storage ids are malformed or placeholders: ${update.motionStorageId}, ${update.motionPosterStorageId}`,
      );
    }
    const replication = await ctx.db.get(update.id);
    if (!replication) {
      throw new Error("Motion rendition target row no longer exists.");
    }
    if (replication.storage_id !== update.expectedStorageId) {
      throw new Error(
        `Motion rendition precondition failed: ${replication.slug} storage_id changed since the plan.`,
      );
    }
    validated.push({
      id: update.id,
      motionStorageId: update.motionStorageId,
      motionPosterStorageId: update.motionPosterStorageId,
    });
  }

  for (const entry of validated) {
    await ctx.db.patch(entry.id, {
      motion_storage_id: entry.motionStorageId,
      motion_poster_storage_id: entry.motionPosterStorageId,
    });
  }
  return { success: true, updated: validated.length };
}

/** Publish verified native media without allowing a stale operator plan to repoint newer bytes. */
export async function updateMediaRenditionsHandler(ctx: MutationCtx, args: UpdateMediaRenditionsArgs) {
  assertDataWritesNotFrozen("replication-media.publish");
  const actor = await requireRole(ctx, { ...args, adminIntent: "replicationMaintenance" }, "admin");
  const row = await ctx.db.get(args.id);
  if (!row) throw new Error("Media rendition target no longer exists.");
  if (!ctx.targetIdentity) throw new Error("Media publication requires an explicit Postgres target.");
  if (Object.keys(args.expected).length !== REPLICATION_MEDIA_IDENTITY_FIELDS.length
    || REPLICATION_MEDIA_IDENTITY_FIELDS.some((field) =>
      !Object.prototype.hasOwnProperty.call(args.expected, field)
      || args.expected[field] !== (row[field as keyof typeof row] ?? null))) {
    throw new Error("Media rendition identity changed since the reviewed plan.");
  }
  const sourceKey = row.r2_key ?? replicationMediaKeyFromUrl((await resolveReplicationUrls(ctx, row)).url);
  if (sourceKey) {
    assertMediaPublicationReceipt(args.sourceMediaReceipt ?? "", sourceKey, {
      purpose: "replication-rendition", subject: row._id, actorEmail: actor.email, targetIdentity: ctx.targetIdentity,
    });
  }
  if (!Object.values(args.keys).some((key) => key !== undefined)) throw new Error("No media renditions supplied.");
  if ((args.keys.motion_r2_key === undefined) !== (args.keys.motion_poster_r2_key === undefined)) {
    throw new Error("Motion and motion-poster renditions must be supplied together.");
  }
  const resultingFormat = args.keys.r2_key?.split(".").pop() ?? row.format;
  const objects = verifyMediaPublicationReceipts({ type: row.type, format: resultingFormat }, args.keys, args.mediaReceipts, {
    purpose: "replication-rendition", subject: row._id, actorEmail: actor.email, targetIdentity: ctx.targetIdentity,
  });
  const main = objects.get("r2_key");
  if (main && args.file_size !== main.fileSize) throw new Error("Main media size must match the verified object.");
  if (!main && args.file_size !== undefined) throw new Error("Only a main media replacement may change file_size.");
  if (args.provenance) {
    if ((row.source_url ?? null) !== args.provenance.expectedSourceUrl) throw new Error("Source provenance changed since the reviewed plan.");
    const source = new URL(args.provenance.source_url);
    if (!["http:", "https:"].includes(source.protocol) || source.username || source.password) {
      throw new Error("Source provenance must be an HTTP or HTTPS URL.");
    }
  }
  const patch: Partial<typeof row> = { ...args.keys };
  if (main) {
    patch.file_size = main.fileSize;
    patch.format = resultingFormat;
  }
  if (main && row.r2_key !== main.r2Key) {
    // The historical identity map is retained; row locators must not resurrect stale derivatives.
    for (const field of ["thumbnail", "preview", "motion", "motion_poster"] as const) {
      const key = `${field}_r2_key` as const;
      if (args.keys[key] === undefined) {
        patch[key] = undefined;
        patch[`${field}_storage_id`] = undefined;
        if (field === "thumbnail") patch.thumbnail_url = undefined;
      }
    }
  }
  if (args.provenance) patch.source_url = args.provenance.source_url;
  await ctx.db.patch(row._id, patch);
  return { success: true, id: row._id };
}

const R2_KEYS_BATCH_LIMIT = 250;

type R2KeyPatch = {
  r2_key?: string;
  thumbnail_r2_key?: string;
  preview_r2_key?: string;
  motion_r2_key?: string;
  motion_poster_r2_key?: string;
};

const R2_KEY_ROLES = [
  { keyField: "r2_key", storageField: "storage_id", expectedField: "expectedStorageId" },
  { keyField: "thumbnail_r2_key", storageField: "thumbnail_storage_id", expectedField: "expectedThumbnailStorageId" },
  { keyField: "preview_r2_key", storageField: "preview_storage_id", expectedField: "expectedPreviewStorageId" },
  { keyField: "motion_r2_key", storageField: "motion_storage_id", expectedField: "expectedMotionStorageId" },
  { keyField: "motion_poster_r2_key", storageField: "motion_poster_storage_id", expectedField: "expectedMotionPosterStorageId" },
] as const;

/**
 * Pure compare-and-swap check for one R2 key batch entry. Returns the patch to
 * apply, or throws. Rules, per variant whose `*_r2_key` is present:
 *
 * 1. The key must be a canonical `media/sha256/` content-addressed key.
 * 2. The caller must state the storage ID it derived that key from
 *    (`expected*StorageId`), and the row must still carry exactly that ID —
 *    so a repoint racing the batch fails loudly instead of pinning old bytes.
 *
 * `expectedStorageId` is additionally checked unconditionally: it is the row
 * identity anchor for every entry, whichever variants the entry patches.
 */
export function validateR2KeyUpdate(
  row: {
    slug: string;
    storage_id?: string;
    thumbnail_storage_id?: string;
    preview_storage_id?: string;
    motion_storage_id?: string;
    motion_poster_storage_id?: string;
  },
  update: UpdateR2KeysArgs["updates"][number],
): R2KeyPatch {
  if (row.storage_id !== update.expectedStorageId) {
    throw new Error(
      `R2 key precondition failed: ${row.slug} storage_id changed since the plan.`,
    );
  }
  const patch: R2KeyPatch = {};
  for (const { keyField, storageField, expectedField } of R2_KEY_ROLES) {
    const key = update[keyField];
    if (key === undefined) continue;
    if (!isValidR2Key(key)) {
      throw new Error(`R2 key is not a canonical media/sha256/ key: ${key}`);
    }
    const currentStorageId = row[storageField];
    const expectedStorageId = update[expectedField];
    if (isPlaceholderStorageId(currentStorageId)) {
      throw new Error(
        `R2 key precondition failed: ${row.slug} has no native ${storageField} to derive ${keyField} from.`,
      );
    }
    if (currentStorageId !== expectedStorageId) {
      throw new Error(
        `R2 key precondition failed: ${row.slug} ${storageField} changed since the plan.`,
      );
    }
    patch[keyField] = key;
  }
  if (Object.keys(patch).length === 0) {
    throw new Error(`R2 key update for ${row.slug} sets no keys.`);
  }
  return patch;
}

export async function updateR2KeysHandler(ctx: MutationCtx, args: UpdateR2KeysArgs) {
  await requireRole(
    ctx,
    { apiKey: args.apiKey, actorEmail: args.actorEmail, adminIntent: "replicationMaintenance" },
    "admin",
  );
  if (args.updates.length === 0 || args.updates.length > R2_KEYS_BATCH_LIMIT) {
    throw new Error(`R2 key batches must contain 1-${R2_KEYS_BATCH_LIMIT} updates.`);
  }
  const validated: Array<{
    id: (typeof args.updates)[number]["id"];
    patch: R2KeyPatch;
  }> = [];
  for (const update of args.updates) {
    const replication = await ctx.db.get(update.id);
    if (!replication) {
      throw new Error("R2 key target row no longer exists.");
    }
    validated.push({ id: update.id, patch: validateR2KeyUpdate(replication, update) });
  }
  for (const entry of validated) {
    await ctx.db.patch(entry.id, entry.patch);
  }
  return { success: true, updated: validated.length };
}

export async function getResolvedByIdHandler(
  ctx: QueryCtx,
  args: GetResolvedByIdArgs,
) {
  await requireRole(
    ctx,
    { apiKey: args.apiKey, actorEmail: args.actorEmail, adminIntent: "replicationMaintenance" },
    "admin",
  );
  const replication = await ctx.db.get(args.id);
  if (!replication) return null;
  const resolved = await resolveReplicationUrls(ctx, replication);
  return { ...replication, ...resolved };
}

export async function applySourceRecoveryHandler(
  ctx: MutationCtx,
  args: ApplySourceRecoveryArgs,
) {
  await requireRole(
    ctx,
    { apiKey: args.apiKey, actorEmail: args.actorEmail, adminIntent: "replicationMaintenance" },
    "admin",
  );
  const replication = await ctx.db.get(args.id);
  if (!replication) {
    throw new Error("Replication source recovery target no longer exists.");
  }
  if (
    replication.storage_id !== args.expectedStorageId
    || (replication.source_url ?? null) !== args.expectedSourceUrl
  ) {
    throw new Error(`Replication source recovery precondition failed: ${replication.slug}`);
  }
  await ctx.db.patch(args.id, {
    storage_id: args.storageId,
    source_url: args.sourceUrl,
  });
  return { success: true };
}

export async function mergeUnknownTwinHandler(
  ctx: MutationCtx,
  args: MergeUnknownTwinArgs,
) {
  await requireRole(
    ctx,
    { apiKey: args.apiKey, actorEmail: args.actorEmail, adminIntent: "replicationMaintenance" },
    "admin",
  );
  const keeper = await ctx.db.get(args.keeperId);
  const duplicate = await ctx.db.get(args.duplicateId);
  if (!keeper || !duplicate) {
    throw new Error("Replication merge rows no longer exist");
  }
  if (
    keeper.slug !== args.expectedSlug
    || duplicate.slug !== args.expectedSlug
    || keeper.effect_slug !== args.expectedKeeperEffectSlug
    || duplicate.effect_slug !== "unknown"
    || duplicate.storage_id !== args.expectedDuplicateStorageId
    || !keeper.storage_id.startsWith("placeholder-")
  ) {
    throw new Error(`Replication merge precondition failed: ${args.expectedSlug}`);
  }
  if (
    args.duplicateThumbnailStorageId !== undefined
    && duplicate.thumbnail_storage_id !== args.duplicateThumbnailStorageId
  ) {
    throw new Error(`Replication thumbnail precondition failed: ${args.expectedSlug}`);
  }

  await ctx.db.patch(keeper._id, {
    storage_id: duplicate.storage_id,
    ...(args.duplicateThumbnailStorageId
      ? { thumbnail_storage_id: args.duplicateThumbnailStorageId }
      : {}),
  });
  await ctx.db.delete(duplicate._id);
  return { merged: true };
}

export async function applyProvenanceCorrectionHandler(
  ctx: MutationCtx,
  args: ApplyProvenanceCorrectionArgs,
) {
  await requireRole(
    ctx,
    { apiKey: args.apiKey, actorEmail: args.actorEmail, adminIntent: "replicationMaintenance" },
    "admin",
  );
  const replication = await ctx.db.get(args.id);
  if (!replication) throw new Error("Replication provenance row no longer exists");

  const current = {
    title: replication.title,
    artist: replication.artist,
    artist_url: replication.artist_url ?? null,
    credit_line: replication.credit_line ?? null,
    source_url: replication.source_url ?? null,
    rightsholder: replication.rightsholder ?? null,
  };
  const snapshotMatches =
    current.title === args.expected.title
    && current.artist === args.expected.artist
    && current.artist_url === args.expected.artist_url
    && current.credit_line === args.expected.credit_line
    && current.source_url === args.expected.source_url
    && current.rightsholder === args.expected.rightsholder;
  if (!snapshotMatches) {
    throw new Error(`Replication provenance precondition failed: ${replication.slug}`);
  }

  await ctx.db.patch(replication._id, args.updates);
  return { updated: true, slug: replication.slug };
}

export async function updateRightsMetadataHandler(
  ctx: MutationCtx,
  args: UpdateRightsMetadataArgs,
) {
  await requireRole(
    ctx,
    { apiKey: args.apiKey, actorEmail: args.actorEmail, adminIntent: "replicationMaintenance" },
    "admin",
  );
  const replication = await ctx.db
    .query("replications")
    .withIndex("by_slug", (q) => q.eq("slug", args.slug))
    .first();
  if (!replication) throw new Error(`Replication not found: ${args.slug}`);

  const patch = definedReplicationRightsPatch(args.updates);
  if (Object.keys(patch).length === 0) {
    return { success: true, updated: false };
  }
  await ctx.db.patch(replication._id, patch);
  return { success: true, updated: true };
}
