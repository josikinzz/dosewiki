import { PostgresError, v } from "../lib/postgres/runtime/values";
import { paginationOptsValidator, query, type MutationCtx, type QueryCtx } from "../lib/postgres/runtime/server";
import type { Doc } from "../lib/postgres/runtime/dataModel";
import { mutation, internalMutation } from "./lib/indexedMutation";
import { requireRole } from "./lib/auth";
import { substanceArticleLightValidator } from "./lib/validators";
import {
  projectEditorLibraryEntry,
  projectEditorLookup,
  projectEffectMembershipInput,
  projectLibraryInput,
  projectLookup,
  projectMechanismRouteInput,
  projectPublicArticle,
  projectPublicPreview,
  projectSearchInput,
  projectSubstanceSearchSummary,
} from "../src/data/projections/substanceReadProjections";
import { normalizeSubstancePriority, resolveSubstanceSlug, type SubstanceArticleRecord } from "../src/data/projections/substanceProjectionCore";
import {
  buildCoverageRow,
  getCoverageColumns,
  type CoverageArticleInput,
  type CoverageRow,
} from "../src/features/coverage/coverageModel";
import { normalizePharmacologySection } from "../lib/article/normalization.mjs";
import { EDITORIAL_REVIEW_DEFAULT } from "../src/schema/substance/editorialReviewVisibilityPolicy";
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
  deleteSubstanceHandler,
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
  throw new PostgresError({
    code: "BOUNDED_PAGINATION_REQUIRED",
    message: RETIRED_RANDOM_SAMPLE_MESSAGE,
  });
}

export function rejectWholeCorpusProjection(): never {
  throw new PostgresError({
    code: "BOUNDED_PAGINATION_REQUIRED",
    message: RETIRED_CORPUS_OPERATION_MESSAGE,
  });
}

/**
 * Refuse the retired whole-corpus wire operation. Callers must drain
 * `getFullDocumentPage` or a smaller bounded projection.
 */
export const getAll = query({
  args: {},
  handler: async () => {
    throw new PostgresError({
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
 * Bounded full-document page for trusted offline/admin scripts.
 * Drain this endpoint instead of loading the corpus in one execution.
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
 * Refuse whole-corpus editor reads. Callers drain `getEditorLibraryPage`
 * and hydrate rows with `getEditorBySlug`.
 */
export const getEditorAll = query({
  args: {},
  handler: async () => {
    throw new PostgresError({
      code: "BOUNDED_PAGINATION_REQUIRED",
      message: RETIRED_CORPUS_OPERATION_MESSAGE,
    });
  },
});

type EditorLibraryDatabase = QueryCtx["db"] & {
  getEditorLibraryPage(options: { numItems: number; cursor: string | null }): Promise<{
    page: Array<{ article: Doc<"substanceIndex">; referenceCount: number }>;
    continueCursor: string;
    isDone: boolean;
  }>;
};

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

    const result = await (ctx.db as EditorLibraryDatabase).getEditorLibraryPage({
      ...args.paginationOpts,
      numItems: clampPublicCorpusPageSize(args.paginationOpts.numItems),
    });
    return {
      ...result,
      page: result.page.map(({ article, referenceCount }) =>
        projectEditorLibraryEntry(article, referenceCount)),
    };
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
 * Refuse whole-corpus lookup reads. Editor callers must drain `getLookupPage`.
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
type CompactPublicSubstancePage = {
  rows: SubstanceArticleRecord[];
  cursor: string;
  isDone: boolean;
};
type CompactPublicSubstanceReader = {
  getPublicSubstanceLookupPage: (
    cursor: string | undefined,
    limit: number,
  ) => Promise<CompactPublicSubstancePage>;
  getPublicSubstancePreviewsPage: (
    cursor: string | undefined,
    limit: number,
  ) => Promise<CompactPublicSubstancePage>;
  getPublicSubstanceSlugsPage: (
    cursor: string | undefined,
    limit: number,
  ) => Promise<CompactPublicSubstancePage>;
  getPublicSubstanceSlugsByCandidates: (
    candidates: readonly string[],
  ) => Promise<Doc<"substanceIndex">[]>;
  getPublicSubstanceEffectMembershipPage: (
    cursor: string | undefined,
    limit: number,
  ) => Promise<CompactPublicSubstancePage>;
  getPublicSubstanceCoveragePage: (
    cursor: string | undefined,
    limit: number,
  ) => Promise<CompactPublicSubstancePage>;
  getPublicSubstanceMechanismRows: () => Promise<Doc<"substanceIndex">[]>;
};


/**
 * Bounded native projections avoid loading complete article documents for
 * public lookup, preview, and slug consumers.
 */
export const getPublicLookupPage = query({
  args: publicCorpusPageArgs,
  handler: async (ctx, args) => {
    const reader = ctx.db as typeof ctx.db & CompactPublicSubstanceReader;
    const { rows, ...page } = await reader.getPublicSubstanceLookupPage(
      args.cursor,
      clampPublicCorpusPageSize(args.limit),
    );
    return { ...page, items: rows.map(projectLookup) };
  },
});

export const getPublicPreviewsPage = query({
  args: publicCorpusPageArgs,
  handler: async (ctx, args) => {
    const reader = ctx.db as typeof ctx.db & CompactPublicSubstanceReader;
    const { rows, ...page } = await reader.getPublicSubstancePreviewsPage(
      args.cursor,
      clampPublicCorpusPageSize(args.limit),
    );
    return { ...page, items: rows.map(projectPublicPreview) };
  },
});

/**
 * The same bounded preview page with the raw stored summary preserved, the
 * exact leaf localized search hashes. Full article bodies never cross the
 * read edge here either.
 */
export const getPublicSearchSummariesPage = query({
  args: publicCorpusPageArgs,
  handler: async (ctx, args) => {
    const reader = ctx.db as typeof ctx.db & CompactPublicSubstanceReader;
    const { rows, ...page } = await reader.getPublicSubstancePreviewsPage(
      args.cursor,
      clampPublicCorpusPageSize(args.limit),
    );
    return { ...page, items: rows.map(projectSubstanceSearchSummary) };
  },
});

const PUBLIC_SLUG_PAGE_SIZE = 160;
const PUBLIC_SLUG_PAGE_MAX_SIZE = 400;

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
    const reader = ctx.db as typeof ctx.db & CompactPublicSubstanceReader;
    const { rows, ...page } = await reader.getPublicSubstanceSlugsPage(
      args.cursor,
      clampPublicSlugPageSize(args.limit),
    );
    return { ...page, items: rows.map(resolveSubstanceSlug) };
  },
});

export const getPublicSlugsByCandidates = query({
  args: { candidates: v.array(v.string()) },
  handler: async (ctx, { candidates }) => {
    const unique = [...new Set(candidates.filter(Boolean))];
    if (unique.length === 0) return [];
    const reader = ctx.db as typeof ctx.db & CompactPublicSubstanceReader;
    const candidateSet = new Set(unique);
    return (await reader.getPublicSubstanceSlugsByCandidates(unique))
      .map(resolveSubstanceSlug)
      .filter((slug) => candidateSet.has(slug));
  },
});

export const getPublicLookupBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    if (!slug) return null;
    const reader = ctx.db as typeof ctx.db & CompactPublicSubstanceReader;
    const rows = await reader.getPublicSubstanceSlugsByCandidates([slug]);
    const match = rows.find((row) => resolveSubstanceSlug(row) === slug);
    return match ? { slug, name: match.title } : null;
  },
});

export const getPublicLibraryInputPage = query({
  args: { ...publicCorpusPageArgs, projection: v.optional(v.literal("effect-membership")) },
  handler: async (ctx, args) => {
    if (args.projection === "effect-membership") {
      const reader = ctx.db as typeof ctx.db & CompactPublicSubstanceReader;
      const { rows, ...page } = await reader.getPublicSubstanceEffectMembershipPage(
        args.cursor,
        clampPublicCorpusPageSize(args.limit),
      );
      return { ...page, items: rows.map(projectEffectMembershipInput) };
    }
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

/** Full public text is required by glossary usage, not by coverage counts. */
export const getPublicArticleTextInputPage = query({
  args: publicCorpusPageArgs,
  handler: async (ctx, args) => {
    const result = await ctx.db.query("substanceIndex").paginate({
      cursor: args.cursor ?? null,
      numItems: Math.min(4, clampPublicCorpusPageSize(args.limit)),
    });
    return {
      items: result.page.map(projectPublicArticle),
      cursor: result.continueCursor,
      isDone: result.isDone,
    };
  },
});

export const getPublicCoverageInputPage = query({
  args: publicCorpusPageArgs,
  handler: async (ctx, args) => {
    const reader = ctx.db as typeof ctx.db & CompactPublicSubstanceReader;
    const { rows, ...page } = await reader.getPublicSubstanceCoveragePage(
      args.cursor,
      clampPublicCorpusPageSize(args.limit),
    );
    const columns = getCoverageColumns();
    const items: CoverageRow[] = rows.map((row) => {
      const review = row.editorial_review;
      const expertReviewed =
        typeof review === "object" &&
        review !== null &&
        "status" in review &&
        review.status === "completed";
      const coverageInput: CoverageArticleInput = {
        ...row,
        pharmacology: normalizePharmacologySection(row.pharmacology),
        slug: resolveSubstanceSlug(row),
        priority: normalizeSubstancePriority(row.priority),
        expert_reviewed: expertReviewed,
        editorial_review: row.editorial_review ?? EDITORIAL_REVIEW_DEFAULT,
        references: row.references ?? [],
      };
      return buildCoverageRow(coverageInput, columns);
    });
    return { ...page, items };
  },
});

export const getPublicMechanismRouteInputPage = query({
  args: publicCorpusPageArgs,
  handler: async (ctx) => {
    const reader = ctx.db as typeof ctx.db & CompactPublicSubstanceReader;
    return {
      items: (await reader.getPublicSubstanceMechanismRows()).map(projectMechanismRouteInput),
      cursor: "",
      isDone: true,
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
 * Refuse the retired random-sample wire operation; its unbounded corpus reads
 * are not an allowed fallback for bounded preview queries.
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

/**
 * Kept for the publication rehearsal's refusal check, the admin-floor matrix,
 * and the server-write capability test. The retired HTTP route is not a caller.
 */
export const setArticleField = mutation({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    slug: v.string(),
    path: v.string(),
    value: editableFieldValueValidator,
    expected: editableFieldValueValidator,
    baseHash: v.string(),
    changeId: v.string(),
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
    throw new PostgresError({
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
