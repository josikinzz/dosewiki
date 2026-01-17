import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

/**
 * Replication functions for video and image replications of effects.
 *
 * Replications are stored with Convex file storage IDs.
 * Storage URLs are generated on-the-fly using ctx.storage.getUrl().
 */

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

    // Attach storage URLs (gracefully handle placeholder/invalid storage IDs)
    let url = null;
    let thumbnail_url = null;
    try {
      url = await ctx.storage.getUrl(replication.storage_id);
    } catch (e) {
      // Storage ID might be a placeholder
    }
    if (replication.thumbnail_storage_id) {
      try {
        thumbnail_url = await ctx.storage.getUrl(replication.thumbnail_storage_id);
      } catch (e) {
        // Storage ID might be a placeholder
      }
    }

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
 */
export const getReplicationsByEffect = query({
  args: { effect_slug: v.string() },
  handler: async (ctx, args) => {
    const replications = await ctx.db
      .query("replications")
      .withIndex("by_effect", (q) => q.eq("effect_slug", args.effect_slug))
      .collect();

    // Attach storage URLs to each replication (gracefully handle invalid IDs)
    return Promise.all(
      replications.map(async (rep) => {
        let url = null;
        let thumbnail_url = null;
        try {
          url = await ctx.storage.getUrl(rep.storage_id);
        } catch (e) {
          // Storage ID might be a placeholder
        }
        if (rep.thumbnail_storage_id) {
          try {
            thumbnail_url = await ctx.storage.getUrl(rep.thumbnail_storage_id);
          } catch (e) {
            // Storage ID might be a placeholder
          }
        }
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
 */
export const getByArtist = query({
  args: { artist: v.string() },
  handler: async (ctx, args) => {
    const replications = await ctx.db
      .query("replications")
      .withIndex("by_artist", (q) => q.eq("artist", args.artist))
      .collect();

    // Attach storage URLs (gracefully handle invalid IDs)
    return Promise.all(
      replications.map(async (rep) => {
        let url = null;
        let thumbnail_url = null;
        try {
          url = await ctx.storage.getUrl(rep.storage_id);
        } catch (e) {
          // Storage ID might be a placeholder
        }
        if (rep.thumbnail_storage_id) {
          try {
            thumbnail_url = await ctx.storage.getUrl(rep.thumbnail_storage_id);
          } catch (e) {
            // Storage ID might be a placeholder
          }
        }
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
 */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Insert a single replication.
 */
export const insertReplication = mutation({
  args: {
    slug: v.string(),
    title: v.string(),
    artist: v.string(),
    artist_url: v.optional(v.string()),
    type: v.union(v.literal("video"), v.literal("image")),
    storage_id: v.string(),
    effect_slug: v.string(),
    thumbnail_storage_id: v.optional(v.string()),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    format: v.string(),
    file_size: v.optional(v.number()),
    duration: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const replicationId = await ctx.db.insert("replications", {
      ...args,
      created_at: new Date().toISOString(),
    });
    return replicationId;
  },
});

/**
 * Bulk import replications (for migration).
 */
export const bulkImport = mutation({
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
 */
export const updateGalleryOrder = mutation({
  args: {
    effect_slug: v.string(),
    replication_slugs: v.array(v.string()),
  },
  handler: async (ctx, args) => {
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
 */
export const deleteBySlug = mutation({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
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
 */
export const updateEffectSlug = mutation({
  args: {
    slug: v.string(),
    effect_slug: v.string(),
  },
  handler: async (ctx, args) => {
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
 * Delete all replications (for re-migration).
 */
export const deleteAll = mutation({
  args: {},
  handler: async (ctx) => {
    const allReplications = await ctx.db.query("replications").collect();

    for (const rep of allReplications) {
      await ctx.db.delete(rep._id);
    }

    return { deleted: allReplications.length };
  },
});
