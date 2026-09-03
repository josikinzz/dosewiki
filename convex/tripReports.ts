import { ConvexError, v } from "convex/values";
import {
  query,
  mutation,
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireRole, roleMeetsFloor } from "./lib/auth";
import {
  assertAuthorNameClaimAdjudicated,
  normalizeAssignedProfileKey,
  normalizeAuthorMatchName,
  resolveEditorAssignedProfileKey,
} from "./lib/tripReportAttribution";
import {
  editableSnapshotOf,
  editableSnapshotsAgree,
  normalizeEditableFields,
  validateEditableFields,
  type TripReportEditableFields,
} from "./lib/tripReportEditing";
import {
  timelineEntryValidator,
  tripReportImportInputValidator,
  tripReportSubstanceValidator,
} from "./tripReportContract";
import { findMembershipByEmail, ownsReport, refuseNotOwner } from "./lib/tripReportOwnership";
import {
  deleteTripReportSubstanceRows,
  findTripReportsBySubstanceNames,
  syncTripReportSubstanceRows,
} from "./lib/tripReportSubstanceIndex";

/**
 * Trip report functions.
 * 
 * These functions provide CRUD operations for trip reports imported from EffectIndex.
 */

/**
 * Get all trip reports.
 */
export const getAll = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("tripReports").collect();
  },
});

/**
 * Get a single trip report by slug.
 */
export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("tripReports")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
  },
});

/**
 * Get featured trip reports.
 */
export const getFeatured = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("tripReports")
      .withIndex("by_featured", (q) => q.eq("featured", true))
      .collect();
  },
});

/**
 * Get trip reports by substance name.
 * Filters reports where any substance matches the given name (case-insensitive).
 */
export const getBySubstance = query({
  args: { substanceName: v.string() },
  handler: async (ctx, args) => findTripReportsBySubstanceNames(ctx, [args.substanceName]),
});

/**
 * Get trip reports by multiple substance names (batch query).
 * Filters reports where any substance matches any of the given names (case-insensitive).
 * This consolidates multiple getBySubstance calls into a single query.
 *
 * Served from the `tripReportSubstances` join table once it is populated; the
 * legacy whole-table scan remains only as the pre-backfill fallback.
 */
export const getBySubstanceNames = query({
  args: { substanceNames: v.array(v.string()) },
  handler: async (ctx, args) => findTripReportsBySubstanceNames(ctx, args.substanceNames),
});

/**
 * Get trip reports by author name.
 * Filters reports where subject.name matches (case-insensitive).
 */
export const getByAuthor = query({
  args: { authorName: v.string() },
  handler: async (ctx, args) => {
    const allReports = await ctx.db.query("tripReports").collect();
    const lowerName = args.authorName.toLowerCase();
    
    return allReports.filter(
      (report) => report.subject.name.toLowerCase() === lowerName
    );
  },
});

export const getByContributor = query({
  args: {
    profileKey: v.string(),
    authorNames: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const allReports = await ctx.db.query("tripReports").collect();
    const normalizedProfileKey = args.profileKey.trim().toUpperCase();
    const lowerNames = new Set(
      args.authorNames.map((name) => name.trim().toLowerCase()).filter(Boolean),
    );

    return allReports.filter((report) => {
      if (report.subject.profile_key === normalizedProfileKey) {
        return true;
      }

      return lowerNames.has(report.subject.name.trim().toLowerCase());
    });
  },
});

/**
 * Get all unique substance names from reports.
 */
export const getSubstanceNames = query({
  args: {},
  handler: async (ctx) => {
    const allReports = await ctx.db.query("tripReports").collect();
    const names = new Set<string>();
    
    for (const report of allReports) {
      for (const substance of report.substances) {
        names.add(substance.name);
      }
    }
    
    return Array.from(names).sort();
  },
});

/**
 * Get all unique author names from reports.
 */
export const getAuthorNames = query({
  args: {},
  handler: async (ctx) => {
    const allReports = await ctx.db.query("tripReports").collect();
    const names = new Set<string>();
    
    for (const report of allReports) {
      names.add(report.subject.name);
    }
    
    return Array.from(names).sort();
  },
});

/**
 * The subject fields the Trip Report Portal's form owns.
 *
 * `profile_key` is absent on purpose: attribution is decided by the `profileKey`
 * argument below, which resolves against `contributorProfiles` and runs the
 * name-claim guard. `avatar_url` and `pdf_url` are absent because the form does
 * not surface them, and an update preserves whatever the stored row carried.
 */
const editableSubjectValidator = v.object({
  name: v.string(),
  trip_date: v.optional(v.string()),
  age: v.optional(v.string()),
  gender: v.optional(v.string()),
  height: v.optional(v.string()),
  weight: v.optional(v.string()),
  medications: v.optional(v.string()),
  setting: v.optional(v.string()),
});

/**
 * The editable slice of a stored report. A compact validator rather than the
 * whole `storedTripReportValidator`, so `slug`, `featured`, `license`, and
 * `attribution_review` cannot be rewritten by a field edit.
 */
const editableTripReportFieldsValidator = v.object({
  title: v.string(),
  subject: editableSubjectValidator,
  substances: v.array(tripReportSubstanceValidator),
  introduction: v.optional(v.string()),
  onset: v.array(timelineEntryValidator),
  peak: v.array(timelineEntryValidator),
  offset: v.array(timelineEntryValidator),
  conclusion: v.optional(v.string()),
  tags: v.array(v.string()),
});

/**
 * Index rows for the Trip Report Portal (`/dev` → Trip reports).
 *
 * A projection, not the corpus: the portal's list, search, facets, grouping and
 * stats only ever read a report's identity, byline, substances, tags and date,
 * while the bulk of a stored row is prose — introduction, three timelines,
 * conclusion — which nothing on the index renders. Shipping that prose for every
 * report made the tab's first payload grow with the corpus for no visible gain,
 * so the body now arrives per report from `getPortalRecord` when a row is
 * opened.
 *
 * The projected values still come off the shared normalizer, so a title or a
 * substance name reads identically in the list and in the editor.
 *
 * Editor-gated because the portal shows unpublished-adjacent metadata
 * (attribution decisions, license) that no public projection returns.
 */
export const getPortalRows = query({
  args: { apiKey: v.optional(v.string()), actorEmail: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireRole(
      ctx,
      { apiKey: args.apiKey, actorEmail: args.actorEmail, adminIntent: "editorArticleWrite" },
      "editor",
    );

    const reports = await ctx.db.query("tripReports").collect();

    return reports.map((report) => {
      const fields = editableSnapshotOf(report);

      return {
        id: report._id,
        slug: report.slug,
        title: fields.title,
        subject: { name: fields.subject.name, trip_date: fields.subject.trip_date },
        substances: fields.substances,
        tags: fields.tags,
        featured: report.featured ?? false,
        license: report.license,
        profileKey: report.subject.profile_key,
        ownerEmail: report.owner_email,
        attributionReview: report.attribution_review,
        createdAt: report._creationTime,
      };
    });
  },
});

/**
 * The full editable slice of one report, for the portal's editor pane.
 *
 * The other half of the index projection above. It is deliberately the same
 * `editableSnapshotOf` the mutation compares against, so the `expected` snapshot
 * the editor opens with is byte-identical to what a concurrent-save check will
 * derive from storage.
 *
 * Contributor floor: an editor opens any report, a contributor only one they
 * own (My reports reads through the same endpoint the portal does).
 */
export const getPortalRecord = query({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    id: v.id("tripReports"),
  },
  handler: async (ctx, args) => {
    const actor = await requireRole(
      ctx,
      { apiKey: args.apiKey, actorEmail: args.actorEmail, adminIntent: "editorArticleWrite" },
      "contributor",
    );

    const report = await ctx.db.get(args.id);
    if (!report) {
      throw new Error(`Trip report ${args.id} no longer exists.`);
    }
    if (!roleMeetsFloor(actor.role, "editor") && !ownsReport(actor, report)) {
      refuseNotOwner(report);
    }

    return {
      id: report._id,
      slug: report.slug,
      ownerEmail: report.owner_email,
      fields: editableSnapshotOf(report),
    };
  },
});

/**
 * Update one published report's editable fields.
 *
 * The corpus previously had no per-record write: reports arrived through
 * `bulkImport` or submission promotion, and an editor who wanted to fix a typo
 * had to re-run a migration. This is the field-level path the portal saves
 * through.
 *
 * Concurrency is guarded the way `replications.updateEditorialFields` guards
 * it — by snapshot equality rather than a version column, since `tripReports`
 * has neither an `updatedAt` nor a revision. `expected` is the snapshot the
 * editor opened; if storage no longer matches it, the save is refused rather
 * than silently overwriting somebody else's edit.
 *
 * Byline changes go through the same adjudication as promotion. Renaming a
 * report onto a name a contributor profile answers to would otherwise hand that
 * contributor's page and report list to whoever typed the name, and the read
 * path resolves bylines by exact name.
 *
 * Contributor floor plus ownership: an editor or admin saves any report with
 * the full form; a contributor saves only a report whose `owner_email` is
 * theirs, and only its content. Attribution (`profileKey`, the byline) stays
 * an editor decision, and `featured` and `slug` were never part of this write.
 */
type EditableFieldsInput = typeof editableTripReportFieldsValidator.type;

type UpdateArgs = {
  apiKey?: string;
  actorEmail?: string;
  id: Id<"tripReports">;
  expected: EditableFieldsInput;
  updates: EditableFieldsInput;
  profileKey?: string;
  confirmAuthorNameClaim?: boolean;
};

/**
 * The keys an owner may not touch. The wire validator already drops `featured`,
 * `slug` and `subject.profile_key`, so at the mutation seam this is the same
 * contract stated once, in a form the handler tests can exercise: a caller
 * that names one of them is refused rather than silently ignored.
 */
function assertOwnerEditsContentOnly(
  row: Doc<"tripReports">,
  args: UpdateArgs,
  updates: TripReportEditableFields,
): void {
  const carried = args.updates as Record<string, unknown>;
  const subject = carried.subject as Record<string, unknown> | undefined;
  const locked = ["featured", "slug"].filter((key) => key in carried);
  if (subject && "profile_key" in subject) {
    locked.push("subject.profile_key");
  }
  if (args.profileKey !== undefined) {
    locked.push("profileKey");
  }
  if (normalizeAuthorMatchName(updates.subject.name) !== normalizeAuthorMatchName(row.subject.name)) {
    locked.push("subject.name");
  }
  if (locked.length > 0) {
    throw new ConvexError({
      code: "EDITOR_ONLY_REPORT_FIELD",
      message: `Only an editor can change ${locked.join(", ")} on trip report ${row.slug}.`,
    });
  }
}

export async function updateHandler(ctx: MutationCtx, args: UpdateArgs) {
  const actor = await requireRole(
    ctx,
    { apiKey: args.apiKey, actorEmail: args.actorEmail, adminIntent: "editorArticleWrite" },
    "contributor",
  );

  const row = await ctx.db.get(args.id);
  if (!row) {
    throw new Error(`Trip report ${args.id} no longer exists.`);
  }

  if (!editableSnapshotsAgree(editableSnapshotOf(row), normalizeEditableFields(args.expected))) {
    throw new Error(
      `Trip report ${row.slug} changed since it was opened; reload the portal before saving.`,
    );
  }

  const updates = normalizeEditableFields(args.updates);
  if (!roleMeetsFloor(actor.role, "editor")) {
    if (!ownsReport(actor, row)) {
      refuseNotOwner(row);
    }
    assertOwnerEditsContentOnly(row, args, updates);
  }

  const problems = validateEditableFields(updates);
  if (problems.length > 0) {
    throw new Error(`Trip report ${row.slug} cannot be saved: ${problems.join(" ")}`);
  }

  const storedProfileKey = normalizeAssignedProfileKey(row.subject.profile_key);
  const reassigningProfile = args.profileKey !== undefined;
  const assignedProfileKey = reassigningProfile
    ? await resolveEditorAssignedProfileKey(ctx, args.profileKey)
    : storedProfileKey;

  // Only a byline that actually moved is adjudicated. Re-saving a legacy
  // report whose byline has always matched a contributor is not a new claim,
  // and blocking it would make those reports uneditable.
  const bylineMoved =
    normalizeAuthorMatchName(updates.subject.name) !== normalizeAuthorMatchName(row.subject.name);

  if (bylineMoved) {
    await assertAuthorNameClaimAdjudicated(ctx, {
      authorName: updates.subject.name,
      assignedProfileKey,
      confirmAuthorNameClaim: args.confirmAuthorNameClaim,
    });
  }

  const subject: typeof row.subject = { ...updates.subject };
  if (row.subject.avatar_url !== undefined) {
    subject.avatar_url = row.subject.avatar_url;
  }
  if (row.subject.pdf_url !== undefined) {
    subject.pdf_url = row.subject.pdf_url;
  }
  if (assignedProfileKey) {
    subject.profile_key = assignedProfileKey;
  }

  const patch: Parameters<typeof ctx.db.patch>[1] = {
    title: updates.title,
    subject,
    substances: updates.substances,
    introduction: updates.introduction,
    onset: updates.onset,
    peak: updates.peak,
    offset: updates.offset,
    conclusion: updates.conclusion,
    tags: updates.tags,
  };

  // The marker records an editor's attribution decision for a byline that
  // arrived from an anonymous submitter. Re-stamp it when this edit is itself
  // such a decision; a report that never carried one stays legacy, because
  // its byline was editor-written all along.
  const attributionDecided = bylineMoved || assignedProfileKey !== storedProfileKey;
  if (row.attribution_review && attributionDecided) {
    patch.attribution_review = {
      reviewed_by: actor.name || actor.email,
      reviewed_at: new Date().toISOString(),
      decision: assignedProfileKey ? ("assigned" as const) : ("declined" as const),
    };
  }

  await ctx.db.patch(args.id, patch);
  await syncTripReportSubstanceRows(ctx, args.id, updates.substances);

  return { updated: true, slug: row.slug };
}

export const update = mutation({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    id: v.id("tripReports"),
    expected: editableTripReportFieldsValidator,
    updates: editableTripReportFieldsValidator,
    // Omitted leaves the stored attribution alone; "" clears it.
    profileKey: v.optional(v.string()),
    confirmAuthorNameClaim: v.optional(v.boolean()),
  },
  handler: updateHandler,
});

function summarizeOwnedReport(report: Doc<"tripReports">) {
  return {
    id: report._id,
    slug: report.slug,
    title: report.title.trim(),
    ownerEmail: report.owner_email,
    tripDate: report.subject.trip_date,
    createdAt: report._creationTime,
  };
}

export async function listOwnedHandler(
  ctx: QueryCtx,
  args: { apiKey?: string; actorEmail?: string; all?: boolean },
) {
  const actor = await requireRole(
    ctx,
    { apiKey: args.apiKey, actorEmail: args.actorEmail, adminIntent: "editorArticleWrite" },
    "contributor",
  );

  if (args.all === true) {
    if (actor.role !== "admin") {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "Only an admin can list every owned report.",
      });
    }
    const reports = await ctx.db.query("tripReports").collect();
    return reports.filter((report) => report.owner_email !== undefined).map(summarizeOwnedReport);
  }

  const reports = await ctx.db
    .query("tripReports")
    .withIndex("by_owner_email", (q) => q.eq("owner_email", actor.email))
    .collect();
  return reports.map(summarizeOwnedReport);
}

/**
 * The reports the actor owns, for My reports (`/dev/my-reports`). Contributor
 * floor. An admin may pass `all: true` for every report that has an owner.
 */
export const listOwned = query({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    all: v.optional(v.boolean()),
  },
  handler: listOwnedHandler,
});

export async function assignOwnerHandler(
  ctx: MutationCtx,
  args: { apiKey?: string; actorEmail?: string; slug: string; email: string },
) {
  await requireRole(
    ctx,
    { apiKey: args.apiKey, actorEmail: args.actorEmail, adminIntent: "editorArticleWrite" },
    "admin",
  );

  const report = await ctx.db
    .query("tripReports")
    .withIndex("by_slug", (q) => q.eq("slug", args.slug))
    .unique();
  if (!report) {
    throw new ConvexError({
      code: "REPORT_NOT_FOUND",
      message: `No trip report has the slug "${args.slug}".`,
    });
  }

  const membership = await findMembershipByEmail(ctx, args.email);
  if (!membership) {
    throw new ConvexError({
      code: "MEMBER_NOT_FOUND",
      message: `No membership for ${args.email.trim()}.`,
    });
  }

  await ctx.db.patch(report._id, { owner_email: membership.email });
  return { slug: report.slug, ownerEmail: membership.email };
}

/**
 * Hand a report to a member. Admin only: ownership is what lets a contributor
 * rewrite a published page, so it is granted by the same role that publishes.
 * The email must belong to an existing membership; a typo cannot create a
 * dangling owner.
 */
export const assignOwner = mutation({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    slug: v.string(),
    email: v.string(),
  },
  handler: assignOwnerHandler,
});

/**
 * Internal mutation: Bulk import trip reports (for migration).
 * Not exposed to clients.
 */
export const bulkImport = internalMutation({
  args: {
    reports: v.array(tripReportImportInputValidator),
  },
  handler: async (ctx, args) => {
    const results = {
      created: 0,
      updated: 0,
      errors: [] as string[],
    };

    for (const report of args.reports) {
      try {
        // Check if report with this slug already exists
        const existing = await ctx.db
          .query("tripReports")
          .withIndex("by_slug", (q) => q.eq("slug", report.slug))
          .first();

        if (existing) {
          await ctx.db.patch(existing._id, report);
          await syncTripReportSubstanceRows(ctx, existing._id, report.substances);
          results.updated++;
        } else {
          const reportId = await ctx.db.insert("tripReports", report);
          await syncTripReportSubstanceRows(ctx, reportId, report.substances);
          results.created++;
        }
      } catch (error) {
        results.errors.push(`Report ${report.slug}: ${error}`);
      }
    }

    return results;
  },
});

/**
 * Internal mutation: Delete all trip reports (for re-migration).
 * Not exposed to clients.
 */
export const deleteAll = internalMutation({
  args: {},
  handler: async (ctx) => {
    const allReports = await ctx.db.query("tripReports").collect();

    for (const report of allReports) {
      await deleteTripReportSubstanceRows(ctx, report._id);
      await ctx.db.delete(report._id);
    }

    return { deleted: allReports.length };
  },
});

/**
 * Delete a trip report by ID.
 *
 * Editor-gated: the Trip Report Portal puts this behind a type-to-confirm
 * control, so it is now reachable from a browser session rather than only from
 * a script holding the admin key.
 */
export const deleteById = mutation({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    id: v.id("tripReports"),
  },
  handler: async (ctx, args) => {
    await requireRole(
      ctx,
      { apiKey: args.apiKey, actorEmail: args.actorEmail, adminIntent: "editorArticleWrite" },
      "admin",
    );

    const existing = await ctx.db.get(args.id);
    if (!existing) {
      return { deleted: false, reason: "not_found" as const };
    }

    await deleteTripReportSubstanceRows(ctx, args.id);
    await ctx.db.delete(args.id);
    return { deleted: true };
  },
});

/**
 * Rename an author across all their trip reports.
 *
 * @param apiKey - Required API key for authentication
 */
export const renameAuthor = mutation({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    oldName: v.string(),
    newName: v.string(),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, { apiKey: args.apiKey, actorEmail: args.actorEmail }, "admin");

    const allReports = await ctx.db.query("tripReports").collect();
    const lowerOldName = args.oldName.toLowerCase();

    let updated = 0;

    for (const report of allReports) {
      if (report.subject.name.toLowerCase() === lowerOldName) {
        await ctx.db.patch(report._id, {
          subject: {
            ...report.subject,
            name: args.newName,
          },
        });
        updated++;
      }
    }

    return { updated };
  },
});

const SUBSTANCE_INDEX_BACKFILL_PAGE_SIZE = 50;
const SUBSTANCE_INDEX_BACKFILL_MAX_PAGE_SIZE = 200;

/**
 * Internal mutation: (re)build one page of the `tripReportSubstances` join
 * table from the stored reports. Idempotent: rows already in place are kept,
 * stale ones removed. Run to completion by
 * `scripts/convex/backfill-trip-report-substance-index.mjs`, which follows
 * `cursor` until `isDone`.
 */
export const backfillSubstanceIndex = internalMutation({
  args: {
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const requested = Math.floor(args.limit ?? SUBSTANCE_INDEX_BACKFILL_PAGE_SIZE);
    const numItems = Math.min(Math.max(requested, 1), SUBSTANCE_INDEX_BACKFILL_MAX_PAGE_SIZE);
    const page = await ctx.db
      .query("tripReports")
      .paginate({ cursor: args.cursor ?? null, numItems });

    let inserted = 0;
    let removed = 0;
    for (const report of page.page) {
      const result = await syncTripReportSubstanceRows(ctx, report._id, report.substances);
      inserted += result.inserted;
      removed += result.removed;
    }

    return {
      processed: page.page.length,
      inserted,
      removed,
      cursor: page.continueCursor,
      isDone: page.isDone,
    };
  },
});

/**
 * Internal query: how much of the corpus the join table covers, for the
 * backfill script's dry run and post-run check.
 */
export const getSubstanceIndexBackfillStatus = internalQuery({
  args: {},
  handler: async (ctx) => {
    const reports = await ctx.db.query("tripReports").collect();
    const rows = await ctx.db.query("tripReportSubstances").collect();
    const indexedReportIds = new Set(rows.map((row) => row.report_id as string));
    const reportIds = new Set(reports.map((report) => report._id as string));
    let orphanRows = 0;
    for (const row of rows) {
      if (!reportIds.has(row.report_id as string)) orphanRows += 1;
    }
    const reportsMissingRows = reports.filter(
      (report) => report.substances.length > 0 && !indexedReportIds.has(report._id as string),
    ).length;
    return {
      reportCount: reports.length,
      joinRowCount: rows.length,
      indexedReportCount: indexedReportIds.size,
      reportsMissingRows,
      orphanRows,
      indexActive: rows.length > 0,
    };
  },
});
