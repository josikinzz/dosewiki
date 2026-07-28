import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireEditorWrite } from "./lib/auth";

const archiveEntryValidator = v.object({
  kind: v.string(),
  key: v.string(),
  payload: v.any(),
  importedAt: v.number(),
});

/**
 * Admin/editor-only lossless Effect Index archive reader. No DoseWiki UI
 * should use this table; it is retained for a future EI deployment.
 */
export const getByKind = query({
  args: {
    apiKey: v.optional(v.string()),
    kind: v.string(),
  },
  handler: async (ctx, args) => {
    await requireEditorWrite(ctx, {
      apiKey: args.apiKey,
      adminIntent: "profileMediaWrite",
    });

    return await ctx.db
      .query("effectIndexArchive")
      .withIndex("by_kind_key", (index) => index.eq("kind", args.kind))
      .collect();
  },
});

/** Upsert raw Effect Index source records by stable kind/key identity. */
export const bulkImport = mutation({
  args: {
    apiKey: v.optional(v.string()),
    entries: v.array(archiveEntryValidator),
  },
  handler: async (ctx, args) => {
    await requireEditorWrite(ctx, {
      apiKey: args.apiKey,
      adminIntent: "profileMediaWrite",
    });

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
