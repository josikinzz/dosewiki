import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireRole } from "./lib/auth";
import { mirrorPsychoactiveLayout } from "./lib/categoryLayoutMirror";
import { indexLayoutValidator } from "./lib/validators";

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

// Full index layout; the validator lives in lib/validators so the change
// proposal submit path checks a proposed layout exactly like a saved one.

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
 * Save/update an index layout. Editor floor: this is the staged save route's
 * layout write. Psychoactive layouts are mirrored into `categoryLayout`,
 * which the public /substances page reads.
 */
export const save = mutation({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    ...indexLayoutValidator.fields,
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, {
      apiKey: args.apiKey,
      actorEmail: args.actorEmail,
      adminIntent: "editorArticleWrite",
    }, "editor");

    const { apiKey: _apiKey, actorEmail: _actorEmail, ...layoutData } = args;
    const existing = await ctx.db
      .query("indexLayouts")
      .withIndex("by_type", (q) => q.eq("type", layoutData.type))
      .first();

    let result;
    if (existing) {
      await ctx.db.patch(existing._id, layoutData);
      result = { updated: true, id: existing._id };
    } else {
      const id = await ctx.db.insert("indexLayouts", layoutData);
      result = { updated: false, id };
    }
    await mirrorPsychoactiveLayout(ctx, layoutData);
    return result;
  },
});

/**
 * Bulk import all index layouts. Script-only (seed); admin floor.
 */
export const bulkImport = mutation({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    layouts: v.array(indexLayoutValidator),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, { apiKey: args.apiKey, actorEmail: args.actorEmail }, "admin");

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
        await mirrorPsychoactiveLayout(ctx, layout);
      } catch (error) {
        results.errors.push(`Layout ${layout.type}: ${error}`);
      }
    }

    return results;
  },
});

/**
 * Delete an index layout by type. Admin floor.
 */
export const deleteByType = mutation({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    type: v.union(v.literal("psychoactive"), v.literal("chemical"), v.literal("mechanism")),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, { apiKey: args.apiKey, actorEmail: args.actorEmail }, "admin");

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
