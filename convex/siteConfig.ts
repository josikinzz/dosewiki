import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireEditorWrite } from "./lib/auth";

/**
 * Site configuration storage - About page content and other global settings.
 * Uses a single document pattern with key="about" for the About page.
 */

// Get the About page configuration
export const getAbout = query({
  args: {},
  handler: async (ctx) => {
    const config = await ctx.db
      .query("siteConfig")
      .withIndex("by_key", (q) => q.eq("key", "about"))
      .first();

    return config ?? null;
  },
});

// Save the About page configuration
export const saveAbout = mutation({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    aboutMarkdown: v.optional(v.string()),
    aboutSubtitle: v.optional(v.string()),
    founderProfileKeys: v.optional(v.array(v.string())),
    updatedBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Authenticate the request
    await requireEditorWrite(ctx, {
      apiKey: args.apiKey,
      actorEmail: args.actorEmail,
      adminIntent: "editorArticleWrite",
    });

    const existing = await ctx.db
      .query("siteConfig")
      .withIndex("by_key", (q) => q.eq("key", "about"))
      .first();

    const now = new Date().toISOString();
    const data = {
      key: "about" as const,
      aboutMarkdown: args.aboutMarkdown,
      aboutSubtitle: args.aboutSubtitle,
      founderProfileKeys: args.founderProfileKeys,
      updatedAt: now,
      updatedBy: args.updatedBy,
    };

    if (existing) {
      await ctx.db.patch(existing._id, data);
      return { updated: true, id: existing._id };
    } else {
      const id = await ctx.db.insert("siteConfig", data);
      return { updated: false, id };
    }
  },
});
