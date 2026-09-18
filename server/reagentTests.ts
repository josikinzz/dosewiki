import { v } from "../lib/postgres/runtime/values";
import { query } from "../lib/postgres/runtime/server";
import { mutation } from "./lib/indexedMutation";
import { requireAdminIntent } from "./lib/auth";
import { reagentTestImportEntryValidator } from "./reagentTestContract";

export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const record = await ctx.db
      .query("reagentTests")
      .withIndex("by_slug", (query) => query.eq("slug", args.slug))
      .first();

    return record?.data ?? null;
  },
});

export const getSnapshotStats = query({
  args: { snapshotHash: v.string() },
  handler: async (ctx, args) => {
    const records = await ctx.db
      .query("reagentTests")
      .withIndex("by_snapshot_hash", (query) =>
        query.eq("snapshotHash", args.snapshotHash),
      )
      .collect();
    const matched = records.filter((record) => record.data !== null).length;

    return {
      total: records.length,
      matched,
      unmatched: records.length - matched,
    };
  },
});

export const bulkUpsert = mutation({
  args: {
    apiKey: v.string(),
    snapshotHash: v.string(),
    importedAt: v.number(),
    entries: v.array(reagentTestImportEntryValidator),
  },
  handler: async (ctx, args) => {
    await requireAdminIntent(args.apiKey, "reagentTestImport");

    let created = 0;
    let updated = 0;
    let unchanged = 0;

    for (const entry of args.entries) {
      const existing = await ctx.db
        .query("reagentTests")
        .withIndex("by_slug", (query) => query.eq("slug", entry.slug))
        .first();

      if (!existing) {
        await ctx.db.insert("reagentTests", {
          ...entry,
          source: "protestkit",
          snapshotHash: args.snapshotHash,
          importedAt: args.importedAt,
        });
        created += 1;
        continue;
      }

      if (existing.snapshotHash === args.snapshotHash) {
        unchanged += 1;
        continue;
      }

      await ctx.db.patch(existing._id, {
        data: entry.data,
        source: "protestkit",
        snapshotHash: args.snapshotHash,
        importedAt: args.importedAt,
      });
      updated += 1;
    }

    return { created, updated, unchanged };
  },
});
