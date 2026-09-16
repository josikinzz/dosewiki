import { v } from "../lib/postgres/runtime/values";
import { query } from "../lib/postgres/runtime/server";
import { mutation } from "./lib/indexedMutation";
import { requireRole } from "./lib/auth";
import { isKnownPromptKey } from "../src/data/config/promptRegistry";

const promptDocument = v.object({
  _id: v.id("prompts"),
  _creationTime: v.number(),
  key: v.string(),
  content: v.string(),
  updatedAt: v.string(),
  updatedBy: v.optional(v.string()),
});

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
  returns: v.union(promptDocument, v.null()),
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
  returns: v.array(promptDocument),
  handler: async (ctx) => {
    return await ctx.db.query("prompts").collect();
  },
});

/**
 * Save (create or update) a prompt. Prompts drive generation on the live
 * site, so the write is admin-only.
 */
export const save = mutation({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    key: v.string(),
    content: v.string(),
    updatedBy: v.optional(v.string()),
  },
  returns: v.object({ updated: v.boolean(), id: v.id("prompts") }),
  handler: async (ctx, args) => {
    await requireRole(
      ctx,
      { apiKey: args.apiKey, actorEmail: args.actorEmail, adminIntent: "promptMigrationWrite" },
      "admin",
    );

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
    actorEmail: v.optional(v.string()),
    key: v.string(),
  },
  returns: v.object({ deleted: v.boolean() }),
  handler: async (ctx, args) => {
    await requireRole(
      ctx,
      { apiKey: args.apiKey, actorEmail: args.actorEmail, adminIntent: "promptMigrationWrite" },
      "admin",
    );

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
    actorEmail: v.optional(v.string()),
    prompts: v.array(v.object({
      key: v.string(),
      content: v.string(),
    })),
    updatedBy: v.optional(v.string()),
  },
  returns: v.object({ created: v.number(), updated: v.number(), errors: v.array(v.string()) }),
  handler: async (ctx, args) => {
    await requireRole(
      ctx,
      { apiKey: args.apiKey, actorEmail: args.actorEmail, adminIntent: "promptMigrationWrite" },
      "admin",
    );

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
