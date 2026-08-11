import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { requireAuth } from "./lib/auth";

/**
 * Replication functions for video and image replications of effects.
 *
 * Replications are stored with Convex file storage IDs.
 * Storage URLs are generated on-the-fly using ctx.storage.getUrl().
 */

const replicationRightsStatus = v.union(
  v.literal("creator-retained"),
  v.literal("explicit-license"),
  v.literal("unknown"),
  v.literal("permission-granted"),
  v.literal("public-domain"),
);

const replicationRightsFields = {
  rights_status: v.optional(replicationRightsStatus),
  license_name: v.optional(v.string()),
  license_url: v.optional(v.string()),
  credit_line: v.optional(v.string()),
  source_url: v.optional(v.string()),
  rightsholder: v.optional(v.string()),
  permission_notes: v.optional(v.string()),
  removal_contact: v.optional(v.string()),
};

type ReplicationRightsPatch = {
  rights_status?: "creator-retained" | "explicit-license" | "unknown" | "permission-granted" | "public-domain";
  license_name?: string;
  license_url?: string;
  credit_line?: string;
  source_url?: string;
  rightsholder?: string;
  permission_notes?: string;
  removal_contact?: string;
};

const replicationCreditSnapshot = v.object({
  title: v.string(),
  artist: v.string(),
  artist_url: v.union(v.string(), v.null()),
  credit_line: v.union(v.string(), v.null()),
  source_url: v.union(v.string(), v.null()),
  rightsholder: v.union(v.string(), v.null()),
});

const replicationCreditUpdates = v.object({
  title: v.string(),
  artist: v.string(),
  artist_url: v.optional(v.string()),
  credit_line: v.string(),
  source_url: v.optional(v.string()),
  rightsholder: v.optional(v.string()),
});

function isPlaceholderStorageId(storageId?: string | null) {
  return !storageId || storageId.startsWith("placeholder-");
}

function definedReplicationRightsPatch(updates: ReplicationRightsPatch) {
  const patch: ReplicationRightsPatch = {};

  for (const key of Object.keys(updates) as Array<keyof ReplicationRightsPatch>) {
    const value = updates[key];
    if (value !== undefined) {
      (patch[key] as typeof value) = value;
    }
  }

  return patch;
}

async function resolveReplicationUrls(
  ctx: { storage: { getUrl: (storageId: string) => Promise<string> } },
  rep: {
    storage_id: string;
    thumbnail_storage_id?: string;
    url?: string;
    thumbnail_url?: string;
  }
) {
  let url = null;
  let thumbnail_url = null;

  if (!isPlaceholderStorageId(rep.storage_id)) {
    try {
      url = await ctx.storage.getUrl(rep.storage_id);
    } catch {
      // Storage ID might be invalid or missing
    }
  }

  if (!url && rep.url) {
    url = rep.url;
  }

  if (!isPlaceholderStorageId(rep.thumbnail_storage_id)) {
    try {
      thumbnail_url = await ctx.storage.getUrl(rep.thumbnail_storage_id);
    } catch {
      // Storage ID might be invalid or missing
    }
  }

  if (!thumbnail_url && rep.thumbnail_url) {
    thumbnail_url = rep.thumbnail_url;
  }

  return { url, thumbnail_url };
}

/**
 * Get all replications.
 */
export const getAll = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("replications").collect();
  },
});

/**
 * Get a single replication by slug.
 *
 * URL resolution priority:
 * 1. Direct `url` field (external Convex storage or CDN URLs)
 * 2. Convex storage lookup via `storage_id`
 */
export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const replication = await ctx.db
      .query("replications")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();

    if (!replication) {
      return null;
    }

    const { url, thumbnail_url } = await resolveReplicationUrls(ctx, replication);

    return {
      ...replication,
      url,
      thumbnail_url,
    };
  },
});

/**
 * Get all replications for a specific effect by effect slug.
 * Returns replications with storage URLs attached.
 *
 * URL resolution priority:
 * 1. Direct `url` field (external Convex storage or CDN URLs)
 * 2. Convex storage lookup via `storage_id`
 */
export const getReplicationsByEffect = query({
  args: { effect_slug: v.string() },
  handler: async (ctx, args) => {
    const replications = await ctx.db
      .query("replications")
      .withIndex("by_effect", (q) => q.eq("effect_slug", args.effect_slug))
      .collect();

    return Promise.all(
      replications.map(async (rep) => {
        const { url, thumbnail_url } = await resolveReplicationUrls(ctx, rep);
        return {
          ...rep,
          url,
          thumbnail_url,
        };
      })
    );
  },
});

/**
 * Get all replications by a specific artist.
 *
 * URL resolution priority:
 * 1. Direct `url` field (external Convex storage or CDN URLs)
 * 2. Convex storage lookup via `storage_id`
 */
export const getByArtist = query({
  args: { artist: v.string() },
  handler: async (ctx, args) => {
    const replications = await ctx.db
      .query("replications")
      .withIndex("by_artist", (q) => q.eq("artist", args.artist))
      .collect();

    return Promise.all(
      replications.map(async (rep) => {
        const { url, thumbnail_url } = await resolveReplicationUrls(ctx, rep);
        return {
          ...rep,
          url,
          thumbnail_url,
        };
      })
    );
  },
});

/**
 * Get every replication for the public gallery, with storage URLs resolved and
 * a per-effect `order_index` derived from each effect's `gallery_order`.
 *
 * Powers the /effects Gallery tab, which browses replications across all
 * effects on a per-artist or per-effect basis. Returns the same URL-resolved
 * shape as getReplicationsByEffect, plus `order_index` for intra-effect order.
 */
export const getPublicReplications = query({
  args: {},
  handler: async (ctx) => {
    const replications = await ctx.db.query("replications").collect();

    // Only the effects actually referenced by replications need a gallery_order
    // lookup; resolve each by index instead of scanning the effects table.
    const orderByEffect = new Map<string, Map<string, number>>();
    const referencedSlugs = [...new Set(replications.map((rep) => rep.effect_slug))];
    for (const slug of referencedSlugs) {
      const effect = await ctx.db
        .query("subjectiveEffects")
        .withIndex("by_slug", (q) => q.eq("slug", slug))
        .first();
      if (effect?.gallery_order && effect.gallery_order.length > 0) {
        orderByEffect.set(slug, new Map(effect.gallery_order.map((entry, index) => [entry, index])));
      }
    }

    return Promise.all(
      replications.map(async (rep) => {
        const { url, thumbnail_url } = await resolveReplicationUrls(ctx, rep);
        const order_index = orderByEffect.get(rep.effect_slug)?.get(rep.slug);
        return { ...rep, url, thumbnail_url, order_index };
      }),
    );
  },
});

export const resolveStorageUrls = query({
  args: { storageIds: v.array(v.string()) },
  handler: async (ctx, args) => {
    return await Promise.all(args.storageIds.map((storageId) => ctx.storage.getUrl(storageId)));
  },
});

/**
 * Generate an upload URL for file storage.
 * Used by migration scripts to upload media files.
 *
 * @param apiKey - Required API key for authentication
 */
export const generateUploadUrl = mutation({
  args: {
    apiKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.apiKey, "replicationMaintenance");
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Insert a single replication.
 *
 * @param apiKey - Required API key for authentication
 */
export const insertReplication = mutation({
  args: {
    apiKey: v.optional(v.string()),
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
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.apiKey, "replicationMaintenance");

    const { apiKey: _apiKey, ...replicationData } = args;
    const replicationId = await ctx.db.insert("replications", {
      ...replicationData,
      created_at: new Date().toISOString(),
    });
    return replicationId;
  },
});

/**
 * Internal mutation: Bulk import replications (for migration).
 * Not exposed to clients.
 */
export const bulkImport = internalMutation({
  args: {
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
      })
    ),
  },
  handler: async (ctx, args) => {
    const results = {
      created: 0,
      updated: 0,
      errors: [] as string[],
    };

    for (const rep of args.replications) {
      try {
        // Check if replication already exists by slug
        const existing = await ctx.db
          .query("replications")
          .withIndex("by_slug", (q) => q.eq("slug", rep.slug))
          .first();

        if (existing) {
          // Update existing replication
          await ctx.db.patch(existing._id, {
            ...rep,
            created_at: existing.created_at,
          });
          results.updated++;
        } else {
          // Create new replication
          await ctx.db.insert("replications", {
            ...rep,
            created_at: new Date().toISOString(),
          });
          results.created++;
        }
      } catch (error) {
        results.errors.push(
          `Failed to import ${rep.slug}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    return results;
  },
});

/**
 * Update gallery order for an effect.
 * Takes an array of replication slugs in the desired order.
 *
 * @param apiKey - Required API key for authentication
 */
export const updateGalleryOrder = mutation({
  args: {
    apiKey: v.optional(v.string()),
    effect_slug: v.string(),
    replication_slugs: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.apiKey, "replicationMaintenance");

    // Update the effect's gallery_order in subjectiveEffects
    const effect = await ctx.db
      .query("subjectiveEffects")
      .withIndex("by_slug", (q) => q.eq("slug", args.effect_slug))
      .first();

    if (!effect) {
      throw new Error(`Effect not found: ${args.effect_slug}`);
    }

    await ctx.db.patch(effect._id, {
      gallery_order: args.replication_slugs,
    });

    return { success: true };
  },
});

/**
 * Rename a replication's slug.
 *
 * The slug is the replication's public URL and is also how an effect's
 * `gallery_order` references it, so both move together in one transaction — a
 * rename that left `gallery_order` pointing at the old value would silently drop
 * the item out of its curated position.
 *
 * Refuses to overwrite an existing slug; the caller is expected to have already
 * resolved collisions when planning the rename.
 *
 * @param apiKey - Required API key for authentication
 */
export const renameSlug = mutation({
  args: {
    apiKey: v.optional(v.string()),
    from: v.string(),
    to: v.string(),
    /**
     * Which row to move when `from` is held by more than one. Without it the
     * slug lookup takes the first match, so a duplicated slug would be renamed
     * arbitrarily and its twin left behind.
     */
    id: v.optional(v.id("replications")),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.apiKey, "replicationMaintenance");

    if (args.from === args.to) {
      return { success: true, renamed: false, galleryOrdersPatched: 0 };
    }

    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(args.to)) {
      throw new Error(`Target slug is not kebab-case: ${args.to}`);
    }

    const replication = args.id
      ? await ctx.db.get(args.id)
      : await ctx.db
          .query("replications")
          .withIndex("by_slug", (q) => q.eq("slug", args.from))
          .first();

    if (!replication) {
      throw new Error(`Replication not found: ${args.id ?? args.from}`);
    }

    if (replication.slug !== args.from) {
      throw new Error(
        `Replication ${replication._id} holds slug ${replication.slug}, not ${args.from}`,
      );
    }

    const collision = await ctx.db
      .query("replications")
      .withIndex("by_slug", (q) => q.eq("slug", args.to))
      .first();

    if (collision) {
      throw new Error(`Target slug already in use: ${args.to}`);
    }

    await ctx.db.patch(replication._id, { slug: args.to });

    // Only the owning effect can reference this slug in gallery_order, but scan
    // defensively: a mis-assigned row would otherwise keep a stale reference.
    const effects = await ctx.db.query("subjectiveEffects").collect();
    let galleryOrdersPatched = 0;

    for (const effect of effects) {
      if (!effect.gallery_order?.includes(args.from)) {
        continue;
      }

      await ctx.db.patch(effect._id, {
        gallery_order: effect.gallery_order.map((slug) =>
          slug === args.from ? args.to : slug,
        ),
      });
      galleryOrdersPatched += 1;
    }

    return { success: true, renamed: true, galleryOrdersPatched };
  },
});

/**
 * Delete a replication by slug.
 *
 * @param apiKey - Required API key for authentication
 */
export const deleteBySlug = mutation({
  args: {
    apiKey: v.optional(v.string()),
    slug: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.apiKey, "replicationMaintenance");

    const replication = await ctx.db
      .query("replications")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();

    if (!replication) {
      throw new Error(`Replication not found: ${args.slug}`);
    }

    // Delete from storage
    if (replication.storage_id) {
      try {
        // Note: Convex storage deletion is handled automatically when no documents reference the file
        // We don't need to explicitly delete from storage
      } catch (error) {
        console.error(
          `Warning: Could not delete storage file ${replication.storage_id}:`,
          error
        );
      }
    }

    // Delete from database
    await ctx.db.delete(replication._id);
    return { success: true };
  },
});

/**
 * Delete one explicitly reviewed broken or test row by exact identity. Duplicate
 * cleanup additionally proves another row with the same slug still exists.
 */
export const deleteAuditedRow = mutation({
  args: {
    apiKey: v.optional(v.string()),
    id: v.id("replications"),
    expectedSlug: v.string(),
    expectedTitle: v.string(),
    expectedArtist: v.string(),
    expectedStorageId: v.string(),
    requireDuplicate: v.boolean(),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.apiKey, "replicationMaintenance");
    const replication = await ctx.db.get(args.id);
    if (
      !replication ||
      replication.slug !== args.expectedSlug ||
      replication.title !== args.expectedTitle ||
      replication.artist !== args.expectedArtist ||
      replication.storage_id !== args.expectedStorageId
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
    await ctx.db.delete(replication._id);
    return { deleted: true, slug: replication.slug };
  },
});

/**
 * Update the effect_slug for a replication by its slug.
 *
 * @param apiKey - Required API key for authentication
 */
export const updateEffectSlug = mutation({
  args: {
    apiKey: v.optional(v.string()),
    slug: v.string(),
    effect_slug: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.apiKey, "replicationMaintenance");

    const rep = await ctx.db
      .query("replications")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();

    if (!rep) {
      throw new Error(`Replication not found: ${args.slug}`);
    }

    await ctx.db.patch(rep._id, { effect_slug: args.effect_slug });
    return { success: true };
  },
});

/**
 * Update the URL for a replication by its _id.
 * Used by migration scripts to set direct URLs for external storage.
 *
 * @param apiKey - Required API key for authentication
 */
export const updateUrl = mutation({
  args: {
    apiKey: v.optional(v.string()),
    id: v.id("replications"),
    url: v.string(),
    thumbnail_url: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.apiKey, "replicationMaintenance");

    const updates: { url: string; thumbnail_url?: string } = { url: args.url };
    if (args.thumbnail_url) {
      updates.thumbnail_url = args.thumbnail_url;
    }
    await ctx.db.patch(args.id, updates);
    return { success: true };
  },
});

/**
 * Update storage IDs for a replication by its _id.
 * Used by migration scripts to point to locally uploaded media.
 *
 * @param apiKey - Required API key for authentication
 */
export const updateStorageIds = mutation({
  args: {
    apiKey: v.optional(v.string()),
    id: v.id("replications"),
    storage_id: v.string(),
    thumbnail_storage_id: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.apiKey, "replicationMaintenance");

    const updates: { storage_id: string; thumbnail_storage_id?: string } = {
      storage_id: args.storage_id,
    };
    if (args.thumbnail_storage_id) {
      updates.thumbnail_storage_id = args.thumbnail_storage_id;
    }
    await ctx.db.patch(args.id, updates);
    return { success: true };
  },
});

/** Replace a reviewed source asset while failing closed if the audit is stale. */
export const applySourceRecovery = mutation({
  args: {
    apiKey: v.optional(v.string()),
    id: v.id("replications"),
    expectedStorageId: v.string(),
    expectedSourceUrl: v.union(v.string(), v.null()),
    storageId: v.string(),
    sourceUrl: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.apiKey, "replicationMaintenance");
    const replication = await ctx.db.get(args.id);
    if (!replication) throw new Error("Replication source recovery target no longer exists.");
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
  },
});

/**
 * Atomically transfer native storage to an assigned-effect row and remove its
 * audited unknown-effect twin. Exact IDs and expected values make reruns fail
 * closed if either row changed after the dry run.
 */
export const mergeUnknownTwin = mutation({
  args: {
    apiKey: v.optional(v.string()),
    keeperId: v.id("replications"),
    duplicateId: v.id("replications"),
    expectedSlug: v.string(),
    expectedKeeperEffectSlug: v.string(),
    expectedDuplicateStorageId: v.string(),
    duplicateThumbnailStorageId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.apiKey, "replicationMaintenance");

    const keeper = await ctx.db.get(args.keeperId);
    const duplicate = await ctx.db.get(args.duplicateId);
    if (!keeper || !duplicate) {
      throw new Error("Replication merge rows no longer exist");
    }
    if (
      keeper.slug !== args.expectedSlug ||
      duplicate.slug !== args.expectedSlug ||
      keeper.effect_slug !== args.expectedKeeperEffectSlug ||
      duplicate.effect_slug !== "unknown" ||
      duplicate.storage_id !== args.expectedDuplicateStorageId ||
      !keeper.storage_id.startsWith("placeholder-")
    ) {
      throw new Error(`Replication merge precondition failed: ${args.expectedSlug}`);
    }
    if (
      args.duplicateThumbnailStorageId !== undefined &&
      duplicate.thumbnail_storage_id !== args.duplicateThumbnailStorageId
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
  },
});

/**
 * Apply one reviewed title/creator correction to an exact row. The complete
 * current credit snapshot is compared before patching so stale proposals fail
 * closed and duplicate slugs cannot redirect a correction to the wrong row.
 */
export const applyProvenanceCorrection = mutation({
  args: {
    apiKey: v.optional(v.string()),
    id: v.id("replications"),
    expected: replicationCreditSnapshot,
    updates: replicationCreditUpdates,
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.apiKey, "replicationMaintenance");

    const replication = await ctx.db.get(args.id);
    if (!replication) {
      throw new Error("Replication provenance row no longer exists");
    }

    const current = {
      title: replication.title,
      artist: replication.artist,
      artist_url: replication.artist_url ?? null,
      credit_line: replication.credit_line ?? null,
      source_url: replication.source_url ?? null,
      rightsholder: replication.rightsholder ?? null,
    };
    const snapshotMatches =
      current.title === args.expected.title &&
      current.artist === args.expected.artist &&
      current.artist_url === args.expected.artist_url &&
      current.credit_line === args.expected.credit_line &&
      current.source_url === args.expected.source_url &&
      current.rightsholder === args.expected.rightsholder;
    if (!snapshotMatches) {
      throw new Error(`Replication provenance precondition failed: ${replication.slug}`);
    }

    await ctx.db.patch(replication._id, args.updates);
    return { updated: true, slug: replication.slug };
  },
});

/**
 * Update rights and credit metadata for a replication by slug.
 *
 * @param apiKey - Required API key for authentication
 */
export const updateRightsMetadata = mutation({
  args: {
    apiKey: v.optional(v.string()),
    slug: v.string(),
    updates: v.object(replicationRightsFields),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.apiKey, "replicationMaintenance");

    const replication = await ctx.db
      .query("replications")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();

    if (!replication) {
      throw new Error(`Replication not found: ${args.slug}`);
    }

    const patch = definedReplicationRightsPatch(args.updates);
    if (Object.keys(patch).length === 0) {
      return { success: true, updated: false };
    }

    await ctx.db.patch(replication._id, patch);
    return { success: true, updated: true };
  },
});

/**
 * Internal mutation: Delete all replications (for re-migration).
 * Not exposed to clients.
 */
export const deleteAll = internalMutation({
  args: {},
  handler: async (ctx) => {
    const allReplications = await ctx.db.query("replications").collect();

    for (const rep of allReplications) {
      await ctx.db.delete(rep._id);
    }

    return { deleted: allReplications.length };
  },
});
