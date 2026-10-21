import { v } from "../lib/postgres/runtime/values";
import { query, internalQuery } from "../lib/postgres/runtime/server";
import { mutation, internalMutation } from "./lib/indexedMutation";
import { requireRole } from "./lib/auth";
import { bulkRowFailure, duplicateSlugErrors } from "./lib/bulkImportFailures";
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

export const getPublicBrowseIndex = query({
  args: {},
  handler: async (ctx) => {
    return (await ctx.db.getPublicTripReportBrowseRows()).map((report) => publicTripReportPreview(report));
  },
});

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

export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const report = await ctx.db.query("tripReports").withIndex("by_slug", (q) => q.eq("slug", args.slug)).first();
    return report ? publicTripReport(report) : null;
  },
});

export const getFeatured = query({
  args: {},
  handler: async (ctx) => {
    return (await ctx.db.query("tripReports").withIndex("by_featured", (q) => q.eq("featured", true)).collect()).map(publicTripReport);
  },
});

export const getBySubstance = query({
  args: { substanceName: v.string() },
  handler: async (ctx, args) => (await findTripReportsBySubstanceNames(ctx, [args.substanceName])).map(publicTripReport),
});

export const getBySubstanceNames = query({
  args: { substanceNames: v.array(v.string()) },
  handler: async (ctx, args) => {
    const reports = await ctx.db.getPublicTripReportPreviewsBySubstanceNames(args.substanceNames);
    return reports.map((report) => publicTripReportPreview(report));
  },
});

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
    const allReports = await ctx.db.getPublicTripReportsByContributor(args.profileKey, args.authorNames);
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

export const getPortalRows = query({
  args: { apiKey: v.optional(v.string()), actorEmail: v.optional(v.string()) },
  handler: getPortalRowsHandler,
});
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

export const update = mutation({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    id: v.id("tripReports"),
    expected: editableTripReportFieldsValidator,
    expectedRevision: v.string(),
    updates: editableTripReportFieldsValidator,
    profileKey: v.optional(v.string()),
    confirmAuthorNameClaim: v.optional(v.boolean()),
    operationId: v.optional(v.string()),
  },
  handler: updateHandler,
});
export const listOwned = query({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    all: v.optional(v.boolean()),
  },
  handler: listOwnedHandler,
});

export const assignOwner = mutation({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    slug: v.string(),
    email: v.string(),
  },
  handler: assignOwnerHandler,
});

export const bulkImport = internalMutation({
  args: {
    reports: v.array(tripReportImportInputValidator),
  },
  handler: async (ctx, args) => {
    const results = {
      created: 0,
      updated: 0,
      errors: duplicateSlugErrors(args.reports.map((report) => report.slug), (slug) => `Report ${slug}`),
    };
    if (results.errors.length > 0) return results;

    for (const report of args.reports) {
      try {
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
        throw bulkRowFailure(`Report ${report.slug}`, error);
      }
    }

    return results;
  },
});

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

export const backfillSubstanceIndex = internalMutation({
  args: {
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: (ctx, args) => backfillPublicReadIndexPage(ctx, { ...args, name: "tripReports" }),
});

export const getAllDocumentsForBackup = internalQuery({
  args: {},
  handler: async (ctx) => await ctx.db.query("tripReports").collect(),
});

export const getSubstanceIndexBackfillStatus = internalQuery({
  args: {},
  handler: (ctx) => getPublicReadIndexStatus(ctx, "tripReports"),
});
