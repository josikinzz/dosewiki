import { v } from "convex/values";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { requireAuth, requireEditorWrite } from "./lib/auth";
import {
  findProfileByAuthorName,
  normalizeAssignedProfileKey,
  stripSubmitterSubjectFields,
  withEditorAssignedProfileKey,
} from "./lib/tripReportAttribution";
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
    profileKey: v.optional(v.string()),
    // Preview runs the same attribution guard as promote, so an editor meets a
    // name collision before publishing rather than at the publish click.
    reviewer: v.optional(v.string()),
    confirmAuthorNameClaim: v.optional(v.boolean()),
  },
  returns: promotionPreviewValidator,
  handler: async (ctx, args) => {
    await requireEditorWrite(ctx, {
      apiKey: args.apiKey,
      adminIntent: "editorArticleWrite",
    });

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

export const promote = mutation({
  args: {
    apiKey: v.string(),
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
  handler: async (ctx, args) => {
    await requireEditorWrite(ctx, {
      apiKey: args.apiKey,
      adminIntent: "editorArticleWrite",
    });

    const doc = await requireSubmission(ctx, args.id);
    assertPromotable(doc);

    const payload = await buildPromotionPayload(ctx, doc, {
      reviewer: args.reviewer,
      requestedProfileKey: args.profileKey,
      confirmAuthorNameClaim: args.confirmAuthorNameClaim === true,
    });
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
    .withIndex("by_public_id", (q) => q.eq("id", id))
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

type PromotionAttributionOptions = {
  reviewer: string;
  requestedProfileKey?: string;
  confirmAuthorNameClaim: boolean;
};

async function buildPromotionPayload(
  ctx: ConvexReadCtx,
  row: SubmissionRow,
  options: PromotionAttributionOptions,
) {
  const slug = await resolveAvailableSlug(ctx, slugify(row.title));
  const assignedProfileKey = await resolveEditorAssignedProfileKey(ctx, options.requestedProfileKey);
  await assertAuthorNameClaimAdjudicated(ctx, row.report.subject.name, assignedProfileKey, options);

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

/**
 * A submitted byline is an unverified string, and the public read path resolves
 * bylines to contributor profiles by exact name. Promoting "nervewing" as-is
 * would therefore hand that contributor's page, avatar, and report list to
 * whoever typed the name. The editor is looking straight at the submission at
 * this moment, so this is where the claim gets adjudicated: grant it by
 * assigning that profile's key, or acknowledge it and publish unattributed.
 */
async function assertAuthorNameClaimAdjudicated(
  ctx: ConvexReadCtx,
  authorName: string,
  assignedProfileKey: string,
  options: PromotionAttributionOptions,
) {
  // contributorProfiles is a small dimension table with no name index, and the
  // public profile reads already collect it wholesale.
  const profiles = await ctx.db.query("contributorProfiles").collect();
  const matched = findProfileByAuthorName(profiles, authorName);

  if (!matched) {
    return;
  }

  const matchedKey = normalizeAssignedProfileKey(matched.key);
  if (assignedProfileKey && assignedProfileKey === matchedKey) {
    return;
  }

  if (options.confirmAuthorNameClaim) {
    return;
  }

  throw new Error(
    `Author name "${authorName}" matches contributor profile "${matchedKey}". ` +
      "Assign that profile key to attribute the report, or confirm publishing it without attribution.",
  );
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

/**
 * Resolve the contributor key an editor assigned during promotion. Unknown keys
 * are rejected rather than published, so a typo cannot mint a report that links
 * to a contributor page nobody owns.
 */
async function resolveEditorAssignedProfileKey(ctx: ConvexReadCtx, requestedKey: string | undefined) {
  const profileKey = normalizeAssignedProfileKey(requestedKey);
  if (!profileKey) {
    return "";
  }

  const profile = await ctx.db
    .query("contributorProfiles")
    .withIndex("by_key", (q) => q.eq("key", profileKey))
    .first();

  if (!profile) {
    throw new Error(`Contributor profile "${profileKey}" not found.`);
  }

  return profileKey;
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
