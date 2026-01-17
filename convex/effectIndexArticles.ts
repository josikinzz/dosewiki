import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

/**
 * Get all EffectIndex articles.
 */
export const getAll = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("effectIndexArticles").collect();
  },
});

/**
 * Get a single EffectIndex article by slug.
 */
export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("effectIndexArticles")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
  },
});

/**
 * Get EffectIndex articles by tag.
 */
export const getByTag = query({
  args: { tag: v.string() },
  handler: async (ctx, args) => {
    const all = await ctx.db.query("effectIndexArticles").collect();
    return all.filter((article) => article.tags.includes(args.tag));
  },
});

/**
 * Bulk import EffectIndex articles.
 */
export const bulkImport = mutation({
  args: {
    articles: v.array(
      v.object({
        slug: v.string(),
        title: v.string(),
        tags: v.array(v.string()),
        featured: v.optional(v.boolean()),
        shortDescription: v.optional(v.string()),
        publicationDate: v.optional(v.string()),
        body_raw: v.string(),
        body_ast: v.optional(v.any()),
        authors: v.optional(v.array(v.string())),
        citations: v.optional(
          v.array(
            v.object({
              url: v.string(),
              text: v.string(),
            })
          )
        ),
      })
    ),
  },
  handler: async (ctx, args) => {
    const results = {
      created: 0,
      updated: 0,
      errors: [] as string[],
    };

    for (const article of args.articles) {
      try {
        // Check if article already exists
        const existing = await ctx.db
          .query("effectIndexArticles")
          .withIndex("by_slug", (q) => q.eq("slug", article.slug))
          .first();

        if (existing) {
          // Update existing article
          await ctx.db.patch(existing._id, article);
          results.updated++;
        } else {
          // Create new article
          await ctx.db.insert("effectIndexArticles", article);
          results.created++;
        }
      } catch (error) {
        results.errors.push(
          `Failed to import ${article.slug}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    return results;
  },
});
