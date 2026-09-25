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
  decision_log: v.optional(feedbackDecisionLog),
  created_at: v.string(),
  updated_at: v.string(),
});

const feedbackQueueItemValidator = v.object({
  id: v.string(),
  status: statusValidator,
  substance_slug: v.string(),
  substance_title: v.string(),
  category: categoryValidator,
  importance: importanceValidator,
  details: v.string(),
  source_url: v.optional(v.string()),
  contact_email: v.optional(v.string()),
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
    // Public intake relays an unauthenticated submitter: the server acts as
    // itself, so no actor is delegated.
    await requireRole(ctx, { apiKey: args.apiKey, adminIntent: "publicIntakeCreate" }, "editor");
    // New feedback has had no decisions; the log starts with the first transition.
    const { decision_log: _decisionLog, ...feedback } = args.feedback;
    validateCreatedFeedback(feedback);

    const existing = await findFeedbackByPublicId(ctx, feedback.id);
    if (existing) {
      throw new Error("Article feedback already exists.");
    }

    await ctx.db.insert("articleFeedback", feedback);
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
          .query("articleFeedback")
          .withIndex("by_status_created", (q) => q.eq("status", args.status))
          .order("desc")
          .take(limit)
      : await ctx.db
          .query("articleFeedback")
          .withIndex("by_created_at")
          .order("desc")
          .take(limit);

    return docs.map(toFeedbackQueueItem);
  },
});

/**
 * One page of the review queue with status and search applied on the server,
 * in a stable keyset order, and the per-status counts of every row the search
 * matches. Unlike `list`, no row falls outside the queue's reach.
 */
export const queuePage = query({
  args: {
    apiKey: v.string(),
    actorEmail: v.optional(v.string()),
    status: v.optional(statusValidator),
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

    const page = await readFeedbackQueue(ctx, "articleFeedback", { ...args, limit: clampLimit(args.limit) });
    return {
      feedback: page.rows.map((row) => toFeedbackQueueItem(row as unknown as FeedbackRow)),
      nextCursor: page.nextCursor,
      counts: page.counts,
    };
  },
});

/**
 * Count feedback rows in the given statuses with an uncapped native aggregate.
 * The caller receives only the total, without the cap applied by `list`.
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

    const reader = ctx.db as typeof ctx.db & {
      getFeedbackCountByStatuses: (
        table: "articleFeedback" | "siteFeedback",
        statuses: readonly string[],
      ) => Promise<number>;
    };
    return await reader.getFeedbackCountByStatuses("articleFeedback", args.statuses);
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
      throw new Error("Article feedback not found.");
    }

    if (!VALID_TRANSITIONS[doc.status].includes(args.status)) {
      throw new Error(`Illegal transition: ${doc.status} -> ${args.status}.`);
    }

    const timestamp = new Date().toISOString();
    // The resolved actor, never a caller-supplied name.
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

async function findFeedbackByPublicId(ctx: ReadCtx, id: string) {
  return await ctx.db
    .query("articleFeedback")
    .withIndex("by_public_id", (q) => q.eq("id", id))
    .first();
}


function toFeedbackQueueItem(row: FeedbackRow): FeedbackQueueItem {
  return {
    id: row.id,
    status: row.status,
    substance_slug: row.substance_slug,
    substance_title: row.substance_title,
    category: row.category,
    importance: row.importance,
    details: row.details,
    source_url: row.source_url,
    contact_email: row.contact_email,
    honeypot_triggered: row.honeypot_triggered,
    review_notes: row.review_notes,
    reviewed_by: row.reviewed_by,
    reviewed_at: row.reviewed_at,
    // A row decided before the log existed reads its review note back as the first entry.
    decision_log: decisionLogOf(row),
    created_at: row.created_at,
  };
}

function clampLimit(limit: number | undefined): number {
  return Math.max(1, Math.min(limit ?? 100, 250));
}
