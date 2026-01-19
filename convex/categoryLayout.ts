import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

/**
 * Category layout queries and mutations.
 *
 * The category layout is stored as a single document containing the full
 * psychoactive index structure. This allows the home page to load quickly
 * with just the layout data (~14KB) instead of all 679 articles (~5MB).
 */

// Category structure for the layout
const categoryLayoutValidator = v.object({
  version: v.number(),
  categories: v.array(v.object({
    key: v.string(),
    label: v.string(),
    iconKey: v.string(),
    sections: v.array(v.object({
      key: v.string(),
      label: v.string(),
      drugs: v.array(v.string()),
    })),
    drugs: v.array(v.string()),
    columns: v.optional(v.any()),
  })),
});

/**
 * Get the category layout.
 * Returns null if no layout has been seeded yet.
 */
export const get = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("categoryLayout").first();
  },
});

/**
 * Save/update the category layout.
 * If a layout exists, it updates it. Otherwise, it creates a new one.
 * Used by DevTools and the seed script.
 */
export const save = mutation({
  args: categoryLayoutValidator,
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("categoryLayout").first();

    if (existing) {
      await ctx.db.patch(existing._id, args);
      return { updated: true, id: existing._id };
    }

    const id = await ctx.db.insert("categoryLayout", args);
    return { updated: false, id };
  },
});

/**
 * Delete the category layout.
 * Used for testing/reset purposes.
 */
export const clear = mutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("categoryLayout").first();
    if (existing) {
      await ctx.db.delete(existing._id);
      return { deleted: true };
    }
    return { deleted: false };
  },
});
