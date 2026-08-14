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
import { applyReferenceProvenanceRepair } from "./lib/articleReferenceProvenanceWrites";
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
import { substanceArticleLightValidator } from "./lib/validators";
import {
  ingestSubstanceArticle,
  ingestSubstanceArticles,
} from "./lib/substanceIngestion";
import {
  projectEditorArticle,
  projectEditorLibraryEntry,
  projectEditorLookup,
  projectLibraryInput,
  projectLookup,
  projectMechanismRouteInput,
  projectPublicArticle,
  projectPublicPreview,
  projectReviewedArticleForEmails,
  projectSearchInput,
} from "./lib/substanceReadProjections";
import {
  contributorReviewerEmails,
  normalizeProfileKey,
} from "./lib/contributorProfiles";

const RETIRED_CORPUS_OPERATION_MESSAGE =
  "Whole-corpus substance operations are retired. Use the bounded pagination endpoints and guarded per-article/CAS write workflows.";

const RETIRED_RANDOM_SAMPLE_MESSAGE =
  "The random-sample query is retired because its fallback paths require unbounded corpus reads. Use a bounded preview endpoint.";

export function rejectRetiredRandomSample(): never {
  throw new ConvexError({
    code: "BOUNDED_PAGINATION_REQUIRED",
    message: RETIRED_RANDOM_SAMPLE_MESSAGE,
  });
}

export function rejectWholeCorpusProjection(): never {
  throw new ConvexError({
    code: "BOUNDED_PAGINATION_REQUIRED",
    message: RETIRED_CORPUS_OPERATION_MESSAGE,
  });
}

/**
 * @deprecated Retained temporarily for function-name compatibility. The corpus
 * no longer fits within one Convex query execution; callers must drain
 * `getFullDocumentPage` or a smaller paginated projection.
 */
export const getAll = query({
  args: {},
  handler: async () => {
    throw new ConvexError({
      code: "BOUNDED_PAGINATION_REQUIRED",
      message: RETIRED_CORPUS_OPERATION_MESSAGE,
    });
  },
});

const SCRIPT_CORPUS_PAGE_SIZE = 32;

export function clampScriptCorpusPageSize(requested: number): number {
  const normalized = Number.isFinite(requested) ? Math.floor(requested) : SCRIPT_CORPUS_PAGE_SIZE;
  return Math.min(Math.max(normalized, 1), SCRIPT_CORPUS_PAGE_SIZE);
}

/**
 * Bounded full-document page for trusted offline/admin scripts. The legacy
 * `getAll` query remains temporarily for compatibility, but active scripts must
 * drain this endpoint instead of reading the corpus in one execution.
 */
export const getFullDocumentPage = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    return await ctx.db.query("substanceIndex").paginate({
      ...args.paginationOpts,
      numItems: clampScriptCorpusPageSize(args.paginationOpts.numItems),
    });
  },
});

function pickDefinedReferenceMetadata(reference: Record<string, unknown>) {
  const projected: Record<string, unknown> = {};
  for (const field of ["id", "title", "doi", "pmid", "isbn", "url", "authors", "metadataProvenance"] as const) {
    if (reference[field] !== undefined) projected[field] = reference[field];
  }
  return projected;
}

function projectReferenceMetadataArticle(article: Record<string, unknown>) {
  return {
    slug: article.slug,
    title: article.title,
    references: Array.isArray(article.references)
      ? article.references.map((value) => pickDefinedReferenceMetadata(value as Record<string, unknown>))
      : [],
  };
}

/**
 * Minimal citation/provenance planning projection. Marker identity is carried
 * by each reference id; article and reference titles plus stable identifiers
 * are retained for exact identity comparisons without returning article prose.
 */
export const getReferenceMetadataPage = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const result = await ctx.db.query("substanceIndex").paginate({
      ...args.paginationOpts,
      numItems: clampScriptCorpusPageSize(args.paginationOpts.numItems),
    });
    return {
      ...result,
      page: result.page.map((article) => projectReferenceMetadataArticle(article)),
    };
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
    const matches = await ctx.db
      .query("substanceIndex")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .take(2);
    return matches.length === 1 ? matches[0] : null;
  },
});

/**
 * @deprecated Retained temporarily for function-name compatibility. Editor
 * callers must drain `getEditorPage`.
 */
export const getEditorAll = query({
  args: {},
  handler: async () => {
    throw new ConvexError({
      code: "BOUNDED_PAGINATION_REQUIRED",
      message: RETIRED_CORPUS_OPERATION_MESSAGE,
    });
  },
});

/**
 * Paginated editor *library list* projection — the default drain behind
 * `/api/dev/editor-library`.
 *
 * This is `getEditorPage` minus every field only a whole article renders, which
 * takes the drain from ~16.7 MB to well under 1 MB. See
 * `projectEditorLibraryEntry` for the field list and the reasoning. Selecting an
 * article hydrates it through `getEditorBySlug`; the tools that genuinely sweep
 * whole articles (the tag editor, the review workbench) ask for the full drain
 * explicitly.
 *
 * SECURITY: `editorial_review` is editor-only state, so this is guarded exactly
 * like `getEditorPage`.
 */
export const getEditorLibraryPage = query({
  args: {
    paginationOpts: paginationOptsValidator,
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireEditorWrite(ctx, {
      apiKey: args.apiKey,
      actorEmail: args.actorEmail,
      adminIntent: "editorArticleWrite",
    });

    const result = await ctx.db.query("substanceIndex").paginate({
      ...args.paginationOpts,
      numItems: clampPublicCorpusPageSize(args.paginationOpts.numItems),
    });
    return { ...result, page: result.page.map(projectEditorLibraryEntry) };
  },
});

/**
 * One whole editor article by slug — the hydration read behind the library
 * list. `getBySlug` returns the raw row and is unauthenticated; this one runs
 * the editor projection (defaulted `editorial_review`, normalized pharmacology)
 * and is therefore guarded like every other editor-only read.
 */
export const getEditorBySlug = query({
  args: {
    slug: v.string(),
    // Rows whose slug is derived from the title rather than stored cannot be
    // found on `by_slug`; the library list carries the article id for exactly
    // that fallback, and `by_article_id` keeps it a single indexed read.
    id: v.optional(v.number()),
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireEditorWrite(ctx, {
      apiKey: args.apiKey,
      actorEmail: args.actorEmail,
      adminIntent: "editorArticleWrite",
    });

    const matches = await ctx.db
      .query("substanceIndex")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .take(2);

    if (matches.length === 1) {
      return projectEditorArticle(matches[0]);
    }

    if (args.id === undefined) {
      return null;
    }

    const byId = await ctx.db
      .query("substanceIndex")
      .withIndex("by_article_id", (q) => q.eq("id", args.id))
      .first();

    return byId ? projectEditorArticle(byId) : null;
  },
});

/**
 * Paginated whole-article editor projection. The `/api/dev/editor-library`
 * route drains every page server-side to hydrate the `/dev` and `/review`
 * editor library without
 * hitting the per-execution read and time limits that a whole-table `collect()`
 * now exceeds.
 *
 * SECURITY: this projection carries editor-only state — `editorial_review`
 * notes and review flags among it — so it is guarded exactly like the other
 * editor-only reads (`citationEvidence.getBySlug`, `articleSources.getSubstanceList`).
 * The browser must never call it directly; it holds no admin intent token.
 */
export const getEditorPage = query({
  args: {
    paginationOpts: paginationOptsValidator,
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireEditorWrite(ctx, {
      apiKey: args.apiKey,
      actorEmail: args.actorEmail,
      adminIntent: "editorArticleWrite",
    });

    const result = await ctx.db.query("substanceIndex").paginate({
      ...args.paginationOpts,
      numItems: clampPublicCorpusPageSize(args.paginationOpts.numItems),
    });
    return { ...result, page: result.page.map(projectEditorArticle) };
  },
});

/**
 * @deprecated Retained temporarily for function-name compatibility. Editor
 * callers must drain `getLookupPage`.
 */
export const getLookup = query({
  args: {},
  handler: async () => rejectWholeCorpusProjection(),
});

/**
 * Bounded editor lookup projection. Clients drain this endpoint so picker
 * metadata stays complete without loading full articles or provenance.
 */
export const getLookupPage = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const result = await ctx.db.query("substanceIndex").paginate({
      ...args.paginationOpts,
      numItems: clampPublicCorpusPageSize(args.paginationOpts.numItems),
    });
    return {
      ...result,
      page: result.page.map(projectEditorLookup),
    };
  },
});

/** @deprecated Callers must drain `getPublicLookupPage`. */
export const getPublicLookup = query({
  args: {},
  handler: async () => rejectWholeCorpusProjection(),
});

/** @deprecated Callers must drain `getPublicPreviewsPage`. */
export const getPublicPreviews = query({
  args: {},
  handler: async () => rejectWholeCorpusProjection(),
});

/** @deprecated Callers must drain `getPublicLibraryInputPage`. */
export const getLibraryInput = query({
  args: {},
  handler: async () => rejectWholeCorpusProjection(),
});

/** @deprecated Callers must drain `getPublicLibraryInputPage`. */
export const getPublicLibraryInput = query({
  args: {},
  handler: async () => rejectWholeCorpusProjection(),
});

/** @deprecated Callers must drain `getPublicCoverageInputPage`. */
export const getPublicCoverageInput = query({
  args: {},
  handler: async () => rejectWholeCorpusProjection(),
});

/** @deprecated Callers must drain `getSearchInputPage`. */
export const getSearchInput = query({
  args: {},
  handler: async () => rejectWholeCorpusProjection(),
});

/** @deprecated Callers must drain `getPublicMechanismRouteInputPage`. */
export const getPublicMechanismRouteInput = query({
  args: {},
  handler: async () => rejectWholeCorpusProjection(),
});

const PUBLIC_CORPUS_PAGE_SIZE = 32;
/**
 * Ceiling for explicitly requested page sizes. Callers that ask for nothing
 * still get the conservative default above; the trimmed list projections are
 * small enough that a draining client can ask for far larger pages and cut the
 * number of serial round trips by an order of magnitude.
 */
const PUBLIC_CORPUS_MAX_PAGE_SIZE = 200;
const publicCorpusPageArgs = {
  cursor: v.optional(v.string()),
  limit: v.optional(v.number()),
};

function clampPublicCorpusPageSize(requested: number | undefined): number {
  const normalized = Math.floor(requested ?? PUBLIC_CORPUS_PAGE_SIZE);
  return Math.min(Math.max(normalized, 1), PUBLIC_CORPUS_MAX_PAGE_SIZE);
}

/**
 * Additive public page reads keep each Convex execution below the raw document
 * read limit. Keep the legacy whole-corpus functions above temporarily for
 * compatibility with deployments that predate these endpoints.
 */
export const getPublicLookupPage = query({
  args: publicCorpusPageArgs,
  handler: async (ctx, args) => {
    const result = await ctx.db.query("substanceIndex").paginate({
      cursor: args.cursor ?? null,
      numItems: clampPublicCorpusPageSize(args.limit),
    });
    return {
      items: result.page.map(projectLookup),
      cursor: result.continueCursor,
      isDone: result.isDone,
    };
  },
});

export const getPublicPreviewsPage = query({
  args: publicCorpusPageArgs,
  handler: async (ctx, args) => {
    const result = await ctx.db.query("substanceIndex").paginate({
      cursor: args.cursor ?? null,
      numItems: clampPublicCorpusPageSize(args.limit),
    });
    return {
      items: result.page.map(projectPublicPreview),
      cursor: result.continueCursor,
      isDone: result.isDone,
    };
  },
});

export const getPublicLibraryInputPage = query({
  args: publicCorpusPageArgs,
  handler: async (ctx, args) => {
    const result = await ctx.db.query("substanceIndex").paginate({
      cursor: args.cursor ?? null,
      numItems: clampPublicCorpusPageSize(args.limit),
    });
    return {
      items: result.page.map(projectLibraryInput),
      cursor: result.continueCursor,
      isDone: result.isDone,
    };
  },
});

export const getPublicCoverageInputPage = query({
  args: publicCorpusPageArgs,
  handler: async (ctx, args) => {
    const result = await ctx.db.query("substanceIndex").paginate({
      cursor: args.cursor ?? null,
      numItems: clampPublicCorpusPageSize(args.limit),
    });
    return {
      items: result.page.map(projectPublicArticle),
      cursor: result.continueCursor,
      isDone: result.isDone,
    };
  },
});

export const getPublicMechanismRouteInputPage = query({
  args: publicCorpusPageArgs,
  handler: async (ctx, args) => {
    const result = await ctx.db.query("substanceIndex").paginate({
      cursor: args.cursor ?? null,
      numItems: clampPublicCorpusPageSize(args.limit),
    });
    return {
      items: result.page.map(projectMechanismRouteInput),
      cursor: result.continueCursor,
      isDone: result.isDone,
    };
  },
});

export const getSearchInputPage = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const result = await ctx.db.query("substanceIndex").paginate({
      ...args.paginationOpts,
      numItems: clampPublicCorpusPageSize(args.paginationOpts.numItems),
    });
    return {
      ...result,
      page: result.page.map(projectSearchInput),
    };
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
    const matches = await ctx.db
      .query("substanceIndex")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .take(2);
    return matches.length === 1 ? projectPublicArticle(matches[0]) : null;
  },
});

/**
 * Public reviewed-articles aggregate for one contributor profile: every
 * article whose completed `editorial_review` was stamped by an email this
 * profile owns (its `membershipEmail`, or the legacy `<handle>@local.dose.wiki`
 * credential email of its key or an alias — so retired handles like
 * witchy@local.dose.wiki resolve to the profile that absorbed the alias).
 *
 * Editor-independent and public-safe by construction: the reviewer email set
 * is resolved and matched inside this deployment, and each item carries only
 * the article's title, slug, and review timestamp. `editorial_review` itself
 * never leaves — this is the same boundary `projectPublicArticle` keeps.
 */
export const getPublicReviewedArticlesPage = query({
  args: { profileKey: v.string(), ...publicCorpusPageArgs },
  handler: async (ctx, args) => {
    const key = normalizeProfileKey(args.profileKey);
    const profile = key
      ? await ctx.db
          .query("contributorProfiles")
          .withIndex("by_key", (q) => q.eq("key", key))
          .first()
      : null;
    const reviewerEmails = profile ? contributorReviewerEmails(profile) : null;
    // No profile or no claimable email means no matches on any page; report
    // the drain done immediately instead of walking the corpus for nothing.
    if (!reviewerEmails || reviewerEmails.size === 0) {
      return { items: [], cursor: "", isDone: true };
    }
    const result = await ctx.db.query("substanceIndex").paginate({
      cursor: args.cursor ?? null,
      numItems: clampPublicCorpusPageSize(args.limit),
    });
    const items = [];
    for (const article of result.page) {
      const reviewed = projectReviewedArticleForEmails(article, reviewerEmails);
      if (reviewed) {
        items.push(reviewed);
      }
    }
    return {
      items,
      cursor: result.continueCursor,
      isDone: result.isDone,
    };
  },
});

/**
 * @deprecated Retained for function-name compatibility only. Its priority
 * fallbacks relied on unbounded collects, and it has no active callers.
 */
export const getRandomSample = query({
  args: {
    count: v.optional(v.number()),
    seed: v.optional(v.number()),
  },
  handler: async () => rejectRetiredRandomSample(),
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
 * Read one bounded article/reference snapshot for provenance-repair preflight.
 * Duplicate slugs and duplicate reference ids remain visible to the caller.
 */
export const getArticleReferenceProvenanceRepairSnapshot = query({
  args: {
    slug: v.string(),
    referenceId: v.string(),
  },
  handler: async (ctx, args) => {
    const articleMatches = await ctx.db
      .query("substanceIndex")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .take(2);
    if (articleMatches.length !== 1) {
      return {
        articleCount: articleMatches.length,
        referenceCount: 0,
        reference: null,
      };
    }
    const references = Array.isArray(articleMatches[0].references)
      ? articleMatches[0].references as Array<Record<string, unknown>>
      : [];
    const matches = references.filter((reference) => reference?.id === args.referenceId);
    return {
      articleCount: 1,
      referenceCount: matches.length,
      reference: matches.length === 1 ? matches[0] : null,
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

/**
 * Apply one approved provenance-only reference backfill with exact CAS guards.
 * Only the article's references array is patched, and the helper changes only
 * metadataProvenance on one uniquely identified reference.
 */
export const repairArticleReferenceMetadataProvenance = mutation({
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
      metadataProvenance: v.any(),
    }),
    proposedMetadataProvenance: v.any(),
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
    const selectedArticle = selectUniqueArticleForReferenceAuthorRepair(articleMatches, args.slug);
    if (selectedArticle.ok === false) {
      throw new ConvexError({ code: selectedArticle.code, message: selectedArticle.reason });
    }
    const article = selectedArticle.article;
    const result = applyReferenceProvenanceRepair(
      article as unknown as Record<string, unknown>,
      {
        referenceId: args.referenceId,
        expected: args.expected,
        proposedMetadataProvenance: args.proposedMetadataProvenance,
      },
    );
    if (result.ok === false) {
      throw new ConvexError({ code: result.code, message: result.reason });
    }
    if (result.updated && result.references) {
      await ctx.db.patch(article._id, { references: result.references } as Partial<typeof article>);
    }
    return {
      slug: args.slug,
      referenceId: args.referenceId,
      updated: result.updated,
      metadataProvenance: result.reference.metadataProvenance ?? [],
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
 * @deprecated Retained temporarily for function-name compatibility. Atomic
 * whole-corpus replacement cannot stay within Convex execution limits and is
 * intentionally fail-closed. Use guarded per-article/CAS write workflows.
 */
export const replaceAllSubstances = internalMutation({
  args: { articles: v.array(substanceArticleLightValidator) },
  handler: async () => {
    throw new ConvexError({
      code: "BULK_REPLACEMENT_RETIRED",
      message: RETIRED_CORPUS_OPERATION_MESSAGE,
    });
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
