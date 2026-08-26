import type { MutationCtx } from "../_generated/server";
import { requireAuth } from "./auth";
import { KEBAB_CASE, normalizeEffectTags } from "./replicationPolicy";
import { isPlaceholderStorageId } from "./replicationUrls";
import type {
  BulkImportArgs,
  DeleteAuditedRowArgs,
  DeleteBySlugArgs,
  InsertMediaAssetArgs,
  InsertReplicationArgs,
  RenameSlugArgs,
  SetAudioPresenceArgs,
  UpdateDeliveredFileSizeArgs,
  UpdateEffectSlugArgs,
  UpdateGalleryOrderArgs,
  UpdateStorageIdsArgs,
  UpdateUrlArgs,
} from "./replicationValidators";

export async function generateUploadUrlHandler(
  ctx: MutationCtx,
  args: { apiKey?: string },
) {
  await requireAuth(ctx, args.apiKey, "replicationMaintenance");
  return await ctx.storage.generateUploadUrl();
}

export async function insertReplicationHandler(
  ctx: MutationCtx,
  args: InsertReplicationArgs,
) {
  await requireAuth(ctx, args.apiKey, "replicationMaintenance");
  const { apiKey: _apiKey, ...replicationData } = args;
  return await ctx.db.insert("replications", {
    ...replicationData,
    created_at: new Date().toISOString(),
  });
}

export async function insertMediaAssetHandler(
  ctx: MutationCtx,
  args: InsertMediaAssetArgs,
) {
  await requireAuth(ctx, args.apiKey, "replicationMaintenance");
  const { apiKey: _apiKey, ...row } = args;

  if (!KEBAB_CASE.test(row.slug)) {
    throw new Error(`Media asset slug is not kebab-case: ${row.slug}`);
  }
  if (row.title.trim().length === 0 || row.artist.trim().length === 0) {
    throw new Error(`Media asset ${row.slug} needs a non-blank title and artist.`);
  }

  const collision = await ctx.db
    .query("replications")
    .withIndex("by_slug", (q) => q.eq("slug", row.slug))
    .first();
  if (collision) {
    throw new Error(`Media asset slug already in use: ${row.slug} (${collision._id}).`);
  }
  if (isPlaceholderStorageId(row.storage_id) && !row.url) {
    throw new Error(
      `Media asset ${row.slug} has no real storage_id and no url to fall back on.`,
    );
  }
  if (row.format !== row.format.trim().toLowerCase() || row.format.length === 0) {
    throw new Error(`Media asset ${row.slug} format must be lowercase and non-blank.`);
  }
  if (row.format.startsWith(".")) {
    throw new Error(
      `Media asset ${row.slug} format must omit the leading dot: ${row.format}`,
    );
  }

  if (row.effect_slug !== undefined) {
    if (!KEBAB_CASE.test(row.effect_slug)) {
      throw new Error(`Media asset effect_slug is not kebab-case: ${row.effect_slug}`);
    }
    const effect = await ctx.db
      .query("subjectiveEffects")
      .withIndex("by_slug", (q) => q.eq("slug", row.effect_slug as string))
      .first();
    if (!effect) {
      throw new Error(
        `Media asset ${row.slug} points at an effect that does not exist: ${row.effect_slug}. `
          + "Omit effect_slug for assets with no owning effect.",
      );
    }
  }

  for (const [key, value] of [
    ["width", row.width],
    ["height", row.height],
    ["file_size", row.file_size],
    ["duration", row.duration],
  ] as const) {
    if (value !== undefined && (!Number.isFinite(value) || value <= 0)) {
      throw new Error(`Media asset ${row.slug} has a non-positive ${key}: ${value}`);
    }
  }
  if (row.type === "image" && row.duration !== undefined) {
    throw new Error(`Media asset ${row.slug} is an image and cannot have a duration.`);
  }

  const effectTags = row.effect_tags
    ? normalizeEffectTags(row.effect_tags)
    : undefined;
  const id = await ctx.db.insert("replications", {
    ...row,
    effect_tags: effectTags && effectTags.length > 0 ? effectTags : undefined,
    created_at: new Date().toISOString(),
  });
  return { inserted: true, id, slug: row.slug, role: row.role };
}

export async function bulkImportHandler(ctx: MutationCtx, args: BulkImportArgs) {
  const results = { created: 0, updated: 0, errors: [] as string[] };
  for (const replication of args.replications) {
    try {
      const existing = await ctx.db
        .query("replications")
        .withIndex("by_slug", (q) => q.eq("slug", replication.slug))
        .first();
      if (existing) {
        await ctx.db.patch(existing._id, {
          ...replication,
          created_at: existing.created_at,
        });
        results.updated++;
      } else {
        await ctx.db.insert("replications", {
          ...replication,
          created_at: new Date().toISOString(),
        });
        results.created++;
      }
    } catch (error) {
      results.errors.push(
        `Failed to import ${replication.slug}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  return results;
}

export async function updateGalleryOrderHandler(
  ctx: MutationCtx,
  args: UpdateGalleryOrderArgs,
) {
  await requireAuth(ctx, args.apiKey, "replicationMaintenance");
  const effect = await ctx.db
    .query("subjectiveEffects")
    .withIndex("by_slug", (q) => q.eq("slug", args.effect_slug))
    .first();
  if (!effect) throw new Error(`Effect not found: ${args.effect_slug}`);
  if (
    args.expected_replication_slugs !== undefined &&
    JSON.stringify(effect.gallery_order ?? []) !==
      JSON.stringify(args.expected_replication_slugs)
  ) {
    return {
      status: "conflict" as const,
      server: effect.gallery_order ?? [],
    };
  }

  await ctx.db.patch(effect._id, { gallery_order: args.replication_slugs });
  return { status: "ok" as const };
}

export async function renameSlugHandler(ctx: MutationCtx, args: RenameSlugArgs) {
  await requireAuth(ctx, args.apiKey, "replicationMaintenance");
  if (args.from === args.to) {
    return { success: true, renamed: false, galleryOrdersPatched: 0 };
  }
  if (!KEBAB_CASE.test(args.to)) {
    throw new Error(`Target slug is not kebab-case: ${args.to}`);
  }

  const replication = args.id
    ? await ctx.db.get(args.id)
    : await ctx.db
        .query("replications")
        .withIndex("by_slug", (q) => q.eq("slug", args.from))
        .first();
  if (!replication) throw new Error(`Replication not found: ${args.id ?? args.from}`);
  if (replication.slug !== args.from) {
    throw new Error(
      `Replication ${replication._id} holds slug ${replication.slug}, not ${args.from}`,
    );
  }

  const collision = await ctx.db
    .query("replications")
    .withIndex("by_slug", (q) => q.eq("slug", args.to))
    .first();
  if (collision) throw new Error(`Target slug already in use: ${args.to}`);

  await ctx.db.patch(replication._id, { slug: args.to });
  const effects = await ctx.db.query("subjectiveEffects").collect();
  let galleryOrdersPatched = 0;
  for (const effect of effects) {
    if (!effect.gallery_order?.includes(args.from)) continue;
    await ctx.db.patch(effect._id, {
      gallery_order: effect.gallery_order.map((slug) =>
        slug === args.from ? args.to : slug,
      ),
    });
    galleryOrdersPatched += 1;
  }
  return { success: true, renamed: true, galleryOrdersPatched };
}

export async function deleteBySlugHandler(
  ctx: MutationCtx,
  args: DeleteBySlugArgs,
) {
  await requireAuth(ctx, args.apiKey, "replicationMaintenance");
  const replication = await ctx.db
    .query("replications")
    .withIndex("by_slug", (q) => q.eq("slug", args.slug))
    .first();
  if (!replication) throw new Error(`Replication not found: ${args.slug}`);

  await ctx.db.delete(replication._id);
  return { success: true };
}

export async function deleteAuditedRowHandler(
  ctx: MutationCtx,
  args: DeleteAuditedRowArgs,
) {
  await requireAuth(ctx, args.apiKey, "replicationMaintenance");
  const replication = await ctx.db.get(args.id);
  if (
    !replication
    || replication.slug !== args.expectedSlug
    || replication.title !== args.expectedTitle
    || replication.artist !== args.expectedArtist
    || replication.storage_id !== args.expectedStorageId
  ) {
    throw new Error(`Audited replication deletion precondition failed: ${args.expectedSlug}`);
  }
  if (args.requireDuplicate) {
    const twins = await ctx.db
      .query("replications")
      .withIndex("by_slug", (q) => q.eq("slug", args.expectedSlug))
      .collect();
    if (!twins.some((twin) => twin._id !== replication._id)) {
      throw new Error(`Audited replication duplicate no longer exists: ${args.expectedSlug}`);
    }
  }
  const [effects, galleries, playlists, dateResearch, taxonomyEvidence] = await Promise.all([
    ctx.db.query("subjectiveEffects").collect(),
    ctx.db.query("substanceGalleries").collect(),
    ctx.db.query("replicationPlaylists").collect(),
    ctx.db
      .query("replicationDateResearch")
      .withIndex("by_replication_id", (q) => q.eq("replication_id", replication._id))
      .collect(),
    ctx.db
      .query("replicationTaxonomyEvidence")
      .withIndex("by_replication_id", (q) => q.eq("replication_id", replication._id))
      .collect(),
  ]);
  const updatedAt = new Date().toISOString();
  let effectGalleryOrders = 0;
  let substanceGalleries = 0;
  let replicationPlaylists = 0;

  for (const effect of effects) {
    if (!effect.gallery_order?.includes(replication.slug)) continue;
    await ctx.db.patch(effect._id, {
      gallery_order: effect.gallery_order.filter((slug) => slug !== replication.slug),
    });
    effectGalleryOrders += 1;
  }
  for (const gallery of galleries) {
    if (
      !gallery.curated_slugs.includes(replication.slug)
      && !gallery.removed_slugs.includes(replication.slug)
    ) {
      continue;
    }
    await ctx.db.patch(gallery._id, {
      curated_slugs: gallery.curated_slugs.filter((slug) => slug !== replication.slug),
      removed_slugs: gallery.removed_slugs.filter((slug) => slug !== replication.slug),
      updated_at: updatedAt,
      updated_by: "audited-replication-deletion",
    });
    substanceGalleries += 1;
  }
  for (const playlist of playlists) {
    if (!playlist.replication_slugs.includes(replication.slug)) continue;
    await ctx.db.patch(playlist._id, {
      replication_slugs: playlist.replication_slugs.filter((slug) => slug !== replication.slug),
      updated_at: updatedAt,
      updated_by: "audited-replication-deletion",
    });
    replicationPlaylists += 1;
  }
  for (const row of dateResearch) await ctx.db.delete(row._id);
  for (const row of taxonomyEvidence) await ctx.db.delete(row._id);
  await ctx.db.delete(replication._id);
  return {
    deleted: true,
    slug: replication.slug,
    referencesRemoved: {
      effectGalleryOrders,
      substanceGalleries,
      replicationPlaylists,
      dateResearch: dateResearch.length,
      taxonomyEvidence: taxonomyEvidence.length,
    },
  };
}

export async function updateEffectSlugHandler(
  ctx: MutationCtx,
  args: UpdateEffectSlugArgs,
) {
  await requireAuth(ctx, args.apiKey, "replicationMaintenance");
  const replication = await ctx.db
    .query("replications")
    .withIndex("by_slug", (q) => q.eq("slug", args.slug))
    .first();
  if (!replication) throw new Error(`Replication not found: ${args.slug}`);

  await ctx.db.patch(replication._id, { effect_slug: args.effect_slug });
  return { success: true };
}

export async function updateUrlHandler(ctx: MutationCtx, args: UpdateUrlArgs) {
  await requireAuth(ctx, args.apiKey, "replicationMaintenance");
  const updates: { url: string; thumbnail_url?: string } = { url: args.url };
  if (args.thumbnail_url) updates.thumbnail_url = args.thumbnail_url;
  await ctx.db.patch(args.id, updates);
  return { success: true };
}

export async function updateDeliveredFileSizeHandler(
  ctx: MutationCtx,
  args: UpdateDeliveredFileSizeArgs,
) {
  await requireAuth(ctx, args.apiKey, "replicationMaintenance");
  if (!Number.isFinite(args.file_size) || args.file_size <= 0) {
    throw new Error("file_size must be a positive number of bytes.");
  }

  const replication = await ctx.db.get(args.id);
  if (!replication) throw new Error(`Replication ${args.id} not found.`);
  if (replication.storage_id !== args.expectedStorageId) {
    throw new Error(
      `Replication ${replication.slug} has been repointed since it was measured `
        + `(expected storage ${args.expectedStorageId}, found ${replication.storage_id}).`,
    );
  }

  const previous = replication.file_size ?? null;
  await ctx.db.patch(args.id, { file_size: args.file_size });
  return { success: true, slug: replication.slug, previous, current: args.file_size };
}

const AUDIO_PRESENCE_BATCH_LIMIT = 250;

export async function setAudioPresenceHandler(
  ctx: MutationCtx,
  args: SetAudioPresenceArgs,
) {
  await requireAuth(ctx, args.apiKey, "replicationMaintenance");
  if (args.entries.length === 0) {
    throw new Error("setAudioPresence needs at least one entry.");
  }
  if (args.entries.length > AUDIO_PRESENCE_BATCH_LIMIT) {
    throw new Error(
      `setAudioPresence may touch at most ${AUDIO_PRESENCE_BATCH_LIMIT} rows `
        + `per call (got ${args.entries.length}).`,
    );
  }

  const updatedSlugs: string[] = [];
  for (const entry of args.entries) {
    const row = await ctx.db.get(entry.id);
    if (!row) throw new Error(`Replication ${entry.id} not found.`);
    await ctx.db.patch(entry.id, { has_audio: entry.has_audio });
    updatedSlugs.push(row.slug);
  }
  return { success: true, updated: updatedSlugs.length, slugs: updatedSlugs };
}

export async function updateStorageIdsHandler(
  ctx: MutationCtx,
  args: UpdateStorageIdsArgs,
) {
  await requireAuth(ctx, args.apiKey, "replicationMaintenance");
  const updates: { storage_id: string; thumbnail_storage_id?: string } = {
    storage_id: args.storage_id,
  };
  if (args.thumbnail_storage_id) {
    updates.thumbnail_storage_id = args.thumbnail_storage_id;
  }
  await ctx.db.patch(args.id, updates);
  return { success: true };
}

export async function deleteAllHandler(ctx: MutationCtx) {
  const replications = await ctx.db.query("replications").collect();
  for (const replication of replications) {
    await ctx.db.delete(replication._id);
  }
  return { deleted: replications.length };
}
