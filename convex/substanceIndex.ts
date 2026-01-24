import { v } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";
import { requireAuth } from "./lib/auth";
import { substanceArticleLightValidator, isValidArticle } from "./lib/validators";

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
 * Query to get N random articles for preview.
 * Only loads high-priority articles (~252 vs 679 total) then shuffles.
 *
 * @param count - Number of articles to return (default: 5)
 * @param seed - Optional seed to force re-query (changing seed triggers new random sample)
 */
export const getRandomSample = query({
  args: {
    count: v.optional(v.number()),
    seed: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // seed is only used to trigger re-query, not for actual randomization
    void args.seed;

    const count = args.count ?? 5;

    // Only load high-priority articles to reduce working set
    const articles = await ctx.db
      .query("substanceIndex")
      .withIndex("by_priority", (q) => q.eq("priority", "high"))
      .collect();

    // Fisher-Yates shuffle (partial - only need first `count` elements)
    const shuffled = [...articles];
    for (let i = 0; i < Math.min(count, shuffled.length); i++) {
      const j = i + Math.floor(Math.random() * (shuffled.length - i));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    return shuffled.slice(0, count);
  },
});

/**
 * Mutation to save/update a single substance.
 * If a substance with the same ID exists, it updates it. Otherwise, it creates a new one.
 * Automatically computes slug from title if not provided.
 *
 * @param apiKey - Required API key for authentication (set CONVEX_ADMIN_KEY env var)
 * @param article - The substance article to save
 */
export const saveSubstance = mutation({
  args: {
    apiKey: v.optional(v.string()),
    article: substanceArticleLightValidator,
  },
  handler: async (ctx, args) => {
    // Authenticate the request
    requireAuth(ctx, args.apiKey);

    const { article } = args;

    // Runtime validation for additional safety
    if (!isValidArticle(article)) {
      throw new Error("Invalid article structure: missing required fields");
    }

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
 *
 * @param apiKey - Required API key for authentication (set CONVEX_ADMIN_KEY env var)
 * @param articles - Array of substance articles to save
 */
export const saveSubstances = mutation({
  args: {
    apiKey: v.optional(v.string()),
    articles: v.array(substanceArticleLightValidator),
  },
  handler: async (ctx, args) => {
    // Authenticate the request
    requireAuth(ctx, args.apiKey);

    const results = {
      created: 0,
      updated: 0,
      errors: [] as string[],
    };

    for (const article of args.articles) {
      try {
        // Runtime validation for additional safety
        if (!isValidArticle(article)) {
          results.errors.push(`Article ${article.title}: Invalid structure`);
          continue;
        }

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
 * Internal mutation to replace ALL substances (bulk import/sync).
 * Deletes all existing substances and inserts the new set.
 * Automatically computes slug from title if not provided.
 *
 * NOTE: This is an internal mutation - not exposed to clients.
 * Call via Convex admin CLI or from an action.
 */
export const replaceAllSubstances = internalMutation({
  args: { articles: v.array(substanceArticleLightValidator) },
  handler: async (ctx, args) => {
    // Delete all existing substances
    const existing = await ctx.db.query("substanceIndex").collect();
    for (const article of existing) {
      await ctx.db.delete(article._id);
    }

    // Insert all new substances with slugs (skip invalid ones)
    let inserted = 0;
    for (const article of args.articles) {
      if (!isValidArticle(article)) {
        console.warn(`Skipping invalid article: ${article.title}`);
        continue;
      }
      const articleWithSlug = {
        ...article,
        slug: article.slug ?? slugify(article.title),
      };
      await ctx.db.insert("substanceIndex", articleWithSlug);
      inserted++;
    }

    return {
      deleted: existing.length,
      inserted,
    };
  },
});

/**
 * Mutation to delete a single substance by its article ID.
 *
 * @param apiKey - Required API key for authentication (set CONVEX_ADMIN_KEY env var)
 * @param id - The article ID of the substance to delete
 */
export const deleteSubstance = mutation({
  args: {
    apiKey: v.optional(v.string()),
    id: v.number(),
  },
  handler: async (ctx, args) => {
    // Authenticate the request
    requireAuth(ctx, args.apiKey);

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
