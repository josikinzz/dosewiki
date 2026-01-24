import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { requireAuth } from "./lib/auth";

/**
 * Replication functions for video and image replications of effects.
 *
 * Replications are stored with Convex file storage IDs.
 * Storage URLs are generated on-the-fly using ctx.storage.getUrl().
 */

function isPlaceholderStorageId(storageId?: string | null) {
  return !storageId || storageId.startsWith("placeholder-");
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
    } catch (e) {
      // Storage ID might be invalid or missing
    }
  }

  if (!url && rep.url) {
    url = rep.url;
  }

  if (!isPlaceholderStorageId(rep.thumbnail_storage_id)) {
    try {
      thumbnail_url = await ctx.storage.getUrl(rep.thumbnail_storage_id);
    } catch (e) {
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
    requireAuth(ctx, args.apiKey);
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
  },
  handler: async (ctx, args) => {
    requireAuth(ctx, args.apiKey);

    const { apiKey, ...replicationData } = args;
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
    requireAuth(ctx, args.apiKey);

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
    requireAuth(ctx, args.apiKey);

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
    requireAuth(ctx, args.apiKey);

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
    requireAuth(ctx, args.apiKey);

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
    requireAuth(ctx, args.apiKey);

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
