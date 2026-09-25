import { v } from "../lib/postgres/runtime/values";
import { query, type MutationCtx, type QueryCtx } from "../lib/postgres/runtime/server";
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
import {
  FEEDBACK_OUTCOME_STATUS,
  linkedChangesOf,
  resolveCorrections,
  type CorrectionCandidates,
  type LinkedChange,
  type ResolvedCorrection,
} from "../src/features/intake/feedbackCorrection";

const statusValidator = v.union(
  v.literal("new"),
  v.literal("reviewing"),
  v.literal("resolved"),
  v.literal("rejected"),
  v.literal("spam"),
);

const outcomeValidator = v.union(
  v.literal("duplicate"),
  v.literal("explanation_provided"),
  v.literal("no_change_needed"),
);

const linkedChangeValidator = v.object({
  kind: v.union(v.literal("proposal"), v.literal("revision")),
  id: v.string(),
});

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
    outcome: v.optional(outcomeValidator),
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
    if (args.outcome && FEEDBACK_OUTCOME_STATUS[args.outcome] !== args.status) {
      throw new Error(`Illegal transition: the outcome ${args.outcome} closes feedback as ${FEEDBACK_OUTCOME_STATUS[args.outcome]}.`);
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
        ...(args.outcome ? { outcome: args.outcome } : {}),
      }),
    };
    await ctx.db.patch(doc._id, patch);

    return toFeedbackQueueItem({ ...doc, ...patch });
  },
});

/** Proposals and revisions of one article the correction reads consider. */
const CORRECTION_SCAN_LIMIT = 200;
/** How many recent proposals and revisions "Link existing change" offers. */
const CORRECTION_CANDIDATE_LIMIT = 20;

type CorrectionFacts = Parameters<typeof resolveCorrections>[1];

/**
 * The article's proposals and revisions, newest first, reduced to the facts
 * the correction resolver reads. No proposer, actor, payload or document
 * leaves this function.
 */
async function readCorrectionFacts(ctx: ReadCtx, slug: string): Promise<CorrectionFacts> {
  const [targets, revisions] = await Promise.all([
    ctx.db.query("articleProposalTargets").withIndex("by_slug_created", (q) => q.eq("slug", slug)).order("desc").take(CORRECTION_SCAN_LIMIT),
    ctx.db.query("articleRevisions").withIndex("by_slug", (q) => q.eq("slug", slug)).order("desc").take(CORRECTION_SCAN_LIMIT),
  ]);
  const seen = new Set<string>();
  const proposals: CorrectionFacts["proposals"][number][] = [];
  for (const target of targets) {
    if (seen.has(target.proposalId)) continue;
    seen.add(target.proposalId);
    const row = await ctx.db.get(target.proposalId);
    if (!row) continue;
    proposals.push({
      _id: row._id,
      status: row.status,
      summary: row.summary,
      createdAt: row.createdAt,
      ...(row.revisionOf ? { revisionOf: row.revisionOf } : {}),
    });
  }
  return {
    slug,
    proposals,
    revisions: revisions.map((row) => ({
      _id: row._id,
      changeId: row.changeId,
      summary: row.summary,
      createdAt: row.createdAt,
      ...(row.restoredFrom ? { restoredFrom: row.restoredFrom } : {}),
    })),
  };
}

/** Whether a linked change is about this article: a proposal targeting it, or one of its revisions. */
async function changeTargetsArticle(ctx: ReadCtx, change: LinkedChange, slug: string): Promise<boolean> {
  if (change.kind === "proposal") {
    const id = ctx.db.normalizeId("changeProposals", change.id);
    const row = id ? await ctx.db.get(id) : null;
    return !!row && row.targets.some((target) => target.kind === "article" && target.key === slug);
  }
  const id = ctx.db.normalizeId("articleRevisions", change.id);
  const row = id ? await ctx.db.get(id) : null;
  return !!row && row.slug === slug;
}

/**
 * Append a link entry to an article feedback item's decision log. The status
 * does not move. Linking the same change twice records nothing new. Returns
 * the row as it now stands.
 */
export async function recordFeedbackCorrectionLink(
  ctx: MutationCtx,
  input: { feedbackId: string; slug: string; actor: string; change: LinkedChange; note?: string },
) {
  const doc = await findFeedbackByPublicId(ctx, input.feedbackId);
  if (!doc) {
    throw new Error("Article feedback not found.");
  }
  if (doc.substance_slug !== input.slug) {
    throw new Error("Illegal link: the change is not about the article this feedback reports on.");
  }
  const log = decisionLogOf(doc);
  if (linkedChangesOf(log).some((link) => link.change.kind === input.change.kind && link.change.id === input.change.id)) {
    return toFeedbackQueueItem(doc);
  }
  const timestamp = new Date().toISOString();
  const note = input.note?.trim() ? input.note.trim() : undefined;
  // Linking is not a decision: status, reviewer and review note stay as they were.
  const patch = {
    updated_at: timestamp,
    decision_log: appendDecision(doc, {
      at: timestamp,
      actor: input.actor,
      from: doc.status,
      to: doc.status,
      linked_change: { kind: input.change.kind, id: input.change.id },
      ...(note ? { note } : {}),
    }),
  };
  await ctx.db.patch(doc._id, patch);
  return toFeedbackQueueItem({ ...doc, ...patch });
}

/**
 * The changes linked to one feedback item and where each stands now, plus the
 * article's recent proposals and revisions to link. Admin floor, like the
 * decisions: candidate proposals include other members' work.
 */
export async function correctionsHandler(
  ctx: QueryCtx,
  args: { apiKey?: string; actorEmail?: string; id: string },
): Promise<{ corrections: ResolvedCorrection[]; candidates: CorrectionCandidates }> {
  await requireRole(ctx, { apiKey: args.apiKey, actorEmail: args.actorEmail, adminIntent: "editorArticleWrite" }, "admin");
  const doc = await findFeedbackByPublicId(ctx, args.id);
  if (!doc) {
    throw new Error("Article feedback not found.");
  }
  const facts = await readCorrectionFacts(ctx, doc.substance_slug);
  const corrections = resolveCorrections(linkedChangesOf(decisionLogOf(doc)), facts);
  return {
    corrections,
    candidates: {
      proposals: facts.proposals.slice(0, CORRECTION_CANDIDATE_LIMIT).map(({ _id, status, summary, createdAt }) => ({ id: _id, status, summary, createdAt })),
      revisions: facts.revisions.slice(0, CORRECTION_CANDIDATE_LIMIT).map(({ _id, summary, createdAt }) => ({ id: _id, summary, createdAt })),
    },
  };
}

export const corrections = query({
  args: {
    apiKey: v.string(),
    actorEmail: v.optional(v.string()),
    id: v.string(),
  },
  handler: correctionsHandler,
});

export async function linkChangeHandler(
  ctx: MutationCtx,
  args: { apiKey?: string; actorEmail?: string; id: string; change: LinkedChange; note?: string },
) {
  const actor = await requireRole(
    ctx,
    { apiKey: args.apiKey, actorEmail: args.actorEmail, adminIntent: "editorArticleWrite" },
    "admin",
  );
  const doc = await findFeedbackByPublicId(ctx, args.id);
  if (!doc) {
    throw new Error("Article feedback not found.");
  }
  if (!(await changeTargetsArticle(ctx, args.change, doc.substance_slug))) {
    throw new Error("Illegal link: that change does not exist or is not about this article.");
  }
  return await recordFeedbackCorrectionLink(ctx, {
    feedbackId: args.id,
    slug: doc.substance_slug,
    actor: auditStampFor(actor, undefined),
    change: args.change,
    note: args.note,
  });
}

/** Link an existing proposal or published revision of the same article. Admin floor. */
export const linkChange = mutation({
  args: {
    apiKey: v.string(),
    actorEmail: v.optional(v.string()),
    id: v.string(),
    change: linkedChangeValidator,
    note: v.optional(v.string()),
  },
  returns: feedbackQueueItemValidator,
  handler: linkChangeHandler,
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
