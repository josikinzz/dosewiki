import { v } from "../lib/postgres/runtime/values";
import { query, type MutationCtx, type QueryCtx } from "../lib/postgres/runtime/server";
import { mutation } from "./lib/indexedMutation";
import { requireRole } from "./lib/auth";
import { auditStampFor } from "./lib/auditStamp";
import {
  assertAuthorNameClaimAdjudicated,
  resolveEditorAssignedProfileKey,
  stripSubmitterSubjectFields,
  withEditorAssignedProfileKey,
} from "./lib/tripReportAttribution";
import {
  memberSubmissionValidator,
  portalSubmissionIndexValidator,
  promotionPreviewValidator,
  promotionResultValidator,
  statusValidator,
  submissionRowValidator,
  toMemberSubmission,
  toPortalSubmissionSummary,
  toSubmissionRow,
  type MemberSubmission,
  type SubmissionRow,
  type SubmissionStatus,
} from "./lib/tripReportSubmissionRows";
import { findMembershipByEmail } from "./lib/tripReportOwnership";
import {
  canTransitionTripReportSubmission,
  decisionNoteOrUndefined,
} from "../src/features/reports/submissions/tripReportSubmissionStatus";
import { tripReportSlug } from "../src/features/reports/submissions/tripReportSubmissions";
import { appendDecision } from "../src/features/intake/decisionLog";

type ReadCtx = { db: QueryCtx["db"] };

export const create = mutation({
  args: {
    apiKey: v.string(),
    submission: submissionRowValidator,
  },
  returns: submissionRowValidator,
  handler: async (ctx, args) => {
    await requireRole(ctx, { apiKey: args.apiKey, adminIntent: "publicIntakeCreate" }, "editor");

    const submission = withoutSubmitterAttribution(args.submission);
    validateCreatedSubmission(submission);

    const existing = await findSubmissionByPublicId(ctx, submission.id);
    if (existing) {
      throw new Error("Trip report submission already exists.");
    }

    await ctx.db.insert("tripReportSubmissions", submission);
    return submission;
  },
});

export const list = query({
  args: {
    apiKey: v.string(),
    actorEmail: v.optional(v.string()),
    status: v.optional(statusValidator),
    limit: v.optional(v.number()),
  },
  returns: v.array(submissionRowValidator),
  handler: async (ctx, args) => {
    await requireRole(
      ctx,
      { apiKey: args.apiKey, actorEmail: args.actorEmail, adminIntent: "editorArticleWrite" },
      "editor",
    );

    const limit = clampLimit(args.limit);
    const docs = args.status
      ? await ctx.db
          .query("tripReportSubmissions")
          .withIndex("by_status_created", (q) => q.eq("status", args.status))
          .order("desc")
          .take(limit)
      : await ctx.db
          .query("tripReportSubmissions")
          .withIndex("by_created_at")
          .order("desc")
          .take(limit);

    return docs.map(toSubmissionRow);
  },
});

export const listByStatuses = query({
  args: {
    apiKey: v.string(),
    actorEmail: v.optional(v.string()),
    statuses: v.array(statusValidator),
  },
  returns: v.array(submissionRowValidator),
  handler: async (ctx, args) => {
    await requireRole(
      ctx,
      { apiKey: args.apiKey, actorEmail: args.actorEmail, adminIntent: "editorArticleWrite" },
      "editor",
    );

    const docs = await collectByStatuses(ctx, args.statuses);
    docs.sort((left, right) => right.created_at.localeCompare(left.created_at));
    return docs.map(toSubmissionRow);
  },
});

const NEEDS_REVIEW_STATUSES = ["submitted", "reviewing", "accepted"] as const;

export const listPortalSummaries = query({
  args: {
    apiKey: v.string(),
    actorEmail: v.optional(v.string()),
  },
  returns: portalSubmissionIndexValidator,
  handler: async (ctx, args) => {
    await requireRole(
      ctx,
      { apiKey: args.apiKey, actorEmail: args.actorEmail, adminIntent: "editorArticleWrite" },
      "editor",
    );

    const needsReviewDocs = await collectByStatuses(ctx, [...NEEDS_REVIEW_STATUSES]);
    needsReviewDocs.sort((left, right) => right.created_at.localeCompare(left.created_at));

    const historyWindow = await ctx.db
      .query("tripReportSubmissions")
      .withIndex("by_created_at")
      .order("desc")
      .take(250);

    return {
      needsReview: needsReviewDocs.map(toPortalSubmissionSummary),
      history: historyWindow
        .filter((row) => !(NEEDS_REVIEW_STATUSES as readonly string[]).includes(row.status))
        .map(toPortalSubmissionSummary),
    };
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

    const docs = await collectByStatuses(ctx, args.statuses);
    return docs.length;
  },
});

async function collectByStatuses(ctx: ReadCtx, statuses: SubmissionStatus[]): Promise<SubmissionRow[]> {
  const docs: SubmissionRow[] = [];
  for (const status of new Set(statuses)) {
    docs.push(
      ...(await ctx.db
        .query("tripReportSubmissions")
        .withIndex("by_status_created", (q) => q.eq("status", status))
        .collect()),
    );
  }

  return docs;
}

export const get = query({
  args: {
    apiKey: v.string(),
    actorEmail: v.optional(v.string()),
    id: v.string(),
  },
  returns: v.union(submissionRowValidator, v.null()),
  handler: async (ctx, args) => {
    await requireRole(
      ctx,
      { apiKey: args.apiKey, actorEmail: args.actorEmail, adminIntent: "editorArticleWrite" },
      "editor",
    );

    const doc = await findSubmissionByPublicId(ctx, args.id);
    return doc ? toSubmissionRow(doc) : null;
  },
});

export async function listMineHandler(ctx: QueryCtx, args: { apiKey: string; actorEmail?: string }) {
  if (!args.actorEmail?.trim()) {
    throw new Error("A signed-in member is required to list their submissions.");
  }
  const actor = await requireRole(
    ctx,
    { apiKey: args.apiKey, actorEmail: args.actorEmail, adminIntent: "editorArticleWrite" },
    "contributor",
  );

  const rows = (await ctx.db.query("tripReportSubmissions").collect()).filter(
    (row) =>
      row.contact_email?.trim().toLowerCase() === actor.email &&
      row.status !== "spam" &&
      !row.honeypot_triggered,
  );
  rows.sort((left, right) => right.created_at.localeCompare(left.created_at));

  const mine: MemberSubmission[] = [];
  for (const row of rows) {
    const report = row.exported_trip_report_id ? await ctx.db.get(row.exported_trip_report_id) : null;
    mine.push(toMemberSubmission(row, report?.slug));
  }
  return mine;
}

export const listMine = query({
  args: {
    apiKey: v.string(),
    actorEmail: v.optional(v.string()),
  },
  returns: v.array(memberSubmissionValidator),
  handler: listMineHandler,
});

export const transition = mutation({
  args: {
    apiKey: v.string(),
    actorEmail: v.optional(v.string()),
    id: v.string(),
    status: statusValidator,
    notes: v.optional(v.string()),
    publicReason: v.optional(v.string()),
  },
  returns: submissionRowValidator,
  handler: async (ctx, args) => {
    const actor = await requireRole(
      ctx,
      { apiKey: args.apiKey, actorEmail: args.actorEmail, adminIntent: "editorArticleWrite" },
      "admin",
    );

    const doc = await requireSubmission(ctx, args.id);
    if (!canTransitionTripReportSubmission(doc.status, args.status)) {
      throw new Error(`Illegal transition: ${doc.status} -> ${args.status}.`);
    }

    const timestamp = new Date().toISOString();
    const notes = decisionNoteOrUndefined(args.notes);
    const publicReason = decisionNoteOrUndefined(args.publicReason);
    const reviewer = auditStampFor(actor, undefined);
    const patch = {
      status: args.status,
      reviewed_by: reviewer,
      reviewed_at: timestamp,
      updated_at: timestamp,
      ...(notes !== undefined ? { review_notes: notes } : {}),
      decision_log: appendDecision(doc, {
        at: timestamp,
        actor: reviewer,
        from: doc.status,
        to: args.status,
        ...(notes !== undefined ? { note: notes } : {}),
        ...(publicReason !== undefined ? { public_reason: publicReason } : {}),
      }),
    };
    await ctx.db.patch(doc._id, patch);

    return toSubmissionRow({ ...doc, ...patch });
  },
});

export const previewPromotion = query({
  args: {
    apiKey: v.string(),
    actorEmail: v.optional(v.string()),
    id: v.string(),
    profileKey: v.optional(v.string()),
    confirmAuthorNameClaim: v.optional(v.boolean()),
  },
  returns: promotionPreviewValidator,
  handler: async (ctx, args) => {
    const actor = await requireRole(
      ctx,
      { apiKey: args.apiKey, actorEmail: args.actorEmail, adminIntent: "editorArticleWrite" },
      "editor",
    );

    const doc = await requireSubmission(ctx, args.id);
    assertPromotable(doc);
    const payload = await buildPromotionPayload(ctx, doc, {
      reviewer: auditStampFor(actor, undefined),
      requestedProfileKey: args.profileKey,
      confirmAuthorNameClaim: args.confirmAuthorNameClaim === true,
    });

    return {
      row: toSubmissionRow(doc),
      payload,
    };
  },
});

export async function promoteHandler(
  ctx: MutationCtx,
  args: {
    apiKey: string;
    actorEmail?: string;
    id: string;
    notes?: string;
    profileKey?: string;
    confirmAuthorNameClaim?: boolean;
  },
) {
  const actor = await requireRole(
    ctx,
    { apiKey: args.apiKey, actorEmail: args.actorEmail, adminIntent: "editorArticleWrite" },
    "admin",
  );
  const reviewer = auditStampFor(actor, undefined);

  const doc = await requireSubmission(ctx, args.id);
  assertPromotable(doc);

  const payload = await buildPromotionPayload(ctx, doc, {
    reviewer,
    requestedProfileKey: args.profileKey,
    confirmAuthorNameClaim: args.confirmAuthorNameClaim === true,
  });
  const suggested = doc.contact_email ? await findMembershipByEmail(ctx, doc.contact_email) : null;
  const reportId = await ctx.db.insert("tripReports", payload);
  const timestamp = new Date().toISOString();
  const notes = decisionNoteOrUndefined(args.notes);
  const patch = {
    status: "exported" as const,
    reviewed_by: reviewer,
    reviewed_at: timestamp,
    updated_at: timestamp,
    exported_at: timestamp,
    exported_trip_report_id: reportId,
    ...(notes !== undefined ? { review_notes: notes } : {}),
    decision_log: appendDecision(doc, {
      at: timestamp,
      actor: reviewer,
      from: doc.status,
      to: "exported",
      ...(notes !== undefined ? { note: notes } : {}),
    }),
  };
  await ctx.db.patch(doc._id, patch);

  return {
    submission: toSubmissionRow({ ...doc, ...patch }),
    reportId,
    payload,
    suggestedOwner: suggested
      ? { email: suggested.email, ...(suggested.username ? { username: suggested.username } : {}) }
      : null,
  };
}

export const promote = mutation({
  args: {
    apiKey: v.string(),
    actorEmail: v.optional(v.string()),
    id: v.string(),
    notes: v.optional(v.string()),
    profileKey: v.optional(v.string()),
    confirmAuthorNameClaim: v.optional(v.boolean()),
  },
  returns: promotionResultValidator,
  handler: promoteHandler,
});

function validateCreatedSubmission(row: SubmissionRow) {
  if (!row.title.trim() || !row.report.title.trim()) {
    throw new Error("Title is required.");
  }

  if (row.substance_names.length === 0 || row.report.substances.length === 0) {
    throw new Error("At least one substance is required.");
  }

  if (!row.publish_consent) {
    throw new Error("Publish consent is required.");
  }

  if (!row.age_confirmed) {
    throw new Error("Age confirmation is required.");
  }

  const expectedStatus = row.honeypot_triggered ? "spam" : "submitted";
  if (row.status !== expectedStatus) {
    throw new Error(`Created submissions must start as ${expectedStatus}.`);
  }
}

async function findSubmissionByPublicId(ctx: ReadCtx, id: string) {
  return await ctx.db
    .query("tripReportSubmissions")
    .withIndex("by_public_id", (q) => q.eq("id", id))
    .first();
}

async function requireSubmission(ctx: ReadCtx, id: string) {
  const doc = await findSubmissionByPublicId(ctx, id);
  if (!doc) {
    throw new Error("Trip report submission not found.");
  }

  return doc;
}

function assertPromotable(row: SubmissionRow) {
  if (row.status !== "accepted") {
    throw new Error(`Only accepted submissions can be promoted. Current status: ${row.status}.`);
  }
}

type PromotionAttributionOptions = {
  reviewer: string;
  requestedProfileKey?: string;
  confirmAuthorNameClaim: boolean;
};

async function buildPromotionPayload(
  ctx: ReadCtx,
  row: SubmissionRow,
  options: PromotionAttributionOptions,
) {
  const slug = await resolveAvailableSlug(ctx, tripReportSlug(row.title));
  const assignedProfileKey = await resolveEditorAssignedProfileKey(ctx, options.requestedProfileKey);
  await assertAuthorNameClaimAdjudicated(ctx, {
    authorName: row.report.subject.name,
    assignedProfileKey,
    confirmAuthorNameClaim: options.confirmAuthorNameClaim,
  });

  return {
    ...row.report,
    subject: withEditorAssignedProfileKey(row.report.subject, assignedProfileKey),
    slug,
    featured: false,
    license: "public-domain",
    attribution_review: {
      reviewed_by: options.reviewer,
      reviewed_at: new Date().toISOString(),
      decision: assignedProfileKey ? ("assigned" as const) : ("declined" as const),
    },
  };
}

function withoutSubmitterAttribution(row: SubmissionRow): SubmissionRow {
  const { decision_log: _decisionLog, ...submitted } = row;
  return {
    ...submitted,
    report: {
      ...row.report,
      subject: stripSubmitterSubjectFields(row.report.subject),
    },
  };
}

async function resolveAvailableSlug(ctx: ReadCtx, baseSlug: string) {
  let candidate = baseSlug;
  let suffix = 2;

  while (await tripReportSlugExists(ctx, candidate)) {
    candidate = `${baseSlug}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}

async function tripReportSlugExists(ctx: ReadCtx, slug: string) {
  const existing = await ctx.db
    .query("tripReports")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .first();

  return Boolean(existing);
}

function clampLimit(limit: number | undefined): number {
  return Math.max(1, Math.min(limit ?? 100, 250));
}
