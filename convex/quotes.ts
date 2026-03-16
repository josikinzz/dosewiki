import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireAuth } from "./lib/auth";

/**
 * Quote document functions.
 *
 * These functions provide CRUD operations for extracted quotes per substance per section.
 * Quotes are editable via the dev tools UI.
 */

/**
 * Get quotes for a specific substance and section.
 */
export const getBySlugAndSection = query({
  args: {
    slug: v.string(),
    section: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("quotes")
      .withIndex("by_slug_section", (q) =>
        q.eq("slug", args.slug).eq("section", args.section)
      )
      .first();
  },
});

/**
 * Get all quotes for a substance.
 */
export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("quotes")
      .withIndex("by_slug_section", (q) => q.eq("slug", args.slug))
      .collect();
  },
});

/**
 * Get quote availability for all sections of a substance.
 * Returns a map of section -> { available: boolean } in a single query.
 * This replaces 8 separate useQuery calls with 1.
 */
export const getAvailabilityBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const quotes = await ctx.db
      .query("quotes")
      .withIndex("by_slug_section", (q) => q.eq("slug", args.slug))
      .collect();

    const sections = [
      "harm_potential",
      "pharmacology",
      "history_culture",
      "summary",
      "dosage_duration",
      "tolerance",
      "legality",
      "subjective_effects",
    ] as const;

    const existingSections = new Set(quotes.map((q) => q.section));

    return Object.fromEntries(
      sections.map((section) => [
        section,
        { available: existingSections.has(section) },
      ])
    ) as Record<typeof sections[number], { available: boolean }>;
  },
});

/**
 * Get all quotes for a section (across all substances).
 */
export const getBySection = query({
  args: { section: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("quotes")
      .withIndex("by_section", (q) => q.eq("section", args.section))
      .collect();
  },
});

/**
 * Get all quote metadata (for listing).
 */
export const getAllMetadata = query({
  args: {},
  handler: async (ctx) => {
    const quotes = await ctx.db.query("quotes").collect();
    return quotes.map((q) => ({
      slug: q.slug,
      section: q.section,
      contentLength: q.content.length,
      updatedAt: q.updatedAt,
      updatedBy: q.updatedBy,
    }));
  },
});

/**
 * Get all quotes (for migration/sync).
 */
export const getAll = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("quotes").collect();
  },
});

/**
 * Save (create or update) a quote document.
 *
 * @param apiKey - Required API key for authentication
 */
export const save = mutation({
  args: {
    apiKey: v.optional(v.string()),
    slug: v.string(),
    section: v.string(),
    content: v.string(),
    updatedBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.apiKey);

    const { slug, section, content, updatedBy } = args;
    const updatedAt = new Date().toISOString();

    // Check if quote with this slug+section already exists
    const existing = await ctx.db
      .query("quotes")
      .withIndex("by_slug_section", (q) =>
        q.eq("slug", slug).eq("section", section)
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        content,
        updatedAt,
        updatedBy,
      });
      return { updated: true, id: existing._id };
    }

    const id = await ctx.db.insert("quotes", {
      slug,
      section,
      content,
      updatedAt,
      updatedBy,
    });
    return { updated: false, id };
  },
});

/**
 * Delete a quote document.
 *
 * @param apiKey - Required API key for authentication
 */
export const deleteBySlugAndSection = mutation({
  args: {
    apiKey: v.optional(v.string()),
    slug: v.string(),
    section: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.apiKey);

    const existing = await ctx.db
      .query("quotes")
      .withIndex("by_slug_section", (q) =>
        q.eq("slug", args.slug).eq("section", args.section)
      )
      .first();

    if (existing) {
      await ctx.db.delete(existing._id);
      return { deleted: true };
    }

    return { deleted: false };
  },
});

/**
 * Bulk import quotes (for migration).
 *
 * @param apiKey - Required API key for authentication
 */
export const bulkImport = mutation({
  args: {
    apiKey: v.optional(v.string()),
    quotes: v.array(v.object({
      slug: v.string(),
      section: v.string(),
      content: v.string(),
    })),
    updatedBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.apiKey);

    const updatedAt = new Date().toISOString();
    const results = {
      created: 0,
      updated: 0,
      errors: [] as string[],
    };

    for (const quote of args.quotes) {
      try {
        const existing = await ctx.db
          .query("quotes")
          .withIndex("by_slug_section", (q) =>
            q.eq("slug", quote.slug).eq("section", quote.section)
          )
          .first();

        if (existing) {
          await ctx.db.patch(existing._id, {
            content: quote.content,
            updatedAt,
            updatedBy: args.updatedBy,
          });
          results.updated++;
        } else {
          await ctx.db.insert("quotes", {
            slug: quote.slug,
            section: quote.section,
            content: quote.content,
            updatedAt,
            updatedBy: args.updatedBy,
          });
          results.created++;
        }
      } catch (error) {
        results.errors.push(`Quote ${quote.slug}/${quote.section}: ${error}`);
      }
    }

    return results;
  },
});
