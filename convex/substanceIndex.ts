import { ConvexError, v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
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
import { appendArticleReference as appendReferenceToArticle } from "./lib/articleReferenceWrites";
import {
  applyReferenceAuthorRepair,
  selectUniqueArticleForReferenceAuthorRepair,
} from "./lib/articleReferenceAuthorWrites";
import {
  addHumanReviewFlag as appendHumanReviewFlag,
  assertAgentReviewFlagInput,
  deleteReviewFlagByIdentity,
  preserveEditorialReviewWithFlags,
  replaceAgentReviewFlags,
  type StoredReviewFlag,
} from "./lib/reviewFlags";
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
  projectEditorLookup,
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

/**
 * @deprecated The corpus outgrew a single query execution (~16MB read blows the
 * 1s query timeout); this remains only for offline scripts pointed at smaller
 * deployments. App code must use `getEditorPage`.
 */
export const getEditorAll = query({
  args: {},
  handler: async (ctx) => {
    const articles = await ctx.db.query("substanceIndex").collect();
    return articles.map(projectEditorArticle);
  },
});

/**
 * Paginated editor projection. `useLazyLibrary` drains every page to hydrate
 * the `/dev` and `/review` editor library without hitting the per-execution
 * read and time limits that a whole-table `collect()` now exceeds.
 */
export const getEditorPage = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const result = await ctx.db.query("substanceIndex").paginate(args.paginationOpts);
    return { ...result, page: result.page.map(projectEditorArticle) };
  },
});

/**
 * Editor-side lookup: names from slugs without loading article content, plus the
 * visibility and category facets `/dev` pickers order and label their lists with.
 */
export const getLookup = query({
  args: {},
  handler: async (ctx) => {
    const articles = await ctx.db.query("substanceIndex").collect();
    return articles.map(projectEditorLookup);
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
      throw new ConvexError({
        code: "ARTICLE_NOT_FOUND",
        message: `No substance found for slug "${args.slug}".`,
      });
    }

    const existing =
      article.editorial_review && typeof article.editorial_review === "object"
        ? (article.editorial_review as Record<string, unknown>)
        : {};

    const editorialReview: Record<string, unknown> = {
      status: args.status,
      notes: typeof existing.notes === "string" ? existing.notes : "",
      ...(Array.isArray(existing.flags) ? { flags: existing.flags } : {}),
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

const agentReviewFlagValidator = v.object({
  label: v.string(),
  severity: v.union(v.literal("major"), v.literal("minor"), v.literal("note")),
  note: v.string(),
  section: v.optional(v.union(
    v.literal("overview"),
    v.literal("classification"),
    v.literal("summary"),
    v.literal("dosage-duration"),
    v.literal("subjective-effects"),
    v.literal("reagent-testing"),
    v.literal("pharmacology"),
    v.literal("interactions"),
    v.literal("tolerance"),
    v.literal("harm-potential"),
    v.literal("history-culture"),
    v.literal("legality"),
    v.literal("sources"),
    v.literal("citations"),
    v.literal("editorial-review"),
  )),
});

/** Add one editor-authored advisory flag without changing human review state. */
export const addHumanReviewFlag = mutation({
  args: { apiKey: v.optional(v.string()), actorEmail: v.optional(v.string()), slug: v.string(), flag: agentReviewFlagValidator },
  handler: async (ctx, args) => {
    const actor = await requireEditorWrite(ctx, { apiKey: args.apiKey, actorEmail: args.actorEmail, adminIntent: "editorArticleWrite" });
    try { assertAgentReviewFlagInput(args.flag); } catch (error) {
      throw new ConvexError({ code: "INVALID_REVIEW_FLAG", message: error instanceof Error ? error.message : "Invalid Review Flag." });
    }
    const article = await ctx.db.query("substanceIndex").withIndex("by_slug", (q) => q.eq("slug", args.slug)).first();
    if (!article) throw new ConvexError({ code: "ARTICLE_NOT_FOUND", message: `No substance found for slug "${args.slug}".` });
    const existing = article.editorial_review && typeof article.editorial_review === "object" ? article.editorial_review as Record<string, unknown> : {};
    const flags = appendHumanReviewFlag(Array.isArray(existing.flags) ? existing.flags as StoredReviewFlag[] : [], args.flag, new Date().toISOString(), actor.email);
    await ctx.db.patch(article._id, { editorial_review: preserveEditorialReviewWithFlags(existing, flags) });
    return { slug: args.slug, flags };
  },
});

/** Delete exactly one flag by its stable stored identity. */
export const deleteReviewFlag = mutation({
  args: { apiKey: v.optional(v.string()), actorEmail: v.optional(v.string()), slug: v.string(), identity: v.object({ created_at: v.string(), label: v.string(), source: v.union(v.literal("agent"), v.literal("human")) }) },
  handler: async (ctx, args) => {
    await requireEditorWrite(ctx, { apiKey: args.apiKey, actorEmail: args.actorEmail, adminIntent: "editorArticleWrite" });
    const article = await ctx.db.query("substanceIndex").withIndex("by_slug", (q) => q.eq("slug", args.slug)).first();
    if (!article) throw new ConvexError({ code: "ARTICLE_NOT_FOUND", message: `No substance found for slug "${args.slug}".` });
    const existing = article.editorial_review && typeof article.editorial_review === "object" ? article.editorial_review as Record<string, unknown> : {};
    let flags: StoredReviewFlag[];
    try {
      flags = deleteReviewFlagByIdentity(Array.isArray(existing.flags) ? existing.flags as StoredReviewFlag[] : [], args.identity);
    } catch {
      throw new ConvexError({ code: "FLAG_NOT_FOUND", message: "That Review Flag no longer exists." });
    }
    await ctx.db.patch(article._id, { editorial_review: preserveEditorialReviewWithFlags(existing, flags) });
    return { slug: args.slug, flags };
  },
});

/** Replace one Review Run's agent-sourced flags without touching human review state. */
export const replaceAgentReviewFlagsForArticle = mutation({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    slug: v.string(),
    runId: v.string(),
    flags: v.array(agentReviewFlagValidator),
  },
  handler: async (ctx, args) => {
    await requireEditorWrite(ctx, {
      apiKey: args.apiKey,
      actorEmail: args.actorEmail,
      adminIntent: "editorArticleWrite",
    });
    if (!args.runId.trim()) {
      throw new ConvexError({ code: "INVALID_REVIEW_RUN", message: "Review Run id is required." });
    }
    for (const flag of args.flags) {
      try {
        assertAgentReviewFlagInput(flag);
      } catch (error) {
        throw new ConvexError({
          code: "INVALID_REVIEW_FLAG",
          message: error instanceof Error ? error.message : "Invalid Review Flag.",
        });
      }
    }

    const article = await ctx.db
      .query("substanceIndex")
      .withIndex("by_slug", (query) => query.eq("slug", args.slug))
      .first();
    if (!article) {
      throw new ConvexError({
        code: "ARTICLE_NOT_FOUND",
        message: `No substance found for slug "${args.slug}".`,
      });
    }
    const existing = article.editorial_review && typeof article.editorial_review === "object"
      ? article.editorial_review as Record<string, unknown>
      : {};
    const existingFlags = Array.isArray(existing.flags)
      ? existing.flags as StoredReviewFlag[]
      : [];
    const flags = replaceAgentReviewFlags(
      existingFlags,
      args.flags,
      args.runId,
      new Date().toISOString(),
    );
    const editorialReview = { ...existing, flags };
    await ctx.db.patch(article._id, { editorial_review: editorialReview });
    return { slug: args.slug, flags };
  },
});

/**
 * Write one allow-listed string field on one article.
 *
 * The review portal's inline click-to-edit fixes a typo in place; sending the
 * whole article back through the editor save flow for that would risk
 * clobbering concurrent edits and would demand a commit message for a one-word
 * change. Only paths in `EDITABLE_ARTICLE_FIELD_KINDS` are writable, each only
 * with a value of its declared kind, and only the single top-level key the path
 * touches is patched.
 *
 * Refusals throw `ConvexError({ code, message })` — `FIELD_CONFLICT`,
 * `FIELD_NOT_EDITABLE`, `FIELD_VALUE_INVALID`, `ARTICLE_NOT_FOUND`, or
 * `FIELD_WRITE_REJECTED`. The message is written for the reviewer who triggered
 * the edit and is forwarded to them verbatim; the code is what a client
 * branches on. See `src/lib/http/convexRejection.ts` for the HTTP status each
 * code maps to.
 */
const editableFieldValueValidator = v.union(
  v.string(),
  v.object({
    min: v.union(v.number(), v.null()),
    max: v.union(v.number(), v.null()),
    unit: v.string(),
  }),
);

export const setArticleField = mutation({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    slug: v.string(),
    path: v.string(),
    value: editableFieldValueValidator,
    /**
     * The value the editor was looking at. Array indices in `path` come from a
     * client-side draft that can be reordered or shortened before Convex ever
     * hears about it, so the write is refused unless the stored field still
     * holds what the screen showed.
     */
    expected: v.optional(editableFieldValueValidator),
  },
  handler: async (ctx, args) => {
    await requireEditorWrite(ctx, {
      apiKey: args.apiKey,
      actorEmail: args.actorEmail,
      adminIntent: "editorArticleWrite",
    });

    if (!isEditableArticleFieldPath(args.path)) {
      throw new ConvexError({
        code: "FIELD_NOT_EDITABLE",
        message: `Field "${args.path}" is not inline-editable.`,
      });
    }
    if (
      typeof args.value === "string" &&
      args.value.length > EDITABLE_ARTICLE_FIELD_MAX_LENGTH
    ) {
      throw new ConvexError({
        code: "FIELD_VALUE_INVALID",
        message: `Field value exceeds ${EDITABLE_ARTICLE_FIELD_MAX_LENGTH} characters.`,
      });
    }

    const article = await ctx.db
      .query("substanceIndex")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
    if (!article) {
      throw new ConvexError({
        code: "ARTICLE_NOT_FOUND",
        message: `No substance found for slug "${args.slug}".`,
      });
    }

    const result = applyEditableFieldWrite(
      article as unknown as Record<string, unknown>,
      args.path,
      args.value,
      { expected: args.expected },
    );
    if (result.ok === false) {
      // The walker already distinguishes "the value moved under you" from every
      // other refusal, and that distinction is the one a client can act on —
      // reload and retry, versus fix the request. Carrying it as a code rather
      // than leaving the caller to match on `result.reason` keeps the user copy
      // free to change without breaking anyone.
      throw new ConvexError({
        code: result.conflict === true ? "FIELD_CONFLICT" : "FIELD_WRITE_REJECTED",
        message: result.reason,
      });
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

/**
 * Append one source to one article's `references` array.
 *
 * The review workbench's citation palette mints a source mid-queue; the array
 * append does not fit `setArticleField`, which is scalar-only by construction.
 *
 * Idempotent by canonical source identity: an existing DOI/PMID/ISBN/URL match
 * is returned with `created: false`; missing metadata may be losslessly merged,
 * while conflicting populated fields keep the stored value unless explicit
 * higher-ranked provenance supports the incoming value. The stored marker id
 * remains canonical even when it predates deterministic ids, making retries,
 * double-clicks, and two reviewers pasting the same source safe without the
 * `expected`-value handshake an inline edit uses.
 *
 * `supportStatus` is forced server-side: a pasted identifier is a claim that a
 * source exists, not evidence anyone read it, and the citation workbench triages
 * on that field.
 *
 * The arg is validated as `v.any()` here and structurally by `referenceSchema`
 * inside `appendArticleReference` — the same light-arg-plus-contract split
 * `convex/lib/validators.ts` documents. Refusals throw
 * `ConvexError({ code, message })`: `ARTICLE_NOT_FOUND` or
 * `REFERENCE_WRITE_REJECTED`, with a message written for the reviewer.
 */
export const appendArticleReference = mutation({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    slug: v.string(),
    reference: v.any(),
  },
  handler: async (ctx, args) => {
    await requireEditorWrite(ctx, {
      apiKey: args.apiKey,
      actorEmail: args.actorEmail,
      adminIntent: "editorArticleWrite",
    });

    const article = await ctx.db
      .query("substanceIndex")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
    if (!article) {
      throw new ConvexError({
        code: "ARTICLE_NOT_FOUND",
        message: `No substance found for slug "${args.slug}".`,
      });
    }

    const result = appendReferenceToArticle(
      article as unknown as Record<string, unknown>,
      args.reference,
    );
    if (result.ok === false) {
      throw new ConvexError({
        code: "REFERENCE_WRITE_REJECTED",
        message: result.reason,
      });
    }

    if (result.references) {
      await ctx.db.patch(
        article._id,
        { references: result.references } as Partial<typeof article>,
      );
    }

    return {
      slug: args.slug,
      created: result.created,
      reference: result.reference,
    };
  },
});

/**
 * Apply one reviewed, authors-only reference metadata repair with a bounded CAS
 * guard. Only the `references` key is patched; stale identity/authors snapshots
 * are refused, while an already-applied proposal is an idempotent no-op.
 */
export const repairArticleReferenceAuthors = mutation({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    slug: v.string(),
    referenceId: v.string(),
    expected: v.object({
      title: v.string(),
      doi: v.union(v.string(), v.null()),
      pmid: v.union(v.string(), v.null()),
      authors: v.array(v.string()),
    }),
    proposedAuthors: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    await requireEditorWrite(ctx, {
      apiKey: args.apiKey,
      actorEmail: args.actorEmail,
      adminIntent: "editorArticleWrite",
    });

    const articleMatches = await ctx.db
      .query("substanceIndex")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .take(2);
    const selectedArticle = selectUniqueArticleForReferenceAuthorRepair(
      articleMatches,
      args.slug,
    );
    if (selectedArticle.ok === false) {
      throw new ConvexError({
        code: selectedArticle.code,
        message: selectedArticle.reason,
      });
    }
    const article = selectedArticle.article;

    const result = applyReferenceAuthorRepair(
      article as unknown as Record<string, unknown>,
      {
        referenceId: args.referenceId,
        expected: args.expected,
        proposedAuthors: args.proposedAuthors,
      },
    );
    if (result.ok === false) {
      throw new ConvexError({ code: result.code, message: result.reason });
    }
    if (result.updated && result.references) {
      await ctx.db.patch(
        article._id,
        { references: result.references } as Partial<typeof article>,
      );
    }
    return {
      slug: args.slug,
      referenceId: args.referenceId,
      updated: result.updated,
      authors: result.reference.authors,
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
        pharmacology: validation.article.pharmacology,
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
