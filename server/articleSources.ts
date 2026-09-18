import { v } from "../lib/postgres/runtime/values";
import { query } from "../lib/postgres/runtime/server";
import { mutation } from "./lib/indexedMutation";
import { requireRole } from "./lib/auth";

/**
 * Article source functions.
 * 
 * These functions provide read-only access to scraped source content per substance.
 * Data is populated via a one-time migration and not editable via UI.
 */

function actorArgs(args: { apiKey?: string; actorEmail?: string }) {
  return { apiKey: args.apiKey, actorEmail: args.actorEmail };
}

function validateArticleSourcePayload(source: {
  slug: string;
  sources: Array<{ id: string }>;
  contents: Record<string, string>;
}) {
  const sourceIds = new Set(source.sources.map((entry) => entry.id));
  const contentKeys = new Set(Object.keys(source.contents));
  const errors: string[] = [];

  for (const sourceId of sourceIds) {
    if (!contentKeys.has(sourceId)) errors.push(`missing content for source id: ${sourceId}`);
  }
  for (const key of contentKeys) {
    if (!sourceIds.has(key)) errors.push(`extra content for source id: ${key}`);
  }

  if (errors.length > 0) {
    throw new Error(`Invalid article source document (${source.slug}): ${errors.join("; ")}`);
  }
}

/**
 * Get article sources for a specific substance by slug.
 */
export const getBySlug = query({
  args: { slug: v.string(), apiKey: v.optional(v.string()), actorEmail: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireRole(ctx, { ...actorArgs(args), adminIntent: "articleSourceMigration" }, "editor");
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
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, { ...actorArgs(args), adminIntent: "articleSourceMigration" }, "editor");
    const limit = args.limit ?? 100;

    const query = ctx.db.query("articleSources");

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
  args: { apiKey: v.optional(v.string()), actorEmail: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireRole(ctx, { ...actorArgs(args), adminIntent: "articleSourceMigration" }, "editor");
    return await ctx.db.query("articleSources").collect();
  },
});

/**
 * Bulk import article sources (one-time migration).
 */
export const bulkImport = mutation({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
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
      contents: v.record(v.string(), v.string()),
    })),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, { ...actorArgs(args), adminIntent: "articleSourceMigration" }, "admin");

    const results = {
      created: 0,
      updated: 0,
      errors: [] as string[],
    };

    for (const source of args.sources) {
      try {
        validateArticleSourcePayload(source);
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
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    slug: v.string(),
    substanceName: v.string(),
    sources: v.array(v.object({
      id: v.string(),
      fileName: v.string(),
      displayName: v.string(),
      size: v.number(),
      tokens: v.number(),
    })),
    contents: v.record(v.string(), v.string()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, { ...actorArgs(args), adminIntent: "articleSourceMigration" }, "admin");

    const { apiKey: _apiKey, actorEmail: _actorEmail, ...sourceData } = args;
    validateArticleSourcePayload(sourceData);

    // Check if source with this slug already exists
    const existing = await ctx.db
      .query("articleSources")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, sourceData);
      return { updated: true, id: existing._id };
    }

    const id = await ctx.db.insert("articleSources", sourceData);
    return { updated: false, id };
  },
});
