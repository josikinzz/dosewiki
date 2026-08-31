import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireEditorWrite } from "./lib/auth";
import {
  attributionBatchUpdateValidator,
  replicationSourceAttribution,
} from "./lib/replicationAttributionValidators";
import { applyAttributionBatchHandler } from "./lib/replicationAttribution";

const storedAttribution = v.object({
  _id: v.id("replicationSourceAttribution"),
  _creationTime: v.number(),
  ...replicationSourceAttribution.fields,
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
    await requireEditorWrite(ctx, {
      apiKey: args.apiKey,
      adminIntent: "replicationMaintenance",
    });
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

export const applyBatch = mutation({
  args: {
    apiKey: v.string(),
    operation_id: v.string(),
    updates: v.array(attributionBatchUpdateValidator),
  },
  returns: v.object({ updated: v.number(), unchanged: v.number() }),
  handler: applyAttributionBatchHandler,
});
