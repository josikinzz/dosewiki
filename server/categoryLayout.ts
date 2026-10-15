import { query } from "../lib/postgres/runtime/server";
import { mutation } from "./lib/indexedMutation";
import { v } from "../lib/postgres/runtime/values";
import { requireRole } from "./lib/auth";
import { writeCategoryLayout } from "./lib/categoryLayoutMirror";

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

export const get = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("categoryLayout").first();
  },
});

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
