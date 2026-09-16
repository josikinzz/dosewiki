import { v } from "../lib/postgres/runtime/values";
import { query, type MutationCtx, type QueryCtx } from "../lib/postgres/runtime/server";
import { mutation } from "./lib/indexedMutation";
import { requireRole } from "./lib/auth";
import {
  assertAuthorNameClaimAdjudicated,
  resolveEditorAssignedProfileKey,
  stripSubmitterSubjectFields,
  withEditorAssignedProfileKey,
} from "./lib/tripReportAttribution";
import {
  timelineEntryValidator,
  tripReportImportInputValidator,
  tripReportSubjectValidator,
  tripReportSubstanceValidator,
} from "./tripReportContract";
import { findMembershipByEmail } from "./lib/tripReportOwnership";

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
  // Still accepts the submitter-restricted subject fields so rows stored before
  // intake started stripping them keep reading back; `create` and `promote`
  // drop them regardless.
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

const portalSubmissionSummaryValidator = v.object({
  id: v.string(),
  status: statusValidator,
  title: v.string(),
  author_name: v.string(),
  created_at: v.string(),
  report: v.object({
    subject: v.object({
      name: v.string(),
      trip_date: v.optional(v.string()),
    }),
    substances: v.array(tripReportSubstanceValidator),
    tags: v.array(v.string()),
  }),
});

const portalSubmissionIndexValidator = v.object({
  needsReview: v.array(portalSubmissionSummaryValidator),
  history: v.array(portalSubmissionSummaryValidator),
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

type ReadCtx = { db: QueryCtx["db"] };

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
    // Public intake relays an unauthenticated submitter: the server acts as
    // itself, so no actor is delegated.
    await requireRole(ctx, { apiKey: args.apiKey, adminIntent: "publicIntakeCreate" }, "editor");

    // The intake route relays an unauthenticated submitter, so the payload
    // cannot be trusted with contributor attribution or reader-facing links
    // even though the route itself authenticates as the server. Strip the
    // claims at the boundary that owns the stored row rather than relying on
    // the caller to have done it.
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

/**
 * Every submission in the given statuses, newest first. Unlike `list` this is
 * not capped: the portal's Needs review bucket has to hold every row the rail
 * badge counts, and `countByStatus` is the same walk without the payload.
 */
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

/**
 * Compact portal index: every needs-review row plus the non-needs rows found
 * in the same newest-250 history window used by `list({ limit: 250 })`.
 */
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

    const needsReviewDocs = await collectByStatuses(ctx, ["submitted", "reviewing"]);
    needsReviewDocs.sort((left, right) => right.created_at.localeCompare(left.created_at));

    const historyWindow = await ctx.db
      .query("tripReportSubmissions")
      .withIndex("by_created_at")
      .order("desc")
      .take(250);

    return {
      needsReview: needsReviewDocs.map(toPortalSubmissionSummary),
      history: historyWindow
        .filter((row) => row.status !== "submitted" && row.status !== "reviewing")
        .map(toPortalSubmissionSummary),
    };
  },
});

/**
 * Count submissions in the given statuses through `by_status_created`.
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

export const transition = mutation({
  args: {
    apiKey: v.string(),
    actorEmail: v.optional(v.string()),
    id: v.string(),
    status: statusValidator,
    reviewer: v.string(),
    notes: v.optional(v.string()),
  },
  returns: submissionRowValidator,
  handler: async (ctx, args) => {
    await requireRole(
      ctx,
      { apiKey: args.apiKey, actorEmail: args.actorEmail, adminIntent: "editorArticleWrite" },
      "admin",
    );

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
    actorEmail: v.optional(v.string()),
    id: v.string(),
    profileKey: v.optional(v.string()),
    // Preview runs the same attribution guard as promote, so an editor meets a
    // name collision before publishing rather than at the publish click.
    reviewer: v.optional(v.string()),
    confirmAuthorNameClaim: v.optional(v.boolean()),
  },
  returns: promotionPreviewValidator,
  handler: async (ctx, args) => {
    await requireRole(
      ctx,
      { apiKey: args.apiKey, actorEmail: args.actorEmail, adminIntent: "editorArticleWrite" },
      "editor",
    );

    const doc = await requireSubmission(ctx, args.id);
    assertPromotable(doc);
    const payload = await buildPromotionPayload(ctx, doc, {
      reviewer: args.reviewer ?? "",
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
    reviewer: string;
    notes?: string;
    profileKey?: string;
    confirmAuthorNameClaim?: boolean;
  },
) {
  await requireRole(
    ctx,
    { apiKey: args.apiKey, actorEmail: args.actorEmail, adminIntent: "editorArticleWrite" },
    "admin",
  );

  const doc = await requireSubmission(ctx, args.id);
  assertPromotable(doc);

  const payload = await buildPromotionPayload(ctx, doc, {
    reviewer: args.reviewer,
    requestedProfileKey: args.profileKey,
    confirmAuthorNameClaim: args.confirmAuthorNameClaim === true,
  });
  // A submitter who is already a member owns the published report and may
  // edit it from My reports. Matched on the contact email alone: the byline
  // is free text and proves nothing.
  const owner = doc.contact_email ? await findMembershipByEmail(ctx, doc.contact_email) : null;
  const reportId = await ctx.db.insert("tripReports", {
    ...payload,
    ...(owner ? { owner_email: owner.email } : {}),
  });
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
}

export const promote = mutation({
  args: {
    apiKey: v.string(),
    actorEmail: v.optional(v.string()),
    id: v.string(),
    reviewer: v.string(),
    notes: v.optional(v.string()),
    // Contributor attribution is an editor decision made here, never something
    // the submission carries in from the public form.
    profileKey: v.optional(v.string()),
    // Acknowledges that the submitted byline matches a real contributor and
    // that the editor is publishing it without granting that identity.
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
  const slug = await resolveAvailableSlug(ctx, slugify(row.title));
  const assignedProfileKey = await resolveEditorAssignedProfileKey(ctx, options.requestedProfileKey);
  await assertAuthorNameClaimAdjudicated(ctx, {
    authorName: row.report.subject.name,
    assignedProfileKey,
    confirmAuthorNameClaim: options.confirmAuthorNameClaim,
  });

  return {
    ...row.report,
    // Publishes only the attribution the promoting editor asked for. Any key,
    // avatar, or outbound link left on the stored row by the pre-hardening
    // intake path is discarded.
    subject: withEditorAssignedProfileKey(row.report.subject, assignedProfileKey),
    slug,
    featured: false,
    // Reports submitted through the public form are dedicated to the public
    // domain (CC0) by the submitter (see the submission consent copy).
    license: "public-domain",
    // Stamped on every promoted report, including the ones an editor declined
    // to attribute: the read path uses the marker's presence to know this
    // byline was written by an anonymous submitter and must not resolve to a
    // contributor on its own.
    attribution_review: {
      reviewed_by: options.reviewer,
      reviewed_at: new Date().toISOString(),
      decision: assignedProfileKey ? ("assigned" as const) : ("declined" as const),
    },
  };
}

function withoutSubmitterAttribution(row: SubmissionRow): SubmissionRow {
  return {
    ...row,
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

function toPortalSubmissionSummary(row: SubmissionRow) {
  return {
    id: row.id,
    status: row.status,
    title: row.title,
    author_name: row.author_name,
    created_at: row.created_at,
    report: {
      subject: {
        name: row.report.subject.name,
        ...(row.report.subject.trip_date ? { trip_date: row.report.subject.trip_date } : {}),
      },
      substances: row.report.substances,
      tags: row.report.tags,
    },
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
