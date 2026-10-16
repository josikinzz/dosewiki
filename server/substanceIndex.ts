import { v } from "../lib/postgres/runtime/values";
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
import { resolveSubstanceSlug } from "../src/data/projections/substanceProjectionCore";
import { getCoverageColumns } from "../src/features/coverage/coverageModel";
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
  approveReviewRecommendationsHandler,
  deleteReviewFlagHandler,
  getPublishedRevisionsHandler,
  getReviewChangesHandler,
  listReviewRecommendationsHandler,
  publishReviewedSectionHandler as executePublishReviewedSection,
  recommendEditorialReviewHandler,
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
import {
  clampPublicCorpusPageSize,
  clampPublicSlugPageSize,
  clampScriptCorpusPageSize,
  projectPublicCoverageRow,
  projectReferenceMetadataArticle,
  publicCorpusPageArgs,
  rejectRetiredBulkReplacement,
  rejectRetiredRandomSample,
  rejectWholeCorpusProjection,
  type CompactPublicSubstanceReader,
} from "./lib/substanceCorpusPages";

export { clampScriptCorpusPageSize, rejectRetiredRandomSample, rejectWholeCorpusProjection } from "./lib/substanceCorpusPages";

export const getAll = query({
  args: {},
  handler: async () => rejectWholeCorpusProjection(),
});

export const getFullDocumentPage = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    return await ctx.db.query("substanceIndex").paginate({
      ...args.paginationOpts,
      numItems: clampScriptCorpusPageSize(args.paginationOpts.numItems),
    });
  },
});

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

export const getEditorAll = query({
  args: {},
  handler: async () => rejectWholeCorpusProjection(),
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

export const getEditorBySlug = query({
  args: {
    slug: v.string(),
    id: v.optional(v.number()),
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
  },
  handler: getEditorSubstanceBySlugHandler,
});

export const getLookup = query({
  args: {},
  handler: async () => rejectWholeCorpusProjection(),
});

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

export const getPublicLookup = query({
  args: {},
  handler: async () => rejectWholeCorpusProjection(),
});

export const getPublicPreviews = query({
  args: {},
  handler: async () => rejectWholeCorpusProjection(),
});

export const getLibraryInput = query({
  args: {},
  handler: async () => rejectWholeCorpusProjection(),
});

export const getPublicLibraryInput = query({
  args: {},
  handler: async () => rejectWholeCorpusProjection(),
});

export const getPublicCoverageInput = query({
  args: {},
  handler: async () => rejectWholeCorpusProjection(),
});

export const getSearchInput = query({
  args: {},
  handler: async () => rejectWholeCorpusProjection(),
});

export const getPublicMechanismRouteInput = query({
  args: {},
  handler: async () => rejectWholeCorpusProjection(),
});

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
    const reader = ctx.db as typeof ctx.db & CompactPublicSubstanceReader;
    const { rows, ...page } = await reader.getPublicSubstanceLibraryInputPage(
      args.cursor,
      clampPublicCorpusPageSize(args.limit),
    );
    return { ...page, items: rows.map(projectLibraryInput) };
  },
});

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

export const getPublicTranslationTextInputPage = query({
  args: publicCorpusPageArgs,
  handler: async (ctx, args) => {
    const result = await ctx.db.query("substanceIndex").paginate({
      cursor: args.cursor ?? null,
      numItems: Math.min(32, clampPublicCorpusPageSize(args.limit)),
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
    const items = rows.map((row) => projectPublicCoverageRow(row, columns));
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
    revision: v.optional(v.string()),
  },
  handler: setEditorialReviewHandler,
});

export const recommendEditorialReview = mutation({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    slug: v.string(),
    revision: v.optional(v.string()),
    note: v.string(),
  },
  handler: recommendEditorialReviewHandler,
});

export const approveReviewRecommendations = mutation({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    items: v.array(v.object({ slug: v.string(), revision: v.string() })),
  },
  handler: approveReviewRecommendationsHandler,
});

export const listReviewRecommendations = query({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
  },
  handler: listReviewRecommendationsHandler,
});

export const getPublishedRevisions = query({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
  },
  handler: getPublishedRevisionsHandler,
});

export const getReviewChanges = query({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    slug: v.string(),
    revision: v.string(),
  },
  handler: getReviewChangesHandler,
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
  v.array(v.string()),
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
  handler: async () => rejectRetiredBulkReplacement(),
});

export const deleteSubstance = mutation({
  args: {
    apiKey: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    id: v.number(),
  },
  handler: deleteSubstanceHandler,
});
