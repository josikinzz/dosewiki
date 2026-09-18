import { v } from "../lib/postgres/runtime/values";
import { query } from "../lib/postgres/runtime/server";
import { internalMutation } from "./lib/indexedMutation";
import { requireRole } from "./lib/auth";

export const listValidator = v.union(
  v.literal("josiekins"),
  v.literal("dosewiki"),
  v.literal("effectindex"),
  v.literal("mindstate"),
);

const statusValidator = v.union(
  v.literal("subscribed"),
  v.literal("spam"),
  v.literal("unsubscribed"),
);

const subscriberRowValidator = v.object({
  email: v.string(),
  list: listValidator,
  status: statusValidator,
  created_at: v.number(),
  ip_hash: v.optional(v.string()),
  user_agent: v.optional(v.string()),
  honeypot_triggered: v.boolean(),
});

type SubscriberRow = typeof subscriberRowValidator.type;

/**
 * Outcome contract for the /subscribe HTTP endpoint:
 * - "subscribed", "duplicate", and "spam" all map to a generic 200 so the
 *   public endpoint never enumerates existing addresses or reveals the
 *   honeypot.
 * - "invalid" maps to 400.
 */
const outcomeValidator = v.union(
  v.literal("subscribed"),
  v.literal("duplicate"),
  v.literal("spam"),
  v.literal("invalid"),
);

const MAX_EMAIL_LENGTH = 254;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Internal intake for the public /subscribe HTTP endpoint.
 * Never exposed to clients directly; the HTTP layer owns CORS, rate limiting,
 * and response shaping.
 */
export const subscribe = internalMutation({
  args: {
    email: v.string(),
    list: listValidator,
    honeypotTriggered: v.boolean(),
    ipHash: v.optional(v.string()),
    userAgent: v.optional(v.string()),
  },
  returns: outcomeValidator,
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();

    if (email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(email)) {
      // Bots that trip the honeypot get the generic success path even with a
      // garbage address; nothing is stored.
      return args.honeypotTriggered ? "spam" : "invalid";
    }

    const existing = await ctx.db
      .query("mailingListSubscribers")
      .withIndex("by_email_list", (q) => q.eq("email", email).eq("list", args.list))
      .unique();
    if (existing) {
      // Silently succeed; a previously unsubscribed address stays unsubscribed.
      return args.honeypotTriggered ? "spam" : "duplicate";
    }

    await ctx.db.insert("mailingListSubscribers", {
      email,
      list: args.list,
      status: args.honeypotTriggered ? "spam" : "subscribed",
      created_at: Date.now(),
      ip_hash: args.ipHash,
      user_agent: args.userAgent,
      honeypot_triggered: args.honeypotTriggered,
    });

    return args.honeypotTriggered ? "spam" : "subscribed";
  },
});

/**
 * Editor-gated listing for admin tooling, mirroring siteFeedback.list.
 */
export const list = query({
  args: {
    apiKey: v.string(),
    actorEmail: v.optional(v.string()),
    list: v.optional(listValidator),
    status: v.optional(statusValidator),
    limit: v.optional(v.number()),
  },
  returns: v.array(subscriberRowValidator),
  handler: async (ctx, args) => {
    await requireRole(ctx, {
      apiKey: args.apiKey,
      actorEmail: args.actorEmail,
      adminIntent: "editorArticleWrite",
    }, "editor");

    const limit = clampLimit(args.limit);
    const listFilter = args.list;
    const docs = listFilter
      ? await ctx.db
          .query("mailingListSubscribers")
          .withIndex("by_list_status", (q) =>
            args.status
              ? q.eq("list", listFilter).eq("status", args.status)
              : q.eq("list", listFilter),
          )
          .order("desc")
          .take(limit)
      : await ctx.db.query("mailingListSubscribers").order("desc").take(limit);

    const rows = args.status
      ? docs.filter((doc) => doc.status === args.status)
      : docs;
    return rows.map(toSubscriberRow);
  },
});

/**
 * Internal operator cleanup for test or mistaken rows.
 */
export const remove = internalMutation({
  args: {
    email: v.string(),
    list: listValidator,
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();
    let removed = 0;
    const docs = await ctx.db
      .query("mailingListSubscribers")
      .withIndex("by_email_list", (q) => q.eq("email", email).eq("list", args.list))
      .collect();
    for (const doc of docs) {
      await ctx.db.delete(doc._id);
      removed += 1;
    }
    return removed;
  },
});

function toSubscriberRow(row: SubscriberRow): SubscriberRow {
  return {
    email: row.email,
    list: row.list,
    status: row.status,
    created_at: row.created_at,
    ip_hash: row.ip_hash,
    user_agent: row.user_agent,
    honeypot_triggered: row.honeypot_triggered,
  };
}

function clampLimit(limit: number | undefined): number {
  return Math.max(1, Math.min(limit ?? 100, 250));
}
