import { v } from "convex/values";
import { query, type QueryCtx } from "./_generated/server";
import { mutation } from "./lib/indexedMutation";
import { requireRole } from "./lib/auth";

const statusValidator = v.union(
  v.literal("new"),
  v.literal("reviewing"),
  v.literal("resolved"),
  v.literal("rejected"),
  v.literal("spam"),
);

const categoryValidator = v.union(
  v.literal("inaccurate"),
  v.literal("missing"),
  v.literal("source"),
  v.literal("broken-link"),
  v.literal("other"),
);

const importanceValidator = v.union(
  v.literal("critical"),
  v.literal("high"),
  v.literal("normal"),
  v.literal("low"),
);

const feedbackRowValidator = v.object({
  id: v.string(),
  status: statusValidator,
  schema_version: v.number(),
  substance_slug: v.string(),
  substance_title: v.string(),
  category: categoryValidator,
  importance: importanceValidator,
  details: v.string(),
  source_url: v.optional(v.string()),
  contact_email: v.optional(v.string()),
  ip_hash: v.optional(v.string()),
  user_agent: v.optional(v.string()),
  honeypot_triggered: v.boolean(),
  review_notes: v.optional(v.string()),
  reviewed_by: v.optional(v.string()),
  reviewed_at: v.optional(v.string()),
  created_at: v.string(),
  updated_at: v.string(),
});

type FeedbackStatus = "new" | "reviewing" | "resolved" | "rejected" | "spam";

type FeedbackRow = typeof feedbackRowValidator.type;

type ConvexReadCtx = { db: QueryCtx["db"] };

const VALID_TRANSITIONS: Record<FeedbackStatus, FeedbackStatus[]> = {
  new: ["reviewing", "resolved", "rejected", "spam"],
  reviewing: ["resolved", "rejected", "spam", "new"],
  resolved: ["reviewing"],
  rejected: ["reviewing"],
  spam: ["reviewing"],
};

export const create = mutation({
  args: {
    apiKey: v.string(),
    feedback: feedbackRowValidator,
  },
  returns: feedbackRowValidator,
  handler: async (ctx, args) => {
    // Public intake relays an unauthenticated submitter: the server acts as
    // itself, so no actor is delegated.
    await requireRole(ctx, { apiKey: args.apiKey, adminIntent: "publicIntakeCreate" }, "editor");
    validateCreatedFeedback(args.feedback);

    const existing = await findFeedbackByPublicId(ctx, args.feedback.id);
    if (existing) {
      throw new Error("Article feedback already exists.");
    }

    await ctx.db.insert("articleFeedback", args.feedback);
    return args.feedback;
  },
});

export const list = query({
  args: {
    apiKey: v.string(),
    actorEmail: v.optional(v.string()),
    status: v.optional(statusValidator),
    limit: v.optional(v.number()),
  },
  returns: v.array(feedbackRowValidator),
  handler: async (ctx, args) => {
    await requireRole(
      ctx,
      { apiKey: args.apiKey, actorEmail: args.actorEmail, adminIntent: "editorArticleWrite" },
      "editor",
    );

    const limit = clampLimit(args.limit);
    const docs = args.status
      ? await ctx.db
          .query("articleFeedback")
          .withIndex("by_status_created", (q) => q.eq("status", args.status))
          .order("desc")
          .take(limit)
      : await ctx.db
          .query("articleFeedback")
          .withIndex("by_created_at")
          .order("desc")
          .take(limit);

    return docs.map(toFeedbackRow);
  },
});

/**
 * How many feedback rows sit in the given statuses. Convex has no count
 * aggregate, so this collects each status through `by_status_created` on the
 * server and returns only the total: the caller never downloads a list, and
 * the answer is not capped the way `list` is.
 */
export const countByStatus = query({
  args: {
    apiKey: v.string(),
    actorEmail: v.optional(v.string()),
    statuses: v.array(statusValidator),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    await requireRole(
      ctx,
      { apiKey: args.apiKey, actorEmail: args.actorEmail, adminIntent: "editorArticleWrite" },
      "editor",
    );

    let count = 0;
    for (const status of new Set(args.statuses)) {
      const docs = await ctx.db
        .query("articleFeedback")
        .withIndex("by_status_created", (q) => q.eq("status", status))
        .collect();
      count += docs.length;
    }

    return count;
  },
});

export const transition = mutation({
  args: {
    apiKey: v.string(),
    actorEmail: v.optional(v.string()),
    id: v.string(),
    status: statusValidator,
    reviewer: v.string(),
    note: v.optional(v.string()),
  },
  returns: feedbackRowValidator,
  handler: async (ctx, args) => {
    await requireRole(
      ctx,
      { apiKey: args.apiKey, actorEmail: args.actorEmail, adminIntent: "editorArticleWrite" },
      "admin",
    );

    const doc = await findFeedbackByPublicId(ctx, args.id);
    if (!doc) {
      throw new Error("Article feedback not found.");
    }

    if (!VALID_TRANSITIONS[doc.status].includes(args.status)) {
      throw new Error(`Illegal transition: ${doc.status} -> ${args.status}.`);
    }

    const timestamp = new Date().toISOString();
    const patch = {
      status: args.status,
      reviewed_by: args.reviewer,
      reviewed_at: timestamp,
      updated_at: timestamp,
      review_notes: args.note ?? doc.review_notes,
    };
    await ctx.db.patch(doc._id, patch);

    return toFeedbackRow({ ...doc, ...patch });
  },
});

function validateCreatedFeedback(row: FeedbackRow) {
  if (!row.substance_slug.trim() || !row.substance_title.trim()) {
    throw new Error("A substance reference is required.");
  }

  if (!row.details.trim()) {
    throw new Error("Details are required.");
  }

  const expectedStatus = row.honeypot_triggered ? "spam" : "new";
  if (row.status !== expectedStatus) {
    throw new Error(`Created feedback must start as ${expectedStatus}.`);
  }
}

async function findFeedbackByPublicId(ctx: ConvexReadCtx, id: string) {
  return await ctx.db
    .query("articleFeedback")
    .withIndex("by_public_id", (q) => q.eq("id", id))
    .first();
}

function toFeedbackRow(row: FeedbackRow): FeedbackRow {
  return {
    id: row.id,
    status: row.status,
    schema_version: row.schema_version,
    substance_slug: row.substance_slug,
    substance_title: row.substance_title,
    category: row.category,
    importance: row.importance,
    details: row.details,
    source_url: row.source_url,
    contact_email: row.contact_email,
    ip_hash: row.ip_hash,
    user_agent: row.user_agent,
    honeypot_triggered: row.honeypot_triggered,
    review_notes: row.review_notes,
    reviewed_by: row.reviewed_by,
    reviewed_at: row.reviewed_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function clampLimit(limit: number | undefined): number {
  return Math.max(1, Math.min(limit ?? 100, 250));
}
