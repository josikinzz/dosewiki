import { v } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";
import { requireAuth, requireEditorWrite } from "./lib/auth";
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
} from "./lib/tripReportEditing";
import {
  timelineEntryValidator,
  tripReportImportInputValidator,
  tripReportSubstanceValidator,
} from "./tripReportContract";

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
  handler: async (ctx, args) => {
    const allReports = await ctx.db.query("tripReports").collect();
    const lowerName = args.substanceName.toLowerCase();

    return allReports.filter((report) =>
      report.substances.some((s) => s.name.toLowerCase() === lowerName)
    );
  },
});

/**
 * Get trip reports by multiple substance names (batch query).
 * Filters reports where any substance matches any of the given names (case-insensitive).
 * This consolidates multiple getBySubstance calls into a single query.
 */
export const getBySubstanceNames = query({
  args: { substanceNames: v.array(v.string()) },
  handler: async (ctx, args) => {
    if (args.substanceNames.length === 0) return [];
    const allReports = await ctx.db.query("tripReports").collect();
    const lowerNames = new Set(args.substanceNames.map(n => n.toLowerCase()));
    return allReports.filter((report) =>
      report.substances.some((s) => lowerNames.has(s.name.toLowerCase()))
    );
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
 * Rows for the Trip Report Portal (`/dev` → Trip reports).
 *
 * Returns the whole published corpus with the editable slice already
 * normalized, so the client's `expected` snapshot on save is derived from the
 * same normalizer the mutation compares against. Editor-gated because the
 * portal shows unpublished-adjacent metadata (attribution decisions, license)
 * that no public projection returns.
 */
export const getPortalRows = query({
  args: { apiKey: v.optional(v.string()), actorEmail: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireEditorWrite(ctx, {
      apiKey: args.apiKey,
      actorEmail: args.actorEmail,
      adminIntent: "editorArticleWrite",
    });

    const reports = await ctx.db.query("tripReports").collect();

    return reports.map((report) => ({
      id: report._id,
      slug: report.slug,
      featured: report.featured ?? false,
      license: report.license,
      profileKey: report.subject.profile_key,
      attributionReview: report.attribution_review,
      createdAt: report._creationTime,
      fields: editableSnapshotOf(report),
    }));
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
 */
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
  handler: async (ctx, args) => {
    const actor = await requireEditorWrite(ctx, {
      apiKey: args.apiKey,
      actorEmail: args.actorEmail,
      adminIntent: "editorArticleWrite",
    });

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

    return { updated: true, slug: row.slug };
  },
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
    await requireEditorWrite(ctx, {
      apiKey: args.apiKey,
      actorEmail: args.actorEmail,
      adminIntent: "editorArticleWrite",
    });

    const existing = await ctx.db.get(args.id);
    if (!existing) {
      return { deleted: false, reason: "not_found" as const };
    }

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
    oldName: v.string(),
    newName: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.apiKey);

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
