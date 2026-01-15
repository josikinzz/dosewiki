import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

/**
 * Query to get all changelog entries.
 * Returns entries sorted by createdAt descending (newest first).
 */
export const getAll = query({
  args: {},
  handler: async (ctx) => {
    const entries = await ctx.db.query("changelog").collect();
    // Sort by createdAt descending (newest first)
    return entries.sort((a, b) => {
      const dateA = new Date(a.createdAt).getTime();
      const dateB = new Date(b.createdAt).getTime();
      if (dateB !== dateA) {
        return dateB - dateA;
      }
      // Secondary sort by entryId for stability
      return b.entryId.localeCompare(a.entryId);
    });
  },
});

/**
 * Query to get recent changelog entries (limited).
 */
export const getRecent = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    const entries = await ctx.db.query("changelog").collect();
    // Sort by createdAt descending and take limit
    return entries
      .sort((a, b) => {
        const dateA = new Date(a.createdAt).getTime();
        const dateB = new Date(b.createdAt).getTime();
        if (dateB !== dateA) {
          return dateB - dateA;
        }
        return b.entryId.localeCompare(a.entryId);
      })
      .slice(0, limit);
  },
});

/**
 * Mutation to add a new changelog entry.
 */
export const addEntry = mutation({
  args: {
    entryId: v.string(),
    createdAt: v.string(),
    message: v.string(),
    markdown: v.string(),
    submittedBy: v.union(v.string(), v.null()),
    articles: v.array(v.object({
      id: v.number(),
      title: v.string(),
      slug: v.string(),
    })),
  },
  handler: async (ctx, args) => {
    // Check if entry with this ID already exists (prevent duplicates)
    const existing = await ctx.db
      .query("changelog")
      .withIndex("by_entry_id", (q) => q.eq("entryId", args.entryId))
      .first();

    if (existing) {
      // Update existing entry
      await ctx.db.patch(existing._id, {
        createdAt: args.createdAt,
        message: args.message,
        markdown: args.markdown,
        submittedBy: args.submittedBy,
        articles: args.articles,
      });
      return { created: false, id: existing._id };
    }

    // Create new entry
    const id = await ctx.db.insert("changelog", {
      entryId: args.entryId,
      createdAt: args.createdAt,
      message: args.message,
      markdown: args.markdown,
      submittedBy: args.submittedBy,
      articles: args.articles,
    });

    return { created: true, id };
  },
});

/**
 * Mutation to delete a changelog entry by its entryId.
 */
export const deleteEntry = mutation({
  args: { entryId: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("changelog")
      .withIndex("by_entry_id", (q) => q.eq("entryId", args.entryId))
      .first();

    if (existing) {
      await ctx.db.delete(existing._id);
      return { deleted: true };
    }

    return { deleted: false };
  },
});
