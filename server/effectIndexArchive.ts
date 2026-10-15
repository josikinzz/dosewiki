import { v } from "../lib/postgres/runtime/values";
import { query } from "../lib/postgres/runtime/server";
import { mutation } from "./lib/indexedMutation";
import { requireRole } from "./lib/auth";

const archiveEntryValidator = v.object({
  kind: v.string(),
  key: v.string(),
  payload: v.any(),
  importedAt: v.number(),
});

export const getByKind = query({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    kind: v.string(),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, {
      apiKey: args.apiKey,
      actorEmail: args.actorEmail,
      adminIntent: "profileMediaWrite",
    }, "editor");

    return await ctx.db
      .query("effectIndexArchive")
      .withIndex("by_kind_key", (index) => index.eq("kind", args.kind))
      .collect();
  },
});

const POST_KIND = "post";

export const listPosts = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("effectIndexArchive")
      .withIndex("by_kind_key", (index) => index.eq("kind", POST_KIND))
      .collect();
  },
});

export const getPostBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("effectIndexArchive")
      .withIndex("by_kind_key", (index) => index.eq("kind", POST_KIND).eq("key", args.slug))
      .first();
  },
});

export const bulkImport = mutation({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    entries: v.array(archiveEntryValidator),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, {
      apiKey: args.apiKey,
      actorEmail: args.actorEmail,
      adminIntent: "profileMediaWrite",
    }, "admin");

    let created = 0;
    let updated = 0;

    for (const entry of args.entries) {
      const existing = await ctx.db
        .query("effectIndexArchive")
        .withIndex("by_kind_key", (index) => index.eq("kind", entry.kind).eq("key", entry.key))
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, entry);
        updated += 1;
      } else {
        await ctx.db.insert("effectIndexArchive", entry);
        created += 1;
      }
    }

    return { created, updated };
  },
});
