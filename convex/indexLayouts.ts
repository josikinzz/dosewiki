import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

/**
 * Index layouts - stores category/classification index definitions.
 *
 * Three types:
 * - "psychoactive": Home page category layout (Psychedelic, Dissociative, etc.)
 * - "chemical": Chemical class index (Phenethylamine, Tryptamine, etc.)
 * - "mechanism": Mechanism of action index (5-HT2A agonist, etc.)
 *
 * Each layout has the same structure as the JSON files in src/data/indexes/.
 */

export type IndexLayoutType = "psychoactive" | "chemical" | "mechanism";

// Section with optional link for cross-referencing
const sectionValidator = v.object({
  key: v.string(),
  label: v.string(),
  notes: v.optional(v.string()),
  link: v.optional(v.object({
    type: v.union(v.literal("chemicalClass"), v.literal("psychoactiveClass"), v.literal("mechanism")),
    value: v.string(),
  })),
  drugs: v.array(v.string()),
});

// Category definition
const categoryValidator = v.object({
  key: v.string(),
  label: v.string(),
  iconKey: v.string(),
  notes: v.optional(v.string()),
  columns: v.optional(v.any()),  // Column assignments for responsive layout
  drugs: v.array(v.string()),
  sections: v.array(sectionValidator),
});

// Full index layout
const indexLayoutValidator = v.object({
  type: v.union(v.literal("psychoactive"), v.literal("chemical"), v.literal("mechanism")),
  version: v.number(),
  categories: v.array(categoryValidator),
});

/**
 * Get an index layout by type.
 */
export const getByType = query({
  args: { type: v.union(v.literal("psychoactive"), v.literal("chemical"), v.literal("mechanism")) },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("indexLayouts")
      .withIndex("by_type", (q) => q.eq("type", args.type))
      .first();
  },
});

/**
 * Get all index layouts.
 */
export const getAll = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("indexLayouts").collect();
  },
});

/**
 * Save/update an index layout.
 */
export const save = mutation({
  args: indexLayoutValidator,
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("indexLayouts")
      .withIndex("by_type", (q) => q.eq("type", args.type))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, args);
      return { updated: true, id: existing._id };
    }

    const id = await ctx.db.insert("indexLayouts", args);
    return { updated: false, id };
  },
});

/**
 * Bulk import all index layouts.
 */
export const bulkImport = mutation({
  args: {
    layouts: v.array(indexLayoutValidator),
  },
  handler: async (ctx, args) => {
    const results = {
      created: 0,
      updated: 0,
      errors: [] as string[],
    };

    for (const layout of args.layouts) {
      try {
        const existing = await ctx.db
          .query("indexLayouts")
          .withIndex("by_type", (q) => q.eq("type", layout.type))
          .first();

        if (existing) {
          await ctx.db.patch(existing._id, layout);
          results.updated++;
        } else {
          await ctx.db.insert("indexLayouts", layout);
          results.created++;
        }
      } catch (error) {
        results.errors.push(`Layout ${layout.type}: ${error}`);
      }
    }

    return results;
  },
});

/**
 * Delete an index layout by type.
 */
export const deleteByType = mutation({
  args: { type: v.union(v.literal("psychoactive"), v.literal("chemical"), v.literal("mechanism")) },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("indexLayouts")
      .withIndex("by_type", (q) => q.eq("type", args.type))
      .first();

    if (existing) {
      await ctx.db.delete(existing._id);
      return { deleted: true };
    }
    return { deleted: false };
  },
});
