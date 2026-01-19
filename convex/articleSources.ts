import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

const requireAuth = (ctx: { auth?: { userId?: string | null } | null }) => {
  if (!ctx.auth?.userId) {
    throw new Error("Unauthenticated");
  }
};

/**
 * Article source functions.
 * 
 * These functions provide read-only access to scraped source content per substance.
 * Data is populated via a one-time migration and not editable via UI.
 */

/**
 * Get article sources for a specific substance by slug.
 */
export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("articleSources")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
  },
});

/**
 * Get all available substance slugs with pagination.
 * Returns lightweight metadata for building substance list in DevMode.
 */
export const getSubstanceList = query({
  args: {
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 100;

    let query = ctx.db.query("articleSources");

    const results = await query
      .paginate({ numItems: limit, cursor: args.cursor ?? null });

    return {
      items: results.page.map((s) => ({
        slug: s.slug,
        name: s.substanceName,
        sources: s.sources,
      })),
      cursor: results.continueCursor,
      isDone: results.isDone,
    };
  },
});


/**
 * Get all article sources (for migration/sync).
 */
export const getAll = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("articleSources").collect();
  },
});

/**
 * Bulk import article sources (one-time migration).
 */
export const bulkImport = mutation({
  args: {
    sources: v.array(v.object({
      slug: v.string(),
      substanceName: v.string(),
      sources: v.array(v.object({
        id: v.string(),
        fileName: v.string(),
        displayName: v.string(),
        size: v.number(),
        tokens: v.number(),
      })),
      contents: v.any(),
    })),
  },
  handler: async (ctx, args) => {
    requireAuth(ctx);
    const results = {
      created: 0,
      updated: 0,
      errors: [] as string[],
    };

    for (const source of args.sources) {
      try {
        // Check if source with this slug already exists
        const existing = await ctx.db
          .query("articleSources")
          .withIndex("by_slug", (q) => q.eq("slug", source.slug))
          .first();

        if (existing) {
          await ctx.db.patch(existing._id, source);
          results.updated++;
        } else {
          await ctx.db.insert("articleSources", source);
          results.created++;
        }
      } catch (error) {
        results.errors.push(`Source ${source.slug}: ${error}`);
      }
    }

    return results;
  },
});

/**
 * Import a single article source.
 */
export const importOne = mutation({
  args: {
    slug: v.string(),
    substanceName: v.string(),
    sources: v.array(v.object({
      id: v.string(),
      fileName: v.string(),
      displayName: v.string(),
      size: v.number(),
      tokens: v.number(),
    })),
    contents: v.any(),
  },
  handler: async (ctx, args) => {
    requireAuth(ctx);
    // Check if source with this slug already exists
    const existing = await ctx.db
      .query("articleSources")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, args);
      return { updated: true, id: existing._id };
    }

    const id = await ctx.db.insert("articleSources", args);
    return { updated: false, id };
  },
});
