import { PostgresError, v } from "../lib/postgres/runtime/values";
import { query } from "../lib/postgres/runtime/server";
import { mutation, internalMutation } from "./lib/indexedMutation";
import { requireRole } from "./lib/auth";
import {
  matchesSubjectiveEffectCategory,
  projectPublicEffectArticle,
  projectPublicEffectIndexEntry,
  projectPublicEffectPreview,
  subjectiveEffectCategoryTags,
} from "./lib/subjectiveEffectReadProjections";
import { contentHash } from "../lib/proposals/contentHash";
import { prepareEffectDraft } from "../src/features/effects/editing/effectEditorModel";
import type { Doc } from "../lib/postgres/runtime/dataModel";
import type { QueryCtx } from "../lib/postgres/runtime/server";

async function readPublicEffectProjection(
  ctx: QueryCtx,
  projection: "preview" | "index" | "summary" | "slugs" | "audio" | "credits",
  slugs?: string[],
) {
  const db = ctx.db as typeof ctx.db & {
    getPublicEffectProjection: (projection: "preview" | "index" | "summary" | "slugs" | "audio" | "credits", slugs?: string[]) => Promise<Doc<"subjectiveEffects">[]>;
  };
  return db.getPublicEffectProjection(projection, slugs);
}
import { currentNarrativeRevision, narrativeRevision, recordNarrativeMaintenance, recordNarrativeRevision } from "./lib/narrativeRevisions";

export const getForEditor = query({
  args: { apiKey: v.optional(v.string()), actorEmail: v.optional(v.string()), slug: v.string() },
  handler: async (ctx, args) => {
    await requireRole(ctx, { ...args, adminIntent: "editorArticleWrite" }, "admin");
    const effect = await ctx.db.query("subjectiveEffects").withIndex("by_slug", q => q.eq("slug", args.slug)).first();
    if (!effect) return null;
    const history = await ctx.db.query("narrativeRevisions").withIndex("by_document", q => q.eq("kind", "effect").eq("documentId", effect._id)).order("desc").take(5);
    return { effect, baseRevision: narrativeRevision(effect, history[0]?.operationId ?? null), history: history.map(({ createdAt, actorEmail, revision, before, after }) => ({ createdAt, actorEmail, revision, before, after })) };
  },
});

export const publishFromEditor = mutation({
  args: { apiKey: v.optional(v.string()), actorEmail: v.optional(v.string()), slug: v.string(), expectedRevision: v.string(), operationId: v.string(), draft: v.any() },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, { apiKey: args.apiKey, actorEmail: args.actorEmail, adminIntent: "editorArticleWrite" }, "admin");
    if (!/^[a-f0-9-]{36}$/i.test(args.operationId)) throw new PostgresError({ code: "INVALID_EFFECT", message: "A valid publication operation is required." });
    const applied = await ctx.db.query("narrativeRevisions").withIndex("by_operation", q => q.eq("kind", "effect").eq("operationId", args.operationId)).first();
    if (applied) {
      if (applied.actorEmail !== actor.email || applied.key !== args.slug || applied.baseRevision !== args.expectedRevision || applied.requestHash !== contentHash(args.draft)) throw new PostgresError({ code: "FIELD_CONFLICT", message: "Operation identity does not match this effect." });
      return { revision: applied.revision };
    }
    const existing = await ctx.db.query("subjectiveEffects").withIndex("by_slug", q => q.eq("slug", args.slug)).first();
    if (!existing) throw new PostgresError({ code: "ARTICLE_NOT_FOUND", message: "Effect not found." });
    if (await currentNarrativeRevision(ctx, "effect", existing) !== args.expectedRevision) throw new PostgresError({ code: "FIELD_CONFLICT", message: "This effect changed. Reload and reconcile your local edits before publishing." });
    let updates;
    try { updates = prepareEffectDraft(args.draft, existing); }
    catch (error) { throw new PostgresError({ code: "INVALID_EFFECT", message: error instanceof Error ? error.message : "Invalid effect document." }); }
    await ctx.db.patch(existing._id, updates);
    const after = (await ctx.db.get(existing._id))!;
    const revision = await recordNarrativeRevision(ctx, { kind: "effect", key: args.slug, operationId: args.operationId, requestHash: contentHash(args.draft), baseRevision: args.expectedRevision, actor, before: existing, after });
    return { revision };
  },
});

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
    const effects = await readPublicEffectProjection(ctx, "preview");
    return effects.map(projectPublicEffectPreview);
  },
});

export const getPublicIndex = query({
  args: {},
  handler: async (ctx) => {
    const effects = await readPublicEffectProjection(ctx, "index");
    return effects.map(projectPublicEffectIndexEntry);
  },
});

export const getPublicSlugs = query({
  args: {},
  handler: async (ctx) => (await readPublicEffectProjection(ctx, "slugs"))
    .map(({ slug }) => slug)
    .filter((slug): slug is string => typeof slug === "string" && slug.length > 0),
});

export const getPublicSummariesBySlugs = query({
  args: { slugs: v.array(v.string()) },
  handler: async (ctx, { slugs }) => {
    const rows = await readPublicEffectProjection(ctx, "summary", slugs);
    return rows.map(({ slug, name, long_summary_raw, long_summary_ast, citations, subarticles }) => ({
      slug, name, long_summary_raw, long_summary_ast, citations, subarticles,
    }));
  },
});

export const getPublicAudioIndex = query({
  args: {},
  handler: async (ctx) => (await readPublicEffectProjection(ctx, "audio"))
    .map(({ slug, name, audio_replications }) => ({ slug, name, audio_replications })),
});

export const getPublicContributorCredits = query({
  args: { names: v.optional(v.array(v.string())) },
  handler: async (ctx, { names }) => {
    const db = ctx.db as typeof ctx.db & {
      getPublicEffectCreditsByNames: (names: string[]) => Promise<Doc<"subjectiveEffects">[]>;
    };
    const rows = names
      ? await db.getPublicEffectCreditsByNames(names)
      : await readPublicEffectProjection(ctx, "credits");
    return rows
      .filter((row) => !names || (row.contributors ?? []).some((name) => names.includes(name.trim().toLowerCase())))
      .map(({ slug, name, contributors }) => ({ slug, name, contributors }));
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
    const effects = await readPublicEffectProjection(ctx, "preview");
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

    // Let a failure abort the transaction: content and history must commit together.
    for (const effect of args.effects) {
        // Check if effect with this slug already exists
        const existing = await ctx.db
          .query("subjectiveEffects")
          .withIndex("by_slug", (q) => q.eq("slug", effect.slug))
          .first();

        if (existing) {
          await ctx.db.patch(existing._id, effect);
          await recordNarrativeMaintenance(ctx, { kind: "effect", key: effect.slug, actor: { email: "internal:subjectiveEffects.bulkImport", role: "admin" }, before: existing, after: (await ctx.db.get(existing._id))! });
          results.updated++;
        } else {
          const id = await ctx.db.insert("subjectiveEffects", effect);
          await recordNarrativeMaintenance(ctx, { kind: "effect", key: effect.slug, actor: { email: "internal:subjectiveEffects.bulkImport", role: "admin" }, before: null, after: (await ctx.db.get(id))! });
          results.created++;
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

const legacyMediaField = v.union(
  v.literal("description_raw"),
  v.literal("description_ast"),
  v.literal("long_summary_raw"),
  v.literal("long_summary_ast"),
  v.literal("analysis_raw"),
  v.literal("analysis_ast"),
  v.literal("style_variations_raw"),
  v.literal("style_variations_ast"),
  v.literal("personal_commentary_raw"),
  v.literal("personal_commentary_ast"),
);

/**
 * Apply an exact-value-guarded repair to legacy EffectIndex article media.
 * This deliberately cannot alter article identity, taxonomy, or citations.
 */
export const repairLegacyMedia = mutation({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    slug: v.string(),
    changes: v.array(v.object({
      field: legacyMediaField,
      expected: v.any(),
      value: v.any(),
    })),
    clearSocialMediaImage: v.optional(v.boolean()),
    expectedSocialMediaImage: v.optional(v.string()),
    replacementSocialMediaImage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, { apiKey: args.apiKey, actorEmail: args.actorEmail }, "admin");

    const effect = await ctx.db
      .query("subjectiveEffects")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
    if (!effect) throw new Error(`Effect not found: ${args.slug}`);

    for (const change of args.changes) {
      if (JSON.stringify(effect[change.field]) !== JSON.stringify(change.expected)) {
        throw new Error(`Legacy media precondition failed: ${args.slug}.${change.field}`);
      }
      await ctx.db.patch(effect._id, { [change.field]: change.value });
    }

    if (args.clearSocialMediaImage || args.replacementSocialMediaImage) {
      if (effect.social_media_image !== args.expectedSocialMediaImage) {
        throw new Error(`Legacy media precondition failed: ${args.slug}.social_media_image`);
      }
      await ctx.db.patch(effect._id, {
        social_media_image: args.replacementSocialMediaImage,
      });
    }
    await recordNarrativeMaintenance(ctx, { kind: "effect", key: args.slug, actor, before: effect, after: (await ctx.db.get(effect._id))! });

    return { repaired: true, changedFields: args.changes.length };
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
    actorEmail: v.optional(v.string()),
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
    const actor = await requireRole(ctx, { apiKey: args.apiKey, actorEmail: args.actorEmail }, "admin");

    const existing = await ctx.db
      .query("subjectiveEffects")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();

    if (!existing) {
      throw new Error(`Effect not found: ${args.slug}`);
    }

    await ctx.db.patch(existing._id, args.updates);
    await recordNarrativeMaintenance(ctx, { kind: "effect", key: args.slug, actor, before: existing, after: (await ctx.db.get(existing._id))! });
    return { success: true };
  },
});
