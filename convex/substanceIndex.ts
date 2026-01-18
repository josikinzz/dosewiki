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
 * Mutation to save/update a single substance.
 * If a substance with the same ID exists, it updates it. Otherwise, it creates a new one.
 */
export const saveSubstance = mutation({
  args: { article: v.any() },
  handler: async (ctx, args) => {
    const { article } = args;

    // Check if substance with this ID already exists
    if (article.id !== null) {
      const existing = await ctx.db
        .query("substanceIndex")
        .withIndex("by_article_id", (q) => q.eq("id", article.id))
        .first();

      if (existing) {
        // Update existing substance
        await ctx.db.patch(existing._id, article);
        return { updated: true, id: existing._id };
      }
    }

    // Create new substance
    const id = await ctx.db.insert("substanceIndex", article);
    return { updated: false, id };
  },
});

/**
 * Mutation to save multiple substances at once.
 * Updates existing substances (by article ID) and creates new ones as needed.
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
        // Check if substance with this ID already exists
        if (article.id !== null) {
          const existing = await ctx.db
            .query("substanceIndex")
            .withIndex("by_article_id", (q) => q.eq("id", article.id))
            .first();

          if (existing) {
            await ctx.db.patch(existing._id, article);
            results.updated++;
            continue;
          }
        }

        // Create new substance
        await ctx.db.insert("substanceIndex", article);
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

    // Insert all new substances
    for (const article of args.articles) {
      await ctx.db.insert("substanceIndex", article);
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
