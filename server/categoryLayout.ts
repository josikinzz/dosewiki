import { query } from "../lib/postgres/runtime/server";
import { mutation } from "./lib/indexedMutation";
import { v } from "../lib/postgres/runtime/values";
import { requireRole } from "./lib/auth";
import { writeCategoryLayout } from "./lib/categoryLayoutMirror";

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
 * Save/update the category layout directly. Script-only (seed); editor
 * saves reach this table through the `indexLayouts.save` mirror.
 */
export const save = mutation({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    ...categoryLayoutValidator.fields,
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, { apiKey: args.apiKey, actorEmail: args.actorEmail }, "admin");

    const { apiKey: _apiKey, actorEmail: _actorEmail, ...layoutData } = args;
    return await writeCategoryLayout(ctx, layoutData);
  },
});

/**
 * Delete the category layout.
 * Used for testing/reset purposes.
 */
export const clear = mutation({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, { apiKey: args.apiKey, actorEmail: args.actorEmail }, "admin");

    const existing = await ctx.db.query("categoryLayout").first();
    if (existing) {
      await ctx.db.delete(existing._id);
      return { deleted: true };
    }
    return { deleted: false };
  },
});
