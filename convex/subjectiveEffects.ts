import { v } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";
import { requireAuth } from "./lib/auth";
import {
  matchesSubjectiveEffectCategory,
  projectPublicEffectArticle,
  projectPublicEffectPreview,
  subjectiveEffectCategoryTags,
} from "./lib/subjectiveEffectReadProjections";

/**
 * Subjective effect functions.
 * 
 * These functions provide CRUD operations for subjective effect articles
 * imported from EffectIndex.
 */

const replicationRightsStatus = v.union(
  v.literal("creator-retained"),
  v.literal("explicit-license"),
  v.literal("unknown"),
  v.literal("permission-granted"),
  v.literal("public-domain"),
);

const audioReplicationRightsFields = {
  rights_status: v.optional(replicationRightsStatus),
  license_name: v.optional(v.string()),
  license_url: v.optional(v.string()),
  credit_line: v.optional(v.string()),
  source_url: v.optional(v.string()),
  rightsholder: v.optional(v.string()),
  permission_notes: v.optional(v.string()),
  removal_contact: v.optional(v.string()),
};

/**
 * Get all subjective effects.
 */
export const getAll = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("subjectiveEffects").collect();
  },
});

/**
 * Get a single subjective effect by slug.
 */
export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("subjectiveEffects")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
  },
});

export const getPublicPreviews = query({
  args: {},
  handler: async (ctx) => {
    const effects = await ctx.db.query("subjectiveEffects").collect();
    return effects.map(projectPublicEffectPreview);
  },
});

export const getPublicArticles = query({
  args: {},
  handler: async (ctx) => {
    const effects = await ctx.db.query("subjectiveEffects").collect();
    return effects.map(projectPublicEffectArticle);
  },
});

export const getPublicBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const effect = await ctx.db
      .query("subjectiveEffects")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
    return effect ? projectPublicEffectArticle(effect) : null;
  },
});

export const getPublicByCategory = query({
  args: { category: v.string() },
  handler: async (ctx, args) => {
    const effects = await ctx.db.query("subjectiveEffects").collect();
    return effects
      .filter((effect) => matchesSubjectiveEffectCategory(effect, args.category))
      .map(projectPublicEffectPreview);
  },
});

/**
 * Get featured subjective effects.
 */
export const getFeatured = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("subjectiveEffects")
      .withIndex("by_featured", (q) => q.eq("featured", true))
      .collect();
  },
});

/**
 * Get subjective effects by tags.
 * Filters effects that have ALL the specified tags.
 */
export const getByTags = query({
  args: { tags: v.array(v.string()) },
  handler: async (ctx, args) => {
    const allEffects = await ctx.db.query("subjectiveEffects").collect();
    
    // Filter effects that have all specified tags
    return allEffects.filter((effect) =>
      args.tags.every((tag) => effect.tags.includes(tag))
    );
  },
});

/**
 * Get subjective effects by any of the specified tags.
 * Filters effects that have ANY of the specified tags.
 */
export const getByAnyTag = query({
  args: { tags: v.array(v.string()) },
  handler: async (ctx, args) => {
    const allEffects = await ctx.db.query("subjectiveEffects").collect();
    
    // Filter effects that have any of the specified tags
    return allEffects.filter((effect) =>
      args.tags.some((tag) => effect.tags.includes(tag))
    );
  },
});

/**
 * Get subjective effects by category (predefined tag combinations).
 */
export const getByCategory = query({
  args: { category: v.string() },
  handler: async (ctx, args) => {
    const allEffects = await ctx.db.query("subjectiveEffects").collect();
    
    const tagsToMatch = subjectiveEffectCategoryTags[args.category];
    if (!tagsToMatch) {
      console.warn(`Unknown subjective effect category requested: ${args.category}`);
      return [];
    }
    
    return allEffects.filter((effect) =>
      tagsToMatch.some((tag) => effect.tags.includes(tag))
    );
  },
});

/**
 * Get all unique tags from subjective effects.
 */
export const getAllTags = query({
  args: {},
  handler: async (ctx) => {
    const allEffects = await ctx.db.query("subjectiveEffects").collect();
    const tags = new Set<string>();
    
    for (const effect of allEffects) {
      for (const tag of effect.tags) {
        tags.add(tag);
      }
    }
    
    return Array.from(tags).sort();
  },
});

/**
 * Internal mutation: Bulk import subjective effects (for migration).
 * Not exposed to clients.
 */
export const bulkImport = internalMutation({
  args: {
    effects: v.array(v.object({
      slug: v.string(),
      name: v.string(),
      tags: v.array(v.string()),
      featured: v.optional(v.boolean()),
      summary: v.string(),
      description_raw: v.string(),
      description_ast: v.optional(v.any()),
      long_summary_raw: v.optional(v.string()),
      long_summary_ast: v.optional(v.any()),
      analysis_raw: v.optional(v.string()),
      analysis_ast: v.optional(v.any()),
      style_variations_raw: v.optional(v.string()),
      style_variations_ast: v.optional(v.any()),
      personal_commentary_raw: v.optional(v.string()),
      personal_commentary_ast: v.optional(v.any()),
      social_media_image: v.optional(v.string()),
      gallery_order: v.optional(v.array(v.string())),
      audio_replications: v.optional(v.array(v.object({
        title: v.string(),
        artist: v.string(),
        artist_url: v.optional(v.string()),
        resource: v.string(),
        ...audioReplicationRightsFields,
      }))),
      see_also: v.optional(v.array(v.object({
        location: v.string(),
        title: v.string(),
      }))),
      external_links: v.optional(v.array(v.object({
        url: v.string(),
        title: v.string(),
      }))),
      citations: v.optional(v.array(v.object({
        url: v.string(),
        text: v.string(),
        from: v.optional(v.string()),
      }))),
      subarticles: v.optional(v.array(v.object({
        id: v.string(),
        title: v.string(),
      }))),
      contributors: v.optional(v.array(v.string())),
    })),
  },
  handler: async (ctx, args) => {
    const results = {
      created: 0,
      updated: 0,
      errors: [] as string[],
    };

    for (const effect of args.effects) {
      try {
        // Check if effect with this slug already exists
        const existing = await ctx.db
          .query("subjectiveEffects")
          .withIndex("by_slug", (q) => q.eq("slug", effect.slug))
          .first();

        if (existing) {
          await ctx.db.patch(existing._id, effect);
          results.updated++;
        } else {
          await ctx.db.insert("subjectiveEffects", effect);
          results.created++;
        }
      } catch (error) {
        results.errors.push(`Effect ${effect.slug}: ${error}`);
      }
    }

    return results;
  },
});

/**
 * Internal mutation: Delete all subjective effects (for re-migration).
 * Not exposed to clients.
 */
export const deleteAll = internalMutation({
  args: {},
  handler: async (ctx) => {
    const allEffects = await ctx.db.query("subjectiveEffects").collect();

    for (const effect of allEffects) {
      await ctx.db.delete(effect._id);
    }

    return { deleted: allEffects.length };
  },
});

/**
 * Update a single subjective effect.
 *
 * @param apiKey - Required API key for authentication
 */
export const update = mutation({
  args: {
    apiKey: v.optional(v.string()),
    slug: v.string(),
    updates: v.object({
      name: v.optional(v.string()),
      tags: v.optional(v.array(v.string())),
      featured: v.optional(v.boolean()),
      summary: v.optional(v.string()),
      description_raw: v.optional(v.string()),
      description_ast: v.optional(v.any()),
      long_summary_raw: v.optional(v.string()),
      long_summary_ast: v.optional(v.any()),
      analysis_raw: v.optional(v.string()),
      analysis_ast: v.optional(v.any()),
      style_variations_raw: v.optional(v.string()),
      style_variations_ast: v.optional(v.any()),
      personal_commentary_raw: v.optional(v.string()),
      personal_commentary_ast: v.optional(v.any()),
      social_media_image: v.optional(v.string()),
      gallery_order: v.optional(v.array(v.string())),
      audio_replications: v.optional(v.array(v.object({
        title: v.string(),
        artist: v.string(),
        artist_url: v.optional(v.string()),
        description: v.optional(v.string()),
        resource: v.string(),
        ...audioReplicationRightsFields,
      }))),
      see_also: v.optional(v.array(v.object({
        location: v.string(),
        title: v.string(),
      }))),
      external_links: v.optional(v.array(v.object({
        url: v.string(),
        title: v.string(),
      }))),
      citations: v.optional(v.array(v.object({
        url: v.string(),
        text: v.string(),
        from: v.optional(v.string()),
      }))),
      subarticles: v.optional(v.array(v.object({
        id: v.string(),
        title: v.string(),
      }))),
      contributors: v.optional(v.array(v.string())),
    }),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.apiKey);

    const existing = await ctx.db
      .query("subjectiveEffects")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();

    if (!existing) {
      throw new Error(`Effect not found: ${args.slug}`);
    }

    await ctx.db.patch(existing._id, args.updates);
    return { success: true };
  },
});
