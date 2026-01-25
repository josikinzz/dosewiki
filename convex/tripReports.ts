import { v } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";
import { requireAuth } from "./lib/auth";

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
 * Internal mutation: Bulk import trip reports (for migration).
 * Not exposed to clients.
 */
export const bulkImport = internalMutation({
  args: {
    reports: v.array(v.object({
      slug: v.string(),
      title: v.string(),
      featured: v.optional(v.boolean()),
      subject: v.object({
        name: v.string(),
        trip_date: v.optional(v.string()),
        age: v.optional(v.string()),
        gender: v.optional(v.string()),
        height: v.optional(v.string()),
        weight: v.optional(v.string()),
        medications: v.optional(v.string()),
        setting: v.optional(v.string()),
        pdf_url: v.optional(v.string()),
      }),
      substances: v.array(v.object({
        name: v.string(),
        dose: v.optional(v.string()),
        roa: v.optional(v.string()),
      })),
      introduction: v.optional(v.string()),
      onset: v.array(v.object({ time: v.optional(v.string()), description: v.string() })),
      peak: v.array(v.object({ time: v.optional(v.string()), description: v.string() })),
      offset: v.array(v.object({ time: v.optional(v.string()), description: v.string() })),
      conclusion: v.optional(v.string()),
      tags: v.array(v.string()),
    })),
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
 * @param apiKey - Required API key for authentication
 */
export const deleteById = mutation({
  args: {
    apiKey: v.optional(v.string()),
    id: v.id("tripReports"),
  },
  handler: async (ctx, args) => {
    requireAuth(ctx, args.apiKey);
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
    requireAuth(ctx, args.apiKey);

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
