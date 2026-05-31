import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireAuth, requireEditorWrite } from "./lib/auth";
import { isKnownPromptKey } from "../src/data/config/promptRegistry";

/**
 * Prompt functions.
 *
 * These functions provide CRUD operations for system and section prompts.
 * Prompts are editable via the dev tools UI.
 */

/**
 * Get a specific prompt by key.
 */
export const getByKey = query({
  args: { key: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("prompts")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .first();
  },
});

/**
 * Get all prompts.
 */
export const getAll = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("prompts").collect();
  },
});

/**
 * Save (create or update) a prompt.
 *
 * @param apiKey - Required API key for authentication
 */
export const save = mutation({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    key: v.string(),
    content: v.string(),
    updatedBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireEditorWrite(ctx, {
      apiKey: args.apiKey,
      actorEmail: args.actorEmail,
      adminIntent: "promptMigrationWrite",
    });

    const { key, content, updatedBy } = args;
    if (!isKnownPromptKey(key)) {
      throw new Error(`Unknown prompt key: ${key}`);
    }

    const updatedAt = new Date().toISOString();

    // Check if prompt with this key already exists
    const existing = await ctx.db
      .query("prompts")
      .withIndex("by_key", (q) => q.eq("key", key))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        content,
        updatedAt,
        updatedBy,
      });
      return { updated: true, id: existing._id };
    }

    const id = await ctx.db.insert("prompts", {
      key,
      content,
      updatedAt,
      updatedBy,
    });
    return { updated: false, id };
  },
});

/**
 * Delete a prompt by key.
 *
 * @param apiKey - Required API key for authentication
 */
export const deleteByKey = mutation({
  args: {
    apiKey: v.optional(v.string()),
    key: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.apiKey, "promptMigrationWrite");

    const existing = await ctx.db
      .query("prompts")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .first();

    if (existing) {
      await ctx.db.delete(existing._id);
      return { deleted: true };
    }

    return { deleted: false };
  },
});

/**
 * Bulk import prompts (for migration).
 *
 * @param apiKey - Required API key for authentication
 */
export const bulkImport = mutation({
  args: {
    apiKey: v.optional(v.string()),
    prompts: v.array(v.object({
      key: v.string(),
      content: v.string(),
    })),
    updatedBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.apiKey, "promptMigrationWrite");

    const updatedAt = new Date().toISOString();
    const results = {
      created: 0,
      updated: 0,
      errors: [] as string[],
    };

    for (const prompt of args.prompts) {
      try {
        if (!isKnownPromptKey(prompt.key)) {
          throw new Error(`Unknown prompt key: ${prompt.key}`);
        }

        const existing = await ctx.db
          .query("prompts")
          .withIndex("by_key", (q) => q.eq("key", prompt.key))
          .first();

        if (existing) {
          await ctx.db.patch(existing._id, {
            content: prompt.content,
            updatedAt,
            updatedBy: args.updatedBy,
          });
          results.updated++;
        } else {
          await ctx.db.insert("prompts", {
            key: prompt.key,
            content: prompt.content,
            updatedAt,
            updatedBy: args.updatedBy,
          });
          results.created++;
        }
      } catch (error) {
        results.errors.push(`Prompt ${prompt.key}: ${error}`);
      }
    }

    return results;
  },
});
