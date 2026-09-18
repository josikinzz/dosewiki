import { v } from "../lib/postgres/runtime/values";
import { query } from "../lib/postgres/runtime/server";
import { requireRole } from "./lib/auth";

const LIST_LIMIT = 100;

/**
 * Prior versions of one profile, playlist, or trip report, newest first.
 * Admin floor: the journal holds whole documents, including fields a
 * contributor may have removed on purpose.
 */
export const listForKey = query({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    table: v.union(
      v.literal("contributorProfiles"),
      v.literal("replicationPlaylists"),
      v.literal("tripReports"),
    ),
    key: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireRole(
      ctx,
      { apiKey: args.apiKey, actorEmail: args.actorEmail, adminIntent: "replicationMaintenance" },
      "admin",
    );
    const limit = Math.min(Math.max(Math.floor(args.limit ?? LIST_LIMIT), 1), LIST_LIMIT);
    return await ctx.db
      .query("contentRevisions")
      .withIndex("by_table_key", (q) => q.eq("table", args.table).eq("key", args.key))
      .order("desc")
      .take(limit);
  },
});

/** The newest revisions across every table. Admin floor. */
export const listRecent = query({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireRole(
      ctx,
      { apiKey: args.apiKey, actorEmail: args.actorEmail, adminIntent: "replicationMaintenance" },
      "admin",
    );
    const limit = Math.min(Math.max(Math.floor(args.limit ?? LIST_LIMIT), 1), LIST_LIMIT);
    return await ctx.db.query("contentRevisions").withIndex("by_created_at").order("desc").take(limit);
  },
});
