import { ConvexError, v } from "convex/values";
import { query, mutation, internalMutation, type MutationCtx } from "./_generated/server";
import {
  requireAdminIntent,
  requireEditorWrite,
  requireRegisteredDelegatedEditorWrite,
} from "./lib/auth";
import {
  applyEditableFieldWrite,
  EDITABLE_ARTICLE_FIELD_MAX_LENGTH,
  isEditableArticleFieldPath,
} from "./lib/articleFieldWrites";
import {
  GeneratedPublicationError,
  publishReviewedSectionTransaction,
  requireGeneratedPublicationDeploymentFingerprint,
  type ReviewedPublicationProposal,
} from "./lib/generatedPublication";
import { substanceArticleLightValidator, validateArticleForIngestion } from "./lib/validators";
import { ingestSubstanceArticle, ingestSubstanceArticles, slugify } from "./lib/substanceIngestion";
import {
  compareSubstancePreviews,
  projectEditorArticle,
  projectLibraryInput,
  projectLookup,
  projectMechanismRouteInput,
  projectPublicArticle,
  projectPublicPreview,
  projectSearchInput,
} from "./lib/substanceReadProjections";

/**
 * Query to get all substances from the index.
 * Returns the complete list of substance articles.
 */
export const getAll = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("substanceIndex").collect();
  },
});

/**
 * Query to get a single substance by its article ID (not Convex _id).
 */
export const getById = query({
  args: { id: v.number() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("substanceIndex")
      .withIndex("by_article_id", (q) => q.eq("id", args.id))
      .first();
  },
});

/**
 * Query to get a single substance by title.
 */
export const getByTitle = query({
  args: { title: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("substanceIndex")
      .withIndex("by_title", (q) => q.eq("title", args.title))
      .first();
  },
});

/**
 * Query to get a single substance by slug.
 * This is the primary lookup for per-article loading.
 */
export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("substanceIndex")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
  },
});

export const getEditorAll = query({
  args: {},
  handler: async (ctx) => {
    const articles = await ctx.db.query("substanceIndex").collect();
    return articles.map(projectEditorArticle);
  },
});

/**
 * Lookup projection for resolving names from slugs without loading article content.
 */
export const getLookup = query({
  args: {},
  handler: async (ctx) => {
    const articles = await ctx.db.query("substanceIndex").collect();
    return articles.map(projectLookup);
  },
});

export const getPublicLookup = query({
  args: {},
  handler: async (ctx) => {
    const articles = await ctx.db.query("substanceIndex").collect();
    return articles.map(projectLookup);
  },
});

export const getPublicPreviews = query({
  args: {},
  handler: async (ctx) => {
    const articles = await ctx.db.query("substanceIndex").collect();
    return articles.map(projectPublicPreview).sort(compareSubstancePreviews);
  },
});

export const getLibraryInput = query({
  args: {},
  handler: async (ctx) => {
    const articles = await ctx.db.query("substanceIndex").collect();
    return articles.map(projectLibraryInput);
  },
});

export const getPublicLibraryInput = query({
  args: {},
  handler: async (ctx) => {
    const articles = await ctx.db.query("substanceIndex").collect();
    return articles.map(projectLibraryInput);
  },
});

export const getPublicCoverageInput = query({
  args: {},
  handler: async (ctx) => {
    const articles = await ctx.db.query("substanceIndex").collect();
    return articles.map(projectPublicArticle);
  },
});

export const getSearchInput = query({
  args: {},
  handler: async (ctx) => {
    const articles = await ctx.db.query("substanceIndex").collect();
    return articles.map(projectSearchInput);
  },
});

export const getPublicMechanismRouteInput = query({
  args: {},
  handler: async (ctx) => {
    const articles = await ctx.db.query("substanceIndex").collect();
    return articles.map(projectMechanismRouteInput);
  },
});

const ABOUT_PREVIEW_CANDIDATE_PAGE_SIZE = 64;

export const getPublicAboutPreviewCandidates = query({
  args: {
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const requestedLimit = Math.floor(
      args.limit ?? ABOUT_PREVIEW_CANDIDATE_PAGE_SIZE,
    );
    const limit = Math.min(
      Math.max(requestedLimit, 1),
      ABOUT_PREVIEW_CANDIDATE_PAGE_SIZE,
    );
    const articles = await ctx.db
      .query("substanceIndex")
      .paginate({ cursor: args.cursor ?? null, numItems: limit });

    return {
      items: articles.page.map(projectPublicArticle),
      cursor: articles.continueCursor,
      isDone: articles.isDone,
    };
  },
});

export const getPublicBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const article = await ctx.db
      .query("substanceIndex")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
    return article ? projectPublicArticle(article) : null;
  },
});

/**
 * Query to get N random articles for preview.
 * Only loads high-priority articles (~252 vs 679 total) then shuffles.
 *
 * @param count - Number of articles to return (default: 5)
 * @param seed - Optional seed to force re-query (changing seed triggers new random sample)
 */
export const getRandomSample = query({
  args: {
    count: v.optional(v.number()),
    seed: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // seed is only used to trigger re-query, not for actual randomization
    void args.seed;

    const count = args.count ?? 5;

    // Prefer high-priority articles, then fall back to normal priority,
    // then to any available articles.
    let articles = await ctx.db
      .query("substanceIndex")
      .withIndex("by_priority", (q) => q.eq("priority", "high"))
      .collect();

    if (articles.length === 0) {
      articles = await ctx.db
        .query("substanceIndex")
        .withIndex("by_priority", (q) => q.eq("priority", "normal"))
        .collect();
    }

    if (articles.length === 0) {
      articles = await ctx.db.query("substanceIndex").collect();
    }

    // Fisher-Yates shuffle (partial - only need first `count` elements)
    const shuffled = [...articles];
    for (let i = 0; i < Math.min(count, shuffled.length); i++) {
      const j = i + Math.floor(Math.random() * (shuffled.length - i));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    return shuffled.slice(0, count).map(projectPublicPreview);
  },
});

/**
 * Mutation to save/update a single substance.
 * If a substance with the same ID exists, it updates it. Otherwise, it creates a new one.
 * Automatically computes slug from title if not provided.
 *
 * Args pass the light identity validator only; the full Zod article contract
 * runs inside `ingestSubstanceArticle` before any insert/patch.
 *
 * @param apiKey - Required API key for authentication (set CONVEX_ADMIN_KEY env var)
 * @param article - The substance article to save
 */
export const saveSubstance = mutation({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    article: substanceArticleLightValidator,
  },
  handler: async (ctx, args) => {
    await requireEditorWrite(ctx, {
      apiKey: args.apiKey,
      actorEmail: args.actorEmail,
      adminIntent: "editorArticleWrite",
    });

    const outcome = await ingestSubstanceArticle({ db: ctx.db, article: args.article });
    if (outcome.action === "skipped") {
      throw new Error(outcome.error ?? "Unable to save substance.");
    }

    return {
      updated: outcome.action === "updated",
      id: outcome.convexId,
      outcome,
      affectedPaths: outcome.affectedPaths,
    };
  },
});

/**
 * Mutation to save multiple substances at once.
 * Updates existing substances (by article ID) and creates new ones as needed.
 * Automatically computes slug from title if not provided.
 *
 * Args pass the light identity validator only; each article is then checked
 * against the full Zod contract inside `ingestSubstanceArticles`. Invalid
 * articles are skipped individually with per-item messages in the result's
 * `errors`/`outcomes` rather than failing the whole batch.
 *
 * @param apiKey - Required API key for authentication (set CONVEX_ADMIN_KEY env var)
 * @param articles - Array of substance articles to save
 */
export const saveSubstances = mutation({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    articles: v.array(substanceArticleLightValidator),
  },
  handler: async (ctx, args) => {
    await requireEditorWrite(ctx, {
      apiKey: args.apiKey,
      actorEmail: args.actorEmail,
      adminIntent: "editorArticleWrite",
    });

    return ingestSubstanceArticles({ db: ctx.db, articles: args.articles });
  },
});

/**
 * Publish one explicitly reviewed generated-content profile with a section-scoped
 * compare-and-swap precondition. Full article snapshots are guards only; the
 * transaction constructs a bounded patch from the profile-owned changed fields.
 */
export async function publishReviewedSectionHandler(
  ctx: MutationCtx,
  args: { apiKey?: string; actorEmail: string; proposal: unknown },
) {
  if (!args.actorEmail.trim()) {
    throw new ConvexError({
      code: "INVALID_ACTOR",
      message: "A delegated editor actorEmail is required.",
    });
  }

  if (!args.apiKey?.trim()) {
    throw new ConvexError({
      code: "SCOPED_TOKEN_REQUIRED",
      message: "The generated-publication scoped token is required.",
    });
  }

  try {
    const credential = await requireAdminIntent(args.apiKey, "generatedPublicationWrite");
    if (credential.source !== "scoped") {
      throw new ConvexError({
        code: "SCOPED_TOKEN_REQUIRED",
        message: "The legacy admin key cannot authorize generated publication.",
      });
    }
    const actor = await requireRegisteredDelegatedEditorWrite(ctx, {
      apiKey: args.apiKey,
      actorEmail: args.actorEmail,
      adminIntent: "generatedPublicationWrite",
    });
    return await publishReviewedSectionTransaction({
      db: ctx.db,
      proposal: args.proposal as ReviewedPublicationProposal,
      actorEmail: actor.email,
      now: new Date().toISOString(),
      expectedTargetDeploymentFingerprint: requireGeneratedPublicationDeploymentFingerprint(),
    });
  } catch (error) {
    if (error instanceof ConvexError) throw error;
    if (error instanceof GeneratedPublicationError) {
      throw new ConvexError({
        code: error.code,
        message: error.message,
        ...error.details,
      });
    }
    throw new ConvexError({
      code: error instanceof Error && error.name === "AuthError" ? "UNAUTHORIZED" : "PUBLICATION_FAILED",
      message: error instanceof Error ? error.message : "Generated publication failed.",
    });
  }
}

/**
 * Set the editor-only manual review state for one article without touching
 * anything else on the document.
 *
 * The full editor save flow (diff, commit message, changelog) is the wrong
 * weight for flipping a review tick from the review-mode UI, and sending the
 * whole article back risks clobbering concurrent edits. This patches only
 * `editorial_review`, preserving the notes an editor may have written, and
 * stamps who completed the review and when. Reverting the status drops the
 * stamp so a cleared tick never keeps claiming a reviewer.
 */
export const setEditorialReview = mutation({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    slug: v.string(),
    status: v.union(
      v.literal("needed"),
      v.literal("in_progress"),
      v.literal("completed"),
    ),
  },
  handler: async (ctx, args) => {
    const actor = await requireEditorWrite(ctx, {
      apiKey: args.apiKey,
      actorEmail: args.actorEmail,
      adminIntent: "editorArticleWrite",
    });

    const article = await ctx.db
      .query("substanceIndex")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
    if (!article) {
      throw new ConvexError(`No substance found for slug "${args.slug}".`);
    }

    const existing =
      article.editorial_review && typeof article.editorial_review === "object"
        ? (article.editorial_review as Record<string, unknown>)
        : {};

    const editorialReview: Record<string, unknown> = {
      status: args.status,
      notes: typeof existing.notes === "string" ? existing.notes : "",
      ...(args.status === "completed"
        ? {
            reviewed_by: actor.email,
            reviewed_at: new Date(Date.now()).toISOString(),
          }
        : {}),
    };

    await ctx.db.patch(article._id, { editorial_review: editorialReview });

    return {
      slug: args.slug,
      editorial_review: editorialReview,
    };
  },
});

/**
 * Write one allow-listed string field on one article.
 *
 * The review portal's inline click-to-edit fixes a typo in place; sending the
 * whole article back through the editor save flow for that would risk
 * clobbering concurrent edits and would demand a commit message for a one-word
 * change. Only paths in `EDITABLE_ARTICLE_FIELD_TEMPLATES` are writable, only
 * strings are accepted, and only the single top-level key the path touches is
 * patched.
 */
export const setArticleField = mutation({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    slug: v.string(),
    path: v.string(),
    value: v.string(),
    /**
     * The value the editor was looking at. Array indices in `path` come from a
     * client-side draft that can be reordered or shortened before Convex ever
     * hears about it, so the write is refused unless the stored field still
     * holds what the screen showed.
     */
    expected: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireEditorWrite(ctx, {
      apiKey: args.apiKey,
      actorEmail: args.actorEmail,
      adminIntent: "editorArticleWrite",
    });

    if (!isEditableArticleFieldPath(args.path)) {
      throw new ConvexError(`Field "${args.path}" is not inline-editable.`);
    }
    if (args.value.length > EDITABLE_ARTICLE_FIELD_MAX_LENGTH) {
      throw new ConvexError(
        `Field value exceeds ${EDITABLE_ARTICLE_FIELD_MAX_LENGTH} characters.`,
      );
    }

    const article = await ctx.db
      .query("substanceIndex")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
    if (!article) {
      throw new ConvexError(`No substance found for slug "${args.slug}".`);
    }

    const result = applyEditableFieldWrite(
      article as unknown as Record<string, unknown>,
      args.path,
      args.value,
      { expected: args.expected },
    );
    if (result.ok === false) {
      throw new ConvexError(result.reason);
    }

    await ctx.db.patch(
      article._id,
      { [result.topLevelKey]: result.topLevelValue } as Partial<typeof article>,
    );

    return {
      slug: args.slug,
      path: args.path,
      value: result.value,
      topLevelKey: result.topLevelKey,
      topLevelValue: result.topLevelValue,
    };
  },
});

export const publishReviewedSection = mutation({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.string(),
    proposal: v.any(),
  },
  handler: publishReviewedSectionHandler,
});

/**
 * Internal mutation to replace ALL substances (bulk import/sync).
 * Deletes all existing substances and inserts the new set.
 * Automatically computes slug from title if not provided.
 *
 * NOTE: This is an internal mutation - not exposed to clients.
 * Call via Convex admin CLI or from an action.
 */
export const replaceAllSubstances = internalMutation({
  args: { articles: v.array(substanceArticleLightValidator) },
  handler: async (ctx, args) => {
    // Delete all existing substances
    const existing = await ctx.db.query("substanceIndex").collect();
    for (const article of existing) {
      await ctx.db.delete(article._id);
    }

    // Insert all new substances with slugs (skip invalid ones)
    let inserted = 0;
    for (const article of args.articles) {
      const validation = validateArticleForIngestion(article);
      if (validation.ok === false) {
        console.warn(`Skipping invalid article: ${article.title}: ${validation.message}`);
        continue;
      }
      const articleWithSlug = {
        ...article,
        slug: article.slug ?? slugify(article.title),
      };
      await ctx.db.insert("substanceIndex", articleWithSlug);
      inserted++;
    }

    return {
      deleted: existing.length,
      inserted,
    };
  },
});

/**
 * Mutation to delete a single substance by its article ID.
 *
 * @param apiKey - Required API key for authentication (set CONVEX_ADMIN_KEY env var)
 * @param id - The article ID of the substance to delete
 */
export const deleteSubstance = mutation({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    id: v.number(),
  },
  handler: async (ctx, args) => {
    await requireEditorWrite(ctx, {
      apiKey: args.apiKey,
      actorEmail: args.actorEmail,
      adminIntent: "editorArticleWrite",
    });

    const existing = await ctx.db
      .query("substanceIndex")
      .withIndex("by_article_id", (q) => q.eq("id", args.id))
      .first();

    if (existing) {
      await ctx.db.delete(existing._id);
      return { deleted: true };
    }

    return { deleted: false };
  },
});
