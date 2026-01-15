import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

/**
 * Query to get all articles.
 * Returns the complete list of substance articles.
 */
export const getAll = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("articles").collect();
  },
});

/**
 * Query to get a single article by its article ID (not Convex _id).
 */
export const getById = query({
  args: { id: v.number() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("articles")
      .withIndex("by_article_id", (q) => q.eq("id", args.id))
      .first();
  },
});

/**
 * Query to get a single article by title.
 */
export const getByTitle = query({
  args: { title: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("articles")
      .withIndex("by_title", (q) => q.eq("title", args.title))
      .first();
  },
});

/**
 * Mutation to save/update a single article.
 * If an article with the same ID exists, it updates it. Otherwise, it creates a new one.
 */
export const saveArticle = mutation({
  args: { article: v.any() },
  handler: async (ctx, args) => {
    const { article } = args;
    
    // Check if article with this ID already exists
    if (article.id !== null) {
      const existing = await ctx.db
        .query("articles")
        .withIndex("by_article_id", (q) => q.eq("id", article.id))
        .first();
      
      if (existing) {
        // Update existing article
        await ctx.db.patch(existing._id, article);
        return { updated: true, id: existing._id };
      }
    }
    
    // Create new article
    const id = await ctx.db.insert("articles", article);
    return { updated: false, id };
  },
});

/**
 * Mutation to save multiple articles at once.
 * Updates existing articles (by article ID) and creates new ones as needed.
 */
export const saveArticles = mutation({
  args: { articles: v.array(v.any()) },
  handler: async (ctx, args) => {
    const results = {
      created: 0,
      updated: 0,
      errors: [] as string[],
    };

    for (const article of args.articles) {
      try {
        // Check if article with this ID already exists
        if (article.id !== null) {
          const existing = await ctx.db
            .query("articles")
            .withIndex("by_article_id", (q) => q.eq("id", article.id))
            .first();
          
          if (existing) {
            await ctx.db.patch(existing._id, article);
            results.updated++;
            continue;
          }
        }
        
        // Create new article
        await ctx.db.insert("articles", article);
        results.created++;
      } catch (error) {
        results.errors.push(`Article ${article.title}: ${error}`);
      }
    }

    return results;
  },
});

/**
 * Mutation to replace ALL articles (bulk import/sync).
 * Deletes all existing articles and inserts the new set.
 * Use with caution!
 */
export const replaceAllArticles = mutation({
  args: { articles: v.array(v.any()) },
  handler: async (ctx, args) => {
    // Delete all existing articles
    const existing = await ctx.db.query("articles").collect();
    for (const article of existing) {
      await ctx.db.delete(article._id);
    }

    // Insert all new articles
    for (const article of args.articles) {
      await ctx.db.insert("articles", article);
    }

    return {
      deleted: existing.length,
      inserted: args.articles.length,
    };
  },
});

/**
 * Mutation to delete a single article by its article ID.
 */
export const deleteArticle = mutation({
  args: { id: v.number() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("articles")
      .withIndex("by_article_id", (q) => q.eq("id", args.id))
      .first();
    
    if (existing) {
      await ctx.db.delete(existing._id);
      return { deleted: true };
    }
    
    return { deleted: false };
  },
});
