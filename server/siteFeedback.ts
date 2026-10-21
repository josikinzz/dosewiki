import { v } from "../lib/postgres/runtime/values";
import { query, type QueryCtx } from "../lib/postgres/runtime/server";
import { mutation } from "./lib/indexedMutation";
import { requireRole } from "./lib/auth";
import { auditStampFor } from "./lib/auditStamp";
import {
  feedbackQueueCountsValidator,
  feedbackQueueOrderValidator,
  readFeedbackQueue,
} from "./lib/feedbackQueue";
import { feedbackDecisionLog } from "./lib/contentSchemaValidators";
import { appendDecision, decisionLogOf } from "../src/features/intake/decisionLog";

const statusValidator = v.union(
  v.literal("new"),
  v.literal("reviewing"),
  v.literal("resolved"),
  v.literal("rejected"),
  v.literal("spam"),
);

const categoryValidator = v.union(
  v.literal("article-request"),
  v.literal("technical"),
  v.literal("ui-design"),
  v.literal("performance"),
  v.literal("accessibility"),
  v.literal("misc"),
);

const urgencyValidator = v.union(
  v.literal("critical"),
  v.literal("high"),
  v.literal("normal"),
  v.literal("low"),
);

const feedbackRowValidator = v.object({
  id: v.string(),
  status: statusValidator,
  schema_version: v.number(),
  category: categoryValidator,
  urgency: v.optional(urgencyValidator),
  details: v.string(),
  page: v.optional(v.string()),
  email: v.optional(v.string()),
  ip_hash: v.optional(v.string()),
  user_agent: v.optional(v.string()),
  honeypot_triggered: v.boolean(),
  review_notes: v.optional(v.string()),
  reviewed_by: v.optional(v.string()),
  reviewed_at: v.optional(v.string()),
  decision_log: v.optional(feedbackDecisionLog),
  created_at: v.string(),
  updated_at: v.string(),
});

const feedbackQueueItemValidator = v.object({
  id: v.string(),
  status: statusValidator,
  category: categoryValidator,
  urgency: v.optional(urgencyValidator),
  details: v.string(),
  page: v.optional(v.string()),
  email: v.optional(v.string()),
  honeypot_triggered: v.boolean(),
  review_notes: v.optional(v.string()),
  reviewed_by: v.optional(v.string()),
  reviewed_at: v.optional(v.string()),
  decision_log: v.optional(feedbackDecisionLog),
  created_at: v.string(),
});

type FeedbackStatus = "new" | "reviewing" | "resolved" | "rejected" | "spam";

type FeedbackRow = typeof feedbackRowValidator.type;
type FeedbackQueueItem = typeof feedbackQueueItemValidator.type;

type ReadCtx = { db: QueryCtx["db"] };

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
    await requireRole(ctx, { apiKey: args.apiKey, adminIntent: "publicIntakeCreate" }, "editor");
    const { decision_log: _decisionLog, ...feedback } = args.feedback;
    validateCreatedFeedback(feedback);

    const existing = await findFeedbackByPublicId(ctx, feedback.id);
    if (existing) {
      throw new Error("Site feedback already exists.");
    }

    await ctx.db.insert("siteFeedback", feedback);
    return feedback;
  },
});

export const list = query({
  args: {
    apiKey: v.string(),
    actorEmail: v.optional(v.string()),
    status: v.optional(statusValidator),
    limit: v.optional(v.number()),
  },
  returns: v.array(feedbackQueueItemValidator),
  handler: async (ctx, args) => {
    await requireRole(
      ctx,
      { apiKey: args.apiKey, actorEmail: args.actorEmail, adminIntent: "editorArticleWrite" },
      "editor",
    );

    const limit = clampLimit(args.limit);
    const docs = args.status
      ? await ctx.db
          .query("siteFeedback")
          .withIndex("by_status_created", (q) => q.eq("status", args.status))
          .order("desc")
          .take(limit)
      : await ctx.db
          .query("siteFeedback")
          .withIndex("by_created_at")
          .order("desc")
          .take(limit);

    return docs.map(toFeedbackQueueItem);
  },
});

export const queuePage = query({
  args: {
    apiKey: v.string(),
    actorEmail: v.optional(v.string()),
    status: v.optional(v.union(statusValidator, v.literal("unresolved"))),
    search: v.optional(v.string()),
    order: v.optional(feedbackQueueOrderValidator),
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: v.object({
    feedback: v.array(feedbackQueueItemValidator),
    nextCursor: v.union(v.string(), v.null()),
    counts: feedbackQueueCountsValidator,
  }),
  handler: async (ctx, args) => {
    await requireRole(
      ctx,
      { apiKey: args.apiKey, actorEmail: args.actorEmail, adminIntent: "editorArticleWrite" },
      "editor",
    );

    const page = await readFeedbackQueue(ctx, "siteFeedback", { ...args, limit: clampLimit(args.limit) });
    return {
      feedback: page.rows.map((row) => toFeedbackQueueItem(row as unknown as FeedbackRow)),
      nextCursor: page.nextCursor,
      counts: page.counts,
    };
  },
});

export const get = query({
  args: {
    apiKey: v.string(),
    actorEmail: v.optional(v.string()),
    id: v.string(),
  },
  returns: v.union(feedbackQueueItemValidator, v.null()),
  handler: async (ctx, args) => {
    await requireRole(
      ctx,
      { apiKey: args.apiKey, actorEmail: args.actorEmail, adminIntent: "editorArticleWrite" },
      "editor",
    );

    const doc = await findFeedbackByPublicId(ctx, args.id);
    return doc ? toFeedbackQueueItem(doc as unknown as FeedbackRow) : null;
  },
});

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

    return await ctx.db.getFeedbackCountByStatuses("siteFeedback", args.statuses);
  },
});

export const transition = mutation({
  args: {
    apiKey: v.string(),
    actorEmail: v.optional(v.string()),
    id: v.string(),
    status: statusValidator,
    note: v.optional(v.string()),
  },
  returns: feedbackQueueItemValidator,
  handler: async (ctx, args) => {
    const actor = await requireRole(
      ctx,
      { apiKey: args.apiKey, actorEmail: args.actorEmail, adminIntent: "editorArticleWrite" },
      "admin",
    );

    const doc = await findFeedbackByPublicId(ctx, args.id);
    if (!doc) {
      throw new Error("Site feedback not found.");
    }

    if (!VALID_TRANSITIONS[doc.status].includes(args.status)) {
      throw new Error(`Illegal transition: ${doc.status} -> ${args.status}.`);
    }

    const timestamp = new Date().toISOString();
    const reviewer = auditStampFor(actor, undefined);
    const note = args.note?.trim() ? args.note : undefined;
    const patch = {
      status: args.status,
      reviewed_by: reviewer,
      reviewed_at: timestamp,
      updated_at: timestamp,
      review_notes: args.note ?? doc.review_notes,
      decision_log: appendDecision(doc, {
        at: timestamp,
        actor: reviewer,
        from: doc.status,
        to: args.status,
        ...(note !== undefined ? { note } : {}),
      }),
    };
    await ctx.db.patch(doc._id, patch);

    return toFeedbackQueueItem({ ...doc, ...patch });
  },
});

function validateCreatedFeedback(row: FeedbackRow) {
  if (!row.details.trim()) {
    throw new Error("Details are required.");
  }

  const expectedStatus = row.honeypot_triggered ? "spam" : "new";
  if (row.status !== expectedStatus) {
    throw new Error(`Created feedback must start as ${expectedStatus}.`);
  }
}

async function findFeedbackByPublicId(ctx: ReadCtx, id: string) {
  return await ctx.db
    .query("siteFeedback")
    .withIndex("by_public_id", (q) => q.eq("id", id))
    .first();
}


function toFeedbackQueueItem(row: FeedbackRow): FeedbackQueueItem {
  return {
    id: row.id,
    status: row.status,
    category: row.category,
    urgency: row.urgency,
    details: row.details,
    page: row.page,
    email: row.email,
    honeypot_triggered: row.honeypot_triggered,
    review_notes: row.review_notes,
    reviewed_by: row.reviewed_by,
    reviewed_at: row.reviewed_at,
    decision_log: decisionLogOf(row),
    created_at: row.created_at,
  };
}

function clampLimit(limit: number | undefined): number {
  return Math.max(1, Math.min(limit ?? 100, 250));
}
