import { ConvexError, v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { query, type MutationCtx } from "./_generated/server";
import { mutation, internalMutation } from "./lib/indexedMutation";
import { requireRole } from "./lib/auth";
import { substanceArticleLightValidator } from "./lib/validators";
import {
  projectEditorLibraryEntry,
  projectEditorLookup,
  projectLibraryInput,
  projectLookup,
  projectMechanismRouteInput,
  projectPublicArticle,
  projectPublicPreview,
  projectSearchInput,
} from "./lib/substanceReadProjections";
import { resolveSubstanceSlug } from "./lib/substanceProjectionCore";
import { projectTagRegistryEntry } from "./lib/substanceTagRegistryProjection";
import {
  getEditorSubstanceBySlugHandler,
  getPublicAboutPreviewCandidatesHandler,
  getPublicReviewedArticleCreditsPageHandler,
  getPublicReviewedArticlesPageHandler,
  getSubstanceByIdHandler,
  getSubstanceByTitleHandler,
} from "./lib/substanceReadHandlers";
import {
  getArticleReferenceProvenanceRepairSnapshotHandler,
  repairArticleReferenceAuthorsHandler,
  repairArticleReferenceMetadataProvenanceHandler,
} from "./lib/substanceProvenanceHandlers";
import {
  addHumanReviewFlagHandler,
  deleteReviewFlagHandler,
  publishReviewedSectionHandler as executePublishReviewedSection,
  replaceAgentReviewFlagsHandler,
  setEditorialReviewHandler,
} from "./lib/substanceReviewHandlers";
import {
  appendArticleReferenceHandler,
  deleteSubstanceHandler,
  removeArticleReferenceHandler,
  saveSubstanceHandler,
  saveSubstancesHandler,
  setArticleFieldHandler,
  setIupacNameHandler,
} from "./lib/substanceWriteHandlers";

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

export const getById = query({
  args: { id: v.number() },
  handler: getSubstanceByIdHandler,
});

export const getByTitle = query({
  args: { title: v.string() },
  handler: getSubstanceByTitleHandler,
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
 * callers drain `getEditorLibraryPage` and hydrate rows with `getEditorBySlug`.
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

export const getEditorLibraryPage = query({
  args: {
    paginationOpts: paginationOptsValidator,
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, {
      apiKey: args.apiKey,
      actorEmail: args.actorEmail,
      adminIntent: "editorArticleWrite",
    }, "editor");

    const result = await ctx.db.query("substanceIndex").paginate({
      ...args.paginationOpts,
      numItems: clampPublicCorpusPageSize(args.paginationOpts.numItems),
    });
    return { ...result, page: result.page.map(projectEditorLibraryEntry) };
  },
});

/**
 * Tag-registry projection for the dev tag editor. Same auth and page shape as
 * the editor library list, but each row carries only what `buildTagRegistry`
 * reads, so the tag editor never has to drain whole articles.
 */
export const getTagRegistryPage = query({
  args: {
    paginationOpts: paginationOptsValidator,
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, {
      apiKey: args.apiKey,
      actorEmail: args.actorEmail,
      adminIntent: "editorArticleWrite",
    }, "editor");

    const result = await ctx.db.query("substanceIndex").paginate({
      ...args.paginationOpts,
      numItems: clampPublicCorpusPageSize(args.paginationOpts.numItems),
    });
    return { ...result, page: result.page.map(projectTagRegistryEntry) };
  },
});

/** Authenticated whole-article hydration for the editor library. */
export const getEditorBySlug = query({
  args: {
    slug: v.string(),
    id: v.optional(v.number()),
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
  },
  handler: getEditorSubstanceBySlugHandler,
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

const PUBLIC_SLUG_PAGE_SIZE = 160;
const PUBLIC_SLUG_PAGE_MAX_SIZE = 400;
/**
 * Bytes of article JSON one slug page may pull before it hands back a cursor.
 * Convex bills a query for every document it reads even when the projection
 * keeps a single field, so a slug page is bounded by article bytes rather than
 * by item count alone; the corpus averages ~36 KB per article with 300 KB
 * outliers, and a function execution may read at most 8 MiB.
 */
const PUBLIC_SLUG_PAGE_BYTE_BUDGET = 4 * 1024 * 1024;

function clampPublicSlugPageSize(requested: number | undefined): number {
  const normalized = Math.floor(requested ?? PUBLIC_SLUG_PAGE_SIZE);
  return Math.min(Math.max(normalized, 1), PUBLIC_SLUG_PAGE_MAX_SIZE);
}

/**
 * Every public substance slug, in `by_slug` order, in far fewer round trips
 * than draining `getPublicPreviewsPage`: article routes only need the slug set
 * to decide which wiki links resolve, and the previews page ships title,
 * summary and categories for 32 articles per call.
 *
 * Public visibility follows the same rule as `getPublicPreviewsPage` and
 * `getPublicBySlug`: every stored article is public, and the slug is resolved
 * through `resolveSubstanceSlug` so a row without a stored slug still reports
 * the address the article renders under.
 *
 * `cursor` is the last stored slug of the previous page (rows without a stored
 * slug sort first in the index and are only ever consumed by the first page,
 * which never stops inside that run).
 */
export const getPublicSlugsPage = query({
  args: publicCorpusPageArgs,
  handler: async (ctx, args) => {
    const maxItems = clampPublicSlugPageSize(args.limit);
    const cursor = args.cursor;
    const source = cursor
      ? ctx.db.query("substanceIndex").withIndex("by_slug", (q) => q.gt("slug", cursor))
      : ctx.db.query("substanceIndex").withIndex("by_slug");

    const items: string[] = [];
    let bytes = 0;
    let lastStoredSlug: string | undefined;
    let isDone = true;
    for await (const article of source.order("asc")) {
      items.push(resolveSubstanceSlug(article));
      bytes += JSON.stringify(article).length;
      lastStoredSlug = article.slug;
      if (
        lastStoredSlug !== undefined &&
        (items.length >= maxItems || bytes >= PUBLIC_SLUG_PAGE_BYTE_BUDGET)
      ) {
        isDone = false;
        break;
      }
    }

    return {
      items,
      cursor: isDone ? "" : (lastStoredSlug ?? ""),
      isDone,
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

export const getPublicAboutPreviewCandidates = query({
  args: {
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: getPublicAboutPreviewCandidatesHandler,
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

export const getPublicReviewedArticlesPage = query({
  args: { profileKey: v.string(), ...publicCorpusPageArgs },
  handler: async (ctx, args) =>
    getPublicReviewedArticlesPageHandler(ctx, {
      profileKey: args.profileKey,
      cursor: args.cursor,
      numItems: clampPublicCorpusPageSize(args.limit),
    }),
});

export const getPublicReviewedArticleCreditsPage = query({
  args: publicCorpusPageArgs,
  handler: async (ctx, args) =>
    getPublicReviewedArticleCreditsPageHandler(ctx, {
      cursor: args.cursor,
      numItems: clampPublicCorpusPageSize(args.limit),
    }),
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

export const saveSubstance = mutation({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    article: substanceArticleLightValidator,
  },
  handler: saveSubstanceHandler,
});

export const saveSubstances = mutation({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    articles: v.array(substanceArticleLightValidator),
  },
  handler: saveSubstancesHandler,
});

export async function publishReviewedSectionHandler(
  ctx: MutationCtx,
  args: { apiKey?: string; actorEmail: string; proposal: unknown },
) {
  return executePublishReviewedSection(ctx, args);
}

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
  handler: setEditorialReviewHandler,
});

const agentReviewFlagValidator = v.object({
  label: v.string(),
  severity: v.union(v.literal("major"), v.literal("minor"), v.literal("note")),
  note: v.string(),
  section: v.optional(
    v.union(
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
      v.literal("trip-reports"),
      v.literal("legality"),
      v.literal("sources"),
      v.literal("citations"),
      v.literal("editorial-review"),
    ),
  ),
});

export const addHumanReviewFlag = mutation({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    slug: v.string(),
    flag: agentReviewFlagValidator,
  },
  handler: addHumanReviewFlagHandler,
});

export const deleteReviewFlag = mutation({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    slug: v.string(),
    identity: v.object({
      created_at: v.string(),
      label: v.string(),
      source: v.union(v.literal("agent"), v.literal("human")),
    }),
  },
  handler: deleteReviewFlagHandler,
});

export const replaceAgentReviewFlagsForArticle = mutation({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    slug: v.string(),
    runId: v.string(),
    flags: v.array(agentReviewFlagValidator),
  },
  handler: replaceAgentReviewFlagsHandler,
});

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
    expected: v.optional(editableFieldValueValidator),
  },
  handler: setArticleFieldHandler,
});

export const setIupacName = mutation({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    slug: v.string(),
    value: v.string(),
    expected: v.string(),
  },
  handler: setIupacNameHandler,
});

export const appendArticleReference = mutation({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    slug: v.string(),
    reference: v.any(),
  },
  handler: appendArticleReferenceHandler,
});

export const removeArticleReference = mutation({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    slug: v.string(),
    referenceId: v.string(),
  },
  handler: removeArticleReferenceHandler,
});

export const getArticleReferenceProvenanceRepairSnapshot = query({
  args: {
    slug: v.string(),
    referenceId: v.string(),
  },
  handler: getArticleReferenceProvenanceRepairSnapshotHandler,
});

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
  handler: repairArticleReferenceAuthorsHandler,
});

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
  handler: repairArticleReferenceMetadataProvenanceHandler,
});

export const publishReviewedSection = mutation({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.string(),
    proposal: v.any(),
  },
  handler: publishReviewedSectionHandler,
});

export const replaceAllSubstances = internalMutation({
  args: { articles: v.array(substanceArticleLightValidator) },
  handler: async () => {
    throw new ConvexError({
      code: "BULK_REPLACEMENT_RETIRED",
      message: RETIRED_CORPUS_OPERATION_MESSAGE,
    });
  },
});

export const deleteSubstance = mutation({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    id: v.number(),
  },
  handler: deleteSubstanceHandler,
});
