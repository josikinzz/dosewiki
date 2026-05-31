import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireAuth, requireEditorWrite } from "./lib/auth";

/**
 * Query to get all changelog entries.
 * Returns entries sorted by createdAt descending (newest first).
 * Uses index for efficient ordering.
 */
export const getAll = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("changelog")
      .withIndex("by_created_at")
      .order("desc")
      .collect();
  },
});

/**
 * Query to get recent changelog entries (limited).
 * Uses index for efficient ordering with take().
 */
export const getRecent = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? 50, 500);
    return await ctx.db
      .query("changelog")
      .withIndex("by_created_at")
      .order("desc")
      .take(limit);
  },
});

/**
 * Mutation to add a new changelog entry.
 */
export const addEntry = mutation({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
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
    // Authenticate the request
    await requireEditorWrite(ctx, {
      apiKey: args.apiKey,
      actorEmail: args.actorEmail,
      adminIntent: "editorArticleWrite",
    });

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
  args: {
    apiKey: v.optional(v.string()),
    entryId: v.string(),
  },
  handler: async (ctx, args) => {
    // Authenticate the request
    await requireAuth(ctx, args.apiKey, "editorArticleWrite");

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
