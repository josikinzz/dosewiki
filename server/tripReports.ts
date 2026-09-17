import { v } from "../lib/postgres/runtime/values";
import { query, internalQuery } from "../lib/postgres/runtime/server";
import type { Doc } from "../lib/postgres/runtime/dataModel";
import { mutation, internalMutation } from "./lib/indexedMutation";
import { requireRole } from "./lib/auth";
import { recordRevision } from "./lib/contentRevisions";
import {
  timelineEntryValidator,
  tripReportImportInputValidator,
  tripReportSubstanceValidator,
} from "./tripReportContract";
import {
  findTripReportsBySubstanceNames,
} from "./lib/tripReportSubstanceIndex";
import { backfillPublicReadIndexPage, getPublicReadIndexStatus } from "./lib/publicReadIndexBackfill";
import { publicTripReport, publicTripReportPreview } from "./lib/tripReportPublicProjection";
import {
  assignOwnerHandler,
  getPortalRecordHandler,
  getPortalRowsHandler,
  listOwnedHandler,
  updateHandler,
} from "./lib/tripReportPortalHandlers";

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
    return (await ctx.db.query("tripReports").collect()).map(publicTripReport);
  },
});

const PUBLIC_REPORT_PAGE_SIZE = 32;
const PUBLIC_REPORT_MAX_PAGE_SIZE = 100;
const publicReportPageArgs = {
  cursor: v.optional(v.string()),
  limit: v.optional(v.number()),
};

function clampPublicReportPageSize(requested: number | undefined): number {
  const normalized = Math.floor(requested ?? PUBLIC_REPORT_PAGE_SIZE);
  return Math.min(Math.max(normalized, 1), PUBLIC_REPORT_MAX_PAGE_SIZE);
}

/** Bounded compact corpus page for public lists and contributor references. */
export const getPublicPreviewsPage = query({
  args: {
    ...publicReportPageArgs,
    includeSearchSummary: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const result = await ctx.db.query("tripReports").paginate({
      cursor: args.cursor ?? null,
      numItems: clampPublicReportPageSize(args.limit),
    });
    return {
      items: args.includeSearchSummary
        ? result.page.map((report) => ({
          slug: report.slug,
          title: report.title,
          introduction: report.introduction,
        }))
        : result.page.map(publicTripReportPreview),
      cursor: result.continueCursor,
      isDone: result.isDone,
    };
  },
});

/**
 * Complete compact browse corpus in one native read. The Next browse projector
 * retains exact corpus-wide facets, highlights, ordering, and cursor identity
 * without draining storage through serial pages or transporting report bodies.
 */
export const getPublicBrowseIndex = query({
  args: {},
  handler: async (ctx) => {
    const db = ctx.db as typeof ctx.db & {
      getPublicTripReportBrowseRows: () => Promise<Doc<"tripReports">[]>;
    };
    return (await db.getPublicTripReportBrowseRows()).map(publicTripReportPreview);
  },
});

/** Bounded full public records for open-data and other detail-corpus consumers. */
export const getPublicDetailsPage = query({
  args: publicReportPageArgs,
  handler: async (ctx, args) => {
    const result = await ctx.db.query("tripReports").paginate({
      cursor: args.cursor ?? null,
      numItems: clampPublicReportPageSize(args.limit),
    });
    return {
      items: result.page.map(publicTripReport),
      cursor: result.continueCursor,
      isDone: result.isDone,
    };
  },
});

/**
 * Get a single trip report by slug.
 */
export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const report = await ctx.db.query("tripReports").withIndex("by_slug", (q) => q.eq("slug", args.slug)).first();
    return report ? publicTripReport(report) : null;
  },
});

/**
 * Get featured trip reports.
 */
export const getFeatured = query({
  args: {},
  handler: async (ctx) => {
    return (await ctx.db.query("tripReports").withIndex("by_featured", (q) => q.eq("featured", true)).collect()).map(publicTripReport);
  },
});

/**
 * Get trip reports by substance name.
 * Filters reports where any substance matches the given name (case-insensitive).
 */
export const getBySubstance = query({
  args: { substanceName: v.string() },
  handler: async (ctx, args) => (await findTripReportsBySubstanceNames(ctx, [args.substanceName])).map(publicTripReport),
});

/**
 * Get trip reports by multiple substance names (batch query).
 * Filters reports where any substance matches any of the given names (case-insensitive).
 * This consolidates multiple getBySubstance calls into a single query.
 *
 * The native public-field projection uses the `tripReportSubstances` join
 * index when ready and retains a projected pre-backfill scan otherwise.
 */
export const getBySubstanceNames = query({
  args: { substanceNames: v.array(v.string()) },
  handler: async (ctx, args) => {
    const postgresDb = ctx.db as typeof ctx.db & {
      getPublicTripReportPreviewsBySubstanceNames: (
        names: readonly string[],
      ) => Promise<Doc<"tripReports">[]>;
    };
    const reports = await postgresDb.getPublicTripReportPreviewsBySubstanceNames(
      args.substanceNames,
    );
    return reports.map(publicTripReportPreview);
  },
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
    ).map(publicTripReport);
  },
});

export const getByContributor = query({
  args: {
    profileKey: v.string(),
    authorNames: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const db = ctx.db as typeof ctx.db & {
      getPublicTripReportsByContributor: (profileKey: string, authorNames: string[]) => Promise<Doc<"tripReports">[]>;
    };
    const allReports = await db.getPublicTripReportsByContributor(args.profileKey, args.authorNames);
    const normalizedProfileKey = args.profileKey.trim().toUpperCase();
    const lowerNames = new Set(
      args.authorNames.map((name) => name.trim().toLowerCase()).filter(Boolean),
    );

    return allReports.filter((report) => {
      if (report.subject.profile_key?.trim().toUpperCase() === normalizedProfileKey) {
        return true;
      }

      if (report.attribution_review) return false;
      return lowerNames.has(report.subject.name.trim().toLowerCase());
    }).map(publicTripReport);
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
  handler: getPortalRowsHandler,
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
    id: v.optional(v.id("tripReports")),
    slug: v.optional(v.string()),
    contextual: v.optional(v.boolean()),
  },
  handler: getPortalRecordHandler,
});

/**
 * Update one published report's editable fields.
 *
 * The corpus previously had no per-record write: reports arrived through
 * `bulkImport` or submission promotion, and an editor who wanted to fix a typo
 * had to re-run a migration. This is the field-level path the portal saves
 * through.
 *
 * Concurrency binds the complete stored row and latest canonical journal ID.
 * The opaque token catches metadata changes and A→B→A content cycles; the
 * expected editable snapshot remains a separate lossless field guard.
 *
 * Byline changes go through the same adjudication as promotion. Renaming a
 * report onto a name a contributor profile answers to would otherwise hand that
 * contributor's page and report list to whoever typed the name, and the read
 * path resolves bylines by exact name.
 *
 * Contributor floor plus ownership: an admin saves any report with the full
 * form; an editor or contributor saves only a report whose `owner_email` is
 * theirs, and only its content. Editors read every report (`getPortalRecord`)
 * but do not write reports they do not own. Attribution (`profileKey`, the
 * byline) stays an admin decision, and `featured` and `slug` were never part
 * of this write.
 */

export const update = mutation({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    id: v.id("tripReports"),
    expected: editableTripReportFieldsValidator,
    expectedRevision: v.string(),
    updates: editableTripReportFieldsValidator,
    // Omitted leaves the stored attribution alone; "" clears it.
    profileKey: v.optional(v.string()),
    confirmAuthorNameClaim: v.optional(v.boolean()),
    operationId: v.optional(v.string()),
  },
  handler: updateHandler,
});
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
          results.updated++;
        } else {
          await ctx.db.insert("tripReports", report);
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
    const actor = await requireRole(
      ctx,
      { apiKey: args.apiKey, actorEmail: args.actorEmail, adminIntent: "editorArticleWrite" },
      "admin",
    );

    const existing = await ctx.db.get(args.id);
    if (!existing) {
      return { deleted: false, reason: "not_found" as const };
    }

    await recordRevision(ctx, { table: "tripReports", key: existing.slug, action: "remove", before: existing, actor });
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


/**
 * Internal mutation: (re)build one page of the `tripReportSubstances` join
 * table from the stored reports. Idempotent: rows already in place are kept,
 * stale ones removed. Run to completion by
 * `scripts/data-ops/backfill-trip-report-substance-index.mjs`, which follows
 * `cursor` until `isDone`.
 */
export const backfillSubstanceIndex = internalMutation({
  args: {
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: (ctx, args) => backfillPublicReadIndexPage(ctx, { ...args, name: "tripReports" }),
});

/** Bounded durable completion status, not a whole-corpus counting query. */
export const getSubstanceIndexBackfillStatus = internalQuery({
  args: {},
  handler: (ctx) => getPublicReadIndexStatus(ctx, "tripReports"),
});
