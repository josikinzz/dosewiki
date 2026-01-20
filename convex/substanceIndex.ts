import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

/**
 * Query to get all substances from the index.
 * Returns the complete list of substance articles.
 */
export const getAll = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("substanceIndex").collect();
  },
});

/**
 * Query to get a single substance by its article ID (not Convex _id).
 */
export const getById = query({
  args: { id: v.number() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("substanceIndex")
      .withIndex("by_article_id", (q) => q.eq("id", args.id))
      .first();
  },
});

/**
 * Query to get a single substance by title.
 */
export const getByTitle = query({
  args: { title: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("substanceIndex")
      .withIndex("by_title", (q) => q.eq("title", args.title))
      .first();
  },
});

/**
 * Query to get a single substance by slug.
 * This is the primary lookup for per-article loading.
 */
export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("substanceIndex")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
  },
});

/**
 * Lightweight query that returns only slugs and names.
 * Used for the home page to resolve drug names from slugs
 * without loading full article content (~20KB vs 5MB).
 */
export const getSlugNameMap = query({
  args: {},
  handler: async (ctx) => {
    const articles = await ctx.db.query("substanceIndex").collect();
    return articles.map((a) => ({
      slug: a.slug ?? slugify(a.title),
      name: a.title,
      priority: a.priority ?? "normal",
    }));
  },
});

// Simple slugify function for computing slug from title
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Mutation to save/update a single substance.
 * If a substance with the same ID exists, it updates it. Otherwise, it creates a new one.
 * Automatically computes slug from title if not provided.
 */
export const saveSubstance = mutation({
  args: { article: v.any() },
  handler: async (ctx, args) => {
    const { article } = args;

    // Ensure slug is set
    const articleWithSlug = {
      ...article,
      slug: article.slug ?? slugify(article.title),
    };

    // Check if substance with this ID already exists
    if (articleWithSlug.id !== null) {
      const existing = await ctx.db
        .query("substanceIndex")
        .withIndex("by_article_id", (q) => q.eq("id", articleWithSlug.id))
        .first();

      if (existing) {
        // Update existing substance
        await ctx.db.patch(existing._id, articleWithSlug);
        return { updated: true, id: existing._id };
      }
    }

    // Create new substance
    const id = await ctx.db.insert("substanceIndex", articleWithSlug);
    return { updated: false, id };
  },
});

/**
 * Mutation to save multiple substances at once.
 * Updates existing substances (by article ID) and creates new ones as needed.
 * Automatically computes slug from title if not provided.
 */
export const saveSubstances = mutation({
  args: { articles: v.array(v.any()) },
  handler: async (ctx, args) => {
    const results = {
      created: 0,
      updated: 0,
      errors: [] as string[],
    };

    for (const article of args.articles) {
      try {
        // Ensure slug is set
        const articleWithSlug = {
          ...article,
          slug: article.slug ?? slugify(article.title),
        };

        // Check if substance with this ID already exists
        if (articleWithSlug.id !== null) {
          const existing = await ctx.db
            .query("substanceIndex")
            .withIndex("by_article_id", (q) => q.eq("id", articleWithSlug.id))
            .first();

          if (existing) {
            await ctx.db.patch(existing._id, articleWithSlug);
            results.updated++;
            continue;
          }
        }

        // Create new substance
        await ctx.db.insert("substanceIndex", articleWithSlug);
        results.created++;
      } catch (error) {
        results.errors.push(`Substance ${article.title}: ${error}`);
      }
    }

    return results;
  },
});

/**
 * Mutation to replace ALL substances (bulk import/sync).
 * Deletes all existing substances and inserts the new set.
 * Automatically computes slug from title if not provided.
 * Use with caution!
 */
export const replaceAllSubstances = mutation({
  args: { articles: v.array(v.any()) },
  handler: async (ctx, args) => {
    // Delete all existing substances
    const existing = await ctx.db.query("substanceIndex").collect();
    for (const article of existing) {
      await ctx.db.delete(article._id);
    }

    // Insert all new substances with slugs
    for (const article of args.articles) {
      const articleWithSlug = {
        ...article,
        slug: article.slug ?? slugify(article.title),
      };
      await ctx.db.insert("substanceIndex", articleWithSlug);
    }

    return {
      deleted: existing.length,
      inserted: args.articles.length,
    };
  },
});

/**
 * Mutation to delete a single substance by its article ID.
 */
export const deleteSubstance = mutation({
  args: { id: v.number() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("substanceIndex")
      .withIndex("by_article_id", (q) => q.eq("id", args.id))
      .first();

    if (existing) {
      await ctx.db.delete(existing._id);
      return { deleted: true };
    }

    return { deleted: false };
  },
});
