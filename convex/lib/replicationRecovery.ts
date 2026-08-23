import type { MutationCtx, QueryCtx } from "../_generated/server";
import { requireAuth } from "./auth";
import { definedReplicationRightsPatch } from "./replicationPolicy";
import {
  isPlaceholderStorageId,
  resolveReplicationUrls,
} from "./replicationUrls";
import type {
  ApplyProvenanceCorrectionArgs,
  ApplySourceRecoveryArgs,
  GetResolvedByIdArgs,
  MergeUnknownTwinArgs,
  UpdatePreviewStorageIdsArgs,
  UpdateMotionStorageIdsArgs,
  UpdateRightsMetadataArgs,
} from "./replicationValidators";

const CONVEX_STORAGE_ID_SHAPE = /^[a-z0-9]{16,64}$/;

export async function updatePreviewStorageIdsHandler(
  ctx: MutationCtx,
  args: UpdatePreviewStorageIdsArgs,
) {
  await requireAuth(ctx, args.apiKey, "replicationMaintenance");
  const validated: Array<{
    id: (typeof args.updates)[number]["id"];
    previewStorageId: string;
  }> = [];

  for (const update of args.updates) {
    if (
      isPlaceholderStorageId(update.previewStorageId)
      || !CONVEX_STORAGE_ID_SHAPE.test(update.previewStorageId)
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
  await requireAuth(ctx, args.apiKey, "replicationMaintenance");
  const validated: Array<{
    id: (typeof args.updates)[number]["id"];
    motionStorageId: string;
    motionPosterStorageId: string;
  }> = [];

  for (const update of args.updates) {
    if (
      isPlaceholderStorageId(update.motionStorageId)
      || !CONVEX_STORAGE_ID_SHAPE.test(update.motionStorageId)
      || isPlaceholderStorageId(update.motionPosterStorageId)
      || !CONVEX_STORAGE_ID_SHAPE.test(update.motionPosterStorageId)
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

export async function getResolvedByIdHandler(
  ctx: QueryCtx,
  args: GetResolvedByIdArgs,
) {
  await requireAuth(ctx, args.apiKey, "replicationMaintenance");
  const replication = await ctx.db.get(args.id);
  if (!replication) return null;
  const resolved = await resolveReplicationUrls(ctx, replication);
  return { ...replication, ...resolved };
}

export async function applySourceRecoveryHandler(
  ctx: MutationCtx,
  args: ApplySourceRecoveryArgs,
) {
  await requireAuth(ctx, args.apiKey, "replicationMaintenance");
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
  await requireAuth(ctx, args.apiKey, "replicationMaintenance");
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
  await requireAuth(ctx, args.apiKey, "replicationMaintenance");
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
  await requireAuth(ctx, args.apiKey, "replicationMaintenance");
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
