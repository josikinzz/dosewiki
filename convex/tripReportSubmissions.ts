import { v } from "convex/values";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { requireAuth, requireEditorWrite } from "./lib/auth";
import {
  timelineEntryValidator,
  tripReportImportInputValidator,
  tripReportSubjectValidator,
  tripReportSubstanceValidator,
} from "./tripReportContract";

const statusValidator = v.union(
  v.literal("submitted"),
  v.literal("reviewing"),
  v.literal("accepted"),
  v.literal("rejected"),
  v.literal("spam"),
  v.literal("exported"),
);

const submissionReportValidator = v.object({
  title: v.string(),
  subject: tripReportSubjectValidator,
  substances: v.array(tripReportSubstanceValidator),
  introduction: v.optional(v.string()),
  onset: v.array(timelineEntryValidator),
  peak: v.array(timelineEntryValidator),
  offset: v.array(timelineEntryValidator),
  conclusion: v.optional(v.string()),
  tags: v.array(v.string()),
});

const submissionRowValidator = v.object({
  id: v.string(),
  status: statusValidator,
  schema_version: v.number(),
  report: submissionReportValidator,
  title: v.string(),
  author_name: v.string(),
  substance_names: v.array(v.string()),
  contact_email: v.optional(v.string()),
  may_contact: v.boolean(),
  publish_consent: v.boolean(),
  age_confirmed: v.boolean(),
  ip_hash: v.optional(v.string()),
  user_agent: v.optional(v.string()),
  honeypot_triggered: v.boolean(),
  review_notes: v.optional(v.string()),
  reviewed_by: v.optional(v.string()),
  reviewed_at: v.optional(v.string()),
  exported_trip_report_id: v.optional(v.id("tripReports")),
  exported_at: v.optional(v.string()),
  created_at: v.string(),
  updated_at: v.string(),
});

const promotionPreviewValidator = v.object({
  row: submissionRowValidator,
  payload: tripReportImportInputValidator,
});

const promotionResultValidator = v.object({
  submission: submissionRowValidator,
  reportId: v.id("tripReports"),
  payload: tripReportImportInputValidator,
});

type SubmissionStatus =
  | "submitted"
  | "reviewing"
  | "accepted"
  | "rejected"
  | "spam"
  | "exported";

type SubmissionRow = typeof submissionRowValidator.type;

type ConvexReadCtx = { db: QueryCtx["db"] };

const VALID_TRANSITIONS: Record<SubmissionStatus, SubmissionStatus[]> = {
  submitted: ["reviewing", "accepted", "rejected", "spam"],
  reviewing: ["accepted", "rejected", "spam", "submitted"],
  accepted: ["reviewing", "rejected"],
  rejected: ["reviewing"],
  spam: ["reviewing"],
  exported: [],
};

export const create = mutation({
  args: {
    apiKey: v.string(),
    submission: submissionRowValidator,
  },
  returns: submissionRowValidator,
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.apiKey, "editorArticleWrite");
    validateCreatedSubmission(args.submission);

    const existing = await findSubmissionByPublicId(ctx, args.submission.id);
    if (existing) {
      throw new Error("Trip report submission already exists.");
    }

    await ctx.db.insert("tripReportSubmissions", args.submission);
    return args.submission;
  },
});

export const list = query({
  args: {
    apiKey: v.string(),
    status: v.optional(statusValidator),
    limit: v.optional(v.number()),
  },
  returns: v.array(submissionRowValidator),
  handler: async (ctx, args) => {
    await requireEditorWrite(ctx, {
      apiKey: args.apiKey,
      adminIntent: "editorArticleWrite",
    });

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

export const get = query({
  args: {
    apiKey: v.string(),
    id: v.string(),
  },
  returns: v.union(submissionRowValidator, v.null()),
  handler: async (ctx, args) => {
    await requireEditorWrite(ctx, {
      apiKey: args.apiKey,
      adminIntent: "editorArticleWrite",
    });

    const doc = await findSubmissionByPublicId(ctx, args.id);
    return doc ? toSubmissionRow(doc) : null;
  },
});

export const transition = mutation({
  args: {
    apiKey: v.string(),
    id: v.string(),
    status: statusValidator,
    reviewer: v.string(),
    notes: v.optional(v.string()),
  },
  returns: submissionRowValidator,
  handler: async (ctx, args) => {
    await requireEditorWrite(ctx, {
      apiKey: args.apiKey,
      adminIntent: "editorArticleWrite",
    });

    const doc = await requireSubmission(ctx, args.id);
    if (!VALID_TRANSITIONS[doc.status].includes(args.status)) {
      throw new Error(`Illegal transition: ${doc.status} -> ${args.status}.`);
    }

    const timestamp = new Date().toISOString();
    const patch = {
      status: args.status,
      reviewed_by: args.reviewer,
      reviewed_at: timestamp,
      updated_at: timestamp,
      ...(args.notes !== undefined ? { review_notes: args.notes } : {}),
    };
    await ctx.db.patch(doc._id, patch);

    return toSubmissionRow({ ...doc, ...patch });
  },
});

export const previewPromotion = query({
  args: {
    apiKey: v.string(),
    id: v.string(),
  },
  returns: promotionPreviewValidator,
  handler: async (ctx, args) => {
    await requireEditorWrite(ctx, {
      apiKey: args.apiKey,
      adminIntent: "editorArticleWrite",
    });

    const doc = await requireSubmission(ctx, args.id);
    assertPromotable(doc);
    const payload = await buildPromotionPayload(ctx, doc);

    return {
      row: toSubmissionRow(doc),
      payload,
    };
  },
});

export const promote = mutation({
  args: {
    apiKey: v.string(),
    id: v.string(),
    reviewer: v.string(),
    notes: v.optional(v.string()),
  },
  returns: promotionResultValidator,
  handler: async (ctx, args) => {
    await requireEditorWrite(ctx, {
      apiKey: args.apiKey,
      adminIntent: "editorArticleWrite",
    });

    const doc = await requireSubmission(ctx, args.id);
    assertPromotable(doc);

    const payload = await buildPromotionPayload(ctx, doc);
    const reportId = await ctx.db.insert("tripReports", payload);
    const timestamp = new Date().toISOString();
    const patch = {
      status: "exported" as const,
      reviewed_by: args.reviewer,
      reviewed_at: timestamp,
      updated_at: timestamp,
      exported_at: timestamp,
      exported_trip_report_id: reportId,
      ...(args.notes !== undefined ? { review_notes: args.notes } : {}),
    };
    await ctx.db.patch(doc._id, patch);

    return {
      submission: toSubmissionRow({ ...doc, ...patch }),
      reportId,
      payload,
    };
  },
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

async function findSubmissionByPublicId(ctx: ConvexReadCtx, id: string) {
  return await ctx.db
    .query("tripReportSubmissions")
    .filter((q) => q.eq(q.field("id"), id))
    .first();
}

async function requireSubmission(ctx: ConvexReadCtx, id: string) {
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

async function buildPromotionPayload(ctx: ConvexReadCtx, row: SubmissionRow) {
  const slug = await resolveAvailableSlug(ctx, slugify(row.title));

  return {
    ...row.report,
    slug,
    featured: false,
  };
}

async function resolveAvailableSlug(ctx: ConvexReadCtx, baseSlug: string) {
  let candidate = baseSlug;
  let suffix = 2;

  while (await tripReportSlugExists(ctx, candidate)) {
    candidate = `${baseSlug}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}

async function tripReportSlugExists(ctx: ConvexReadCtx, slug: string) {
  const existing = await ctx.db
    .query("tripReports")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .first();

  return Boolean(existing);
}

function toSubmissionRow(row: SubmissionRow): SubmissionRow {
  return {
    id: row.id,
    status: row.status,
    schema_version: row.schema_version,
    report: row.report,
    title: row.title,
    author_name: row.author_name,
    substance_names: row.substance_names,
    contact_email: row.contact_email,
    may_contact: row.may_contact,
    publish_consent: row.publish_consent,
    age_confirmed: row.age_confirmed,
    ip_hash: row.ip_hash,
    user_agent: row.user_agent,
    honeypot_triggered: row.honeypot_triggered,
    review_notes: row.review_notes,
    reviewed_by: row.reviewed_by,
    reviewed_at: row.reviewed_at,
    exported_trip_report_id: row.exported_trip_report_id,
    exported_at: row.exported_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function clampLimit(limit: number | undefined): number {
  return Math.max(1, Math.min(limit ?? 100, 250));
}

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "untitled-report"
  );
}
