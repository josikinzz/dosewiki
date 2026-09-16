import { v } from "../lib/postgres/runtime/values";
import { query } from "../lib/postgres/runtime/server";
import { mutation } from "./lib/indexedMutation";
import { requireRole } from "./lib/auth";
import {
  attributionBatchUpdateValidator,
  attributionRollbackUpdateValidator,
  replicationSourceAttribution,
} from "./lib/replicationAttributionValidators";
import {
  applyAttributionBatchHandler,
  rollbackAttributionBatchHandler,
} from "./lib/replicationAttribution";

const storedAttribution = v.object({
  _id: v.id("replicationSourceAttribution"),
  _creationTime: v.number(),
  ...replicationSourceAttribution.fields,
});

const nullableString = v.union(v.string(), v.null());
const repairReadbackRow = v.object({
  id: v.id("replications"),
  slug: v.string(),
  artist: v.string(),
  artist_url: nullableString,
  credit_line: nullableString,
  rightsholder: nullableString,
  source_catalog_id: nullableString,
  source_sha256: nullableString,
  attribution: v.union(storedAttribution, v.null()),
});

export const getByReplicationId = query({
  args: { replication_id: v.id("replications") },
  returns: v.union(storedAttribution, v.null()),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("replicationSourceAttribution")
      .withIndex("by_replication_id", (q) => q.eq("replication_id", args.replication_id))
      .unique();
  },
});

export const getByReplicationIds = query({
  args: {
    apiKey: v.optional(v.string()),
    replication_ids: v.array(v.id("replications")),
  },
  returns: v.array(storedAttribution),
  handler: async (ctx, args) => {
    await requireRole(
      ctx,
      { apiKey: args.apiKey, adminIntent: "replicationMaintenance" },
      "admin",
    );
    if (args.replication_ids.length > 100) {
      throw new Error("Attribution read-back is limited to 100 rows.");
    }
    const rows = [];
    for (const id of args.replication_ids) {
      const row = await ctx.db
        .query("replicationSourceAttribution")
        .withIndex("by_replication_id", (q) => q.eq("replication_id", id))
        .unique();
      if (row) rows.push(row);
    }
    return rows;
  },
});

export const getRepairReadback = query({
  args: {
    apiKey: v.optional(v.string()),
    replication_ids: v.array(v.id("replications")),
  },
  returns: v.array(repairReadbackRow),
  handler: async (ctx, args) => {
    await requireRole(
      ctx,
      { apiKey: args.apiKey, adminIntent: "replicationMaintenance" },
      "admin",
    );
    if (args.replication_ids.length === 0 || args.replication_ids.length > 50) {
      throw new Error("Attribution repair read-back is limited to 1 to 50 rows.");
    }
    const ids = new Set(args.replication_ids);
    if (ids.size !== args.replication_ids.length) {
      throw new Error("Attribution repair read-back cannot repeat replication IDs.");
    }
    const rows = [];
    for (const id of args.replication_ids) {
      const replication = await ctx.db.get(id);
      if (!replication) continue;
      const attribution = await ctx.db
        .query("replicationSourceAttribution")
        .withIndex("by_replication_id", (q) => q.eq("replication_id", id))
        .unique();
      rows.push({
        id: replication._id,
        slug: replication.slug,
        artist: replication.artist,
        artist_url: replication.artist_url ?? null,
        credit_line: replication.credit_line ?? null,
        rightsholder: replication.rightsholder ?? null,
        source_catalog_id: replication.source_catalog_id ?? null,
        source_sha256: replication.source_sha256 ?? null,
        attribution,
      });
    }
    return rows;
  },
});

export const applyBatch = mutation({
  args: {
    apiKey: v.string(),
    operation_id: v.string(),
    dry_run: v.boolean(),
    updates: v.array(attributionBatchUpdateValidator),
  },
  returns: v.object({ updated: v.number(), unchanged: v.number() }),
  handler: applyAttributionBatchHandler,
});

export const rollbackBatch = mutation({
  args: {
    apiKey: v.string(),
    operation_id: v.string(),
    dry_run: v.boolean(),
    updates: v.array(attributionRollbackUpdateValidator),
  },
  returns: v.object({ restored: v.number(), unchanged: v.number() }),
  handler: rollbackAttributionBatchHandler,
});
