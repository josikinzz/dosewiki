import { PostgresError } from "../../lib/postgres/runtime/values"
import type { MutationCtx, QueryCtx } from "../../lib/postgres/runtime/server"
import {
  requireAdminIntent,
  requireRole,
  requireRegisteredDelegatedEditorWrite,
} from "./auth";
import {
  GeneratedPublicationError,
  publishReviewedSectionTransaction,
  requireGeneratedPublicationDeploymentFingerprint,
  type ReviewedPublicationProposal,
} from "./generatedPublication";
import {
  addHumanReviewFlag as appendHumanReviewFlag,
  assertAgentReviewFlagInput,
  deleteReviewFlagByIdentity,
  preserveEditorialReviewWithFlags,
  replaceAgentReviewFlags,
  type StoredReviewFlag,
} from "./reviewFlags";
import {
  articleAtRevision,
  isArticleRevision,
  journalStoredArticle,
  loadArticle,
  publishedArticleRevision,
} from "./articleRevisionJournal";
import { articleDocument, type ArticleDocument } from "./articleLifecycleValidation";
import { isRecommendationStale, REVIEW_INITIAL_REVISION } from "../../src/schema/substance/editorial";

export type ReviewFlagInput = {
  label: string;
  severity: "major" | "minor" | "note";
  note: string;
  section?:
    | "overview"
    | "classification"
    | "summary"
    | "dosage-duration"
    | "subjective-effects"
    | "reagent-testing"
    | "pharmacology"
    | "interactions"
    | "tolerance"
    | "harm-potential"
    | "history-culture"
    | "trip-reports"
    | "legality"
    | "sources"
    | "citations"
    | "editorial-review";
};

type EditorArgs = { apiKey?: string; actorEmail?: string; slug: string };

async function requireArticle(ctx: MutationCtx, args: EditorArgs) {
  const article = await ctx.db
    .query("substanceIndex")
    .withIndex("by_slug", (query) => query.eq("slug", args.slug))
    .first();
  if (!article) {
    throw new PostgresError({
      code: "ARTICLE_NOT_FOUND",
      message: `No substance found for slug "${args.slug}".`,
    });
  }
  return article;
}

function storedReview(article: { editorial_review?: unknown }): Record<string, unknown> {
  return article.editorial_review && typeof article.editorial_review === "object"
    ? (article.editorial_review as Record<string, unknown>)
    : {};
}

export async function publishReviewedSectionHandler(
  ctx: MutationCtx,
  args: { apiKey?: string; actorEmail: string; proposal: unknown },
) {
  if (!args.actorEmail.trim()) {
    throw new PostgresError({
      code: "INVALID_ACTOR",
      message: "A delegated editor actorEmail is required.",
    });
  }
  if (!args.apiKey?.trim()) {
    throw new PostgresError({
      code: "SCOPED_TOKEN_REQUIRED",
      message: "The generated-publication scoped token is required.",
    });
  }
  try {
    const credential = await requireAdminIntent(args.apiKey, "generatedPublicationWrite");
    if (credential.source !== "scoped") {
      throw new PostgresError({
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
    if (error instanceof PostgresError) throw error;
    if (error instanceof GeneratedPublicationError) {
      throw new PostgresError({
        code: error.code,
        message: error.message,
        ...error.details,
      });
    }
    throw new PostgresError({
      code:
        error instanceof Error && error.name === "AuthError"
          ? "UNAUTHORIZED"
          : "PUBLICATION_FAILED",
      message: error instanceof Error ? error.message : "Generated publication failed.",
    });
  }
}

/**
 * Editors move a review between `needed` and `in_progress` and keep notes and
 * flags; only an admin marks it `completed`, which is the public
 * `expert_reviewed` signal.
 *
 * A sign-off records the published revision it covered. `revision` is the one
 * the reviewer read; it must name a state of this article, and when omitted
 * the current one is recorded. Signing the current revision first journals
 * the stored article if a write bypassed the journal, so the changes since
 * the sign-off can be read later. Any later content write derives `stale`.
 */
export async function setEditorialReviewHandler(
  ctx: MutationCtx,
  args: EditorArgs & { status: "needed" | "in_progress" | "completed"; revision?: string },
) {
  const actor = await requireRole(
    ctx,
    {
      apiKey: args.apiKey,
      actorEmail: args.actorEmail,
      adminIntent: "editorArticleWrite",
    },
    args.status === "completed" ? "admin" : "editor",
  );
  const article = await requireArticle(ctx, args);
  const existing = storedReview(article);
  let reviewedRevision: string | null = null;
  if (args.status === "completed") {
    reviewedRevision = await publishedArticleRevision(ctx, args.slug);
    if (args.revision !== undefined && args.revision !== reviewedRevision) {
      if (!(await isArticleRevision(ctx, args.slug, args.revision))) {
        throw new PostgresError({
          code: "REVIEW_REVISION_UNKNOWN",
          message: "That revision is not a published state of this article. Reload and review again.",
        });
      }
      reviewedRevision = args.revision;
    } else {
      await journalStoredArticle(ctx, args.slug, actor);
    }
  }
  const editorialReview: Record<string, unknown> = {
    status: args.status,
    notes: typeof existing.notes === "string" ? existing.notes : "",
    ...(Array.isArray(existing.flags) ? { flags: existing.flags } : {}),
    // A hold keeps an editor's recommendation waiting for an admin; a
    // sign-off answers it.
    ...(args.status !== "completed" && isStoredRecommendation(existing.recommendation)
      ? { recommendation: existing.recommendation }
      : {}),
    ...(reviewedRevision !== null
      ? {
          reviewed_by: actor.email,
          reviewed_at: new Date(Date.now()).toISOString(),
          reviewed_revision: reviewedRevision,
        }
      : {}),
  };
  await ctx.db.patch(article._id, { editorial_review: editorialReview });
  return { slug: args.slug, editorial_review: editorialReview };
}

type StoredRecommendation = {
  revision: string;
  recommended_by: string;
  recommended_at: string;
  note: string;
};

function isStoredRecommendation(value: unknown): value is StoredRecommendation {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return ["revision", "recommended_by", "recommended_at", "note"].every((key) => typeof record[key] === "string");
}

/** Longest note an editor may attach to a recommendation. */
export const REVIEW_RECOMMENDATION_NOTE_MAX = 1000;

/**
 * An editor recommends an article as reviewed. The recommendation is bound to
 * the published revision the editor read and leaves `status` untouched: it is
 * not a completed review, and only an admin approval turns it into one.
 *
 * `revision` must be the current published revision. One the article has
 * already moved past is refused, so a recommendation never starts out stale.
 */
export async function recommendEditorialReviewHandler(
  ctx: MutationCtx,
  args: EditorArgs & { revision?: string; note: string },
) {
  const actor = await requireRole(ctx, {
    apiKey: args.apiKey,
    actorEmail: args.actorEmail,
    adminIntent: "editorArticleWrite",
  }, "editor");
  const note = args.note.trim();
  if (note.length > REVIEW_RECOMMENDATION_NOTE_MAX) {
    throw new PostgresError({
      code: "INVALID_REVIEW_RECOMMENDATION",
      message: `A recommendation note can be at most ${REVIEW_RECOMMENDATION_NOTE_MAX} characters.`,
    });
  }
  const article = await requireArticle(ctx, args);
  const existing = storedReview(article);
  const published = await publishedArticleRevision(ctx, args.slug);
  if (args.revision !== undefined && args.revision !== published) {
    throw new PostgresError({
      code: "REVIEW_REVISION_OUTDATED",
      message: "This article changed since you loaded it. Reload and review the current version.",
    });
  }
  if (existing.status === "completed" && existing.reviewed_revision === published) {
    throw new PostgresError({
      code: "REVIEW_ALREADY_COMPLETED",
      message: "This article is already reviewed at its current version.",
    });
  }
  await journalStoredArticle(ctx, args.slug, actor);
  const recommendation: StoredRecommendation = {
    revision: published,
    recommended_by: actor.email,
    recommended_at: new Date(Date.now()).toISOString(),
    note,
  };
  const editorialReview = { ...existing, recommendation };
  await ctx.db.patch(article._id, { editorial_review: editorialReview });
  return { slug: args.slug, editorial_review: editorialReview };
}

/** Most recommendations one approval may cover. */
export const REVIEW_RECOMMENDATION_BATCH_MAX = 100;

export type RecommendationApprovalOutcome = {
  /** Signed off at the recommended revision. */
  approved: string[];
  /** The article was published again after the recommendation; re-review first. */
  stale: string[];
  /** No recommendation at that revision any more (withdrawn, replaced or already approved). */
  missing: string[];
};

/**
 * An admin approves editors' recommendations in one write. Each approval
 * writes `completed` with the recommended revision and the approving admin as
 * reviewer. `revision` is the recommendation revision the admin saw; a
 * recommendation that no longer matches it, or whose revision is no longer
 * the published one, is left alone and reported rather than approved.
 */
export async function approveReviewRecommendationsHandler(
  ctx: MutationCtx,
  args: { apiKey?: string; actorEmail?: string; items: Array<{ slug: string; revision: string }> },
): Promise<RecommendationApprovalOutcome> {
  const actor = await requireRole(ctx, {
    apiKey: args.apiKey,
    actorEmail: args.actorEmail,
    adminIntent: "editorArticleWrite",
  }, "admin");
  if (args.items.length === 0 || args.items.length > REVIEW_RECOMMENDATION_BATCH_MAX) {
    throw new PostgresError({
      code: "INVALID_REVIEW_RECOMMENDATION",
      message: `Approve between 1 and ${REVIEW_RECOMMENDATION_BATCH_MAX} recommendations at a time.`,
    });
  }
  const outcome: RecommendationApprovalOutcome = { approved: [], stale: [], missing: [] };
  const seen = new Set<string>();
  const now = new Date(Date.now()).toISOString();
  for (const item of args.items) {
    if (seen.has(item.slug)) continue;
    seen.add(item.slug);
    const article = await requireArticle(ctx, { slug: item.slug });
    const existing = storedReview(article);
    const recommendation = existing.recommendation;
    if (!isStoredRecommendation(recommendation) || recommendation.revision !== item.revision) {
      outcome.missing.push(item.slug);
      continue;
    }
    if (recommendation.revision !== (await publishedArticleRevision(ctx, item.slug))) {
      outcome.stale.push(item.slug);
      continue;
    }
    const { recommendation: _answered, ...rest } = existing;
    const editorialReview: Record<string, unknown> = {
      ...rest,
      status: "completed",
      notes: typeof existing.notes === "string" ? existing.notes : "",
      reviewed_by: actor.email,
      reviewed_at: now,
      reviewed_revision: recommendation.revision,
    };
    await ctx.db.patch(article._id, { editorial_review: editorialReview });
    outcome.approved.push(item.slug);
  }
  return outcome;
}

export type ReviewRecommendationRow = StoredRecommendation & {
  slug: string;
  title: string;
  /** The article's current published revision. */
  publishedRevision: string;
  /** Published again since the recommendation, so it needs re-review. */
  stale: boolean;
};

type ReviewRecommendationDatabase = QueryCtx["db"] & {
  getReviewRecommendationRows(): Promise<Array<{
    slug: string;
    title: string;
    status: string | null;
    reviewedRevision: string | null;
    recommendation: unknown;
  }>>;
  getPublishedArticleRevisions(): Promise<Array<{ slug: string; revision: string }>>;
};

/**
 * Every pending recommendation with whether it is stale, oldest first, for
 * the admin's Review recommendations lane.
 */
export async function listReviewRecommendationsHandler(
  ctx: QueryCtx,
  args: { apiKey?: string; actorEmail?: string },
): Promise<ReviewRecommendationRow[]> {
  await requireRole(ctx, {
    apiKey: args.apiKey,
    actorEmail: args.actorEmail,
    adminIntent: "editorArticleWrite",
  }, "admin");
  const db = ctx.db as ReviewRecommendationDatabase;
  const [rows, revisions] = await Promise.all([db.getReviewRecommendationRows(), db.getPublishedArticleRevisions()]);
  const published = new Map(revisions.map(({ slug, revision }) => [slug, revision]));
  return rows
    .flatMap((row) => {
      if (!isStoredRecommendation(row.recommendation)) return [];
      const publishedRevision = published.get(row.slug) ?? REVIEW_INITIAL_REVISION;
      return [{
        ...row.recommendation,
        slug: row.slug,
        title: row.title,
        publishedRevision,
        stale: isRecommendationStale(row.recommendation, publishedRevision),
      }];
    })
    .sort((a, b) => a.recommended_at.localeCompare(b.recommended_at));
}

export async function addHumanReviewFlagHandler(
  ctx: MutationCtx,
  args: EditorArgs & { flag: ReviewFlagInput },
) {
  const actor = await requireRole(ctx, {
    apiKey: args.apiKey,
    actorEmail: args.actorEmail,
    adminIntent: "editorArticleWrite",
  }, "editor");
  try {
    assertAgentReviewFlagInput(args.flag);
  } catch (error) {
    throw new PostgresError({
      code: "INVALID_REVIEW_FLAG",
      message: error instanceof Error ? error.message : "Invalid Review Flag.",
    });
  }
  const article = await requireArticle(ctx, args);
  const existing = storedReview(article);
  const flags = appendHumanReviewFlag(
    Array.isArray(existing.flags) ? (existing.flags as StoredReviewFlag[]) : [],
    args.flag,
    new Date().toISOString(),
    actor.email,
  );
  await ctx.db.patch(article._id, {
    editorial_review: preserveEditorialReviewWithFlags(existing, flags),
  });
  return { slug: args.slug, flags };
}

export async function deleteReviewFlagHandler(
  ctx: MutationCtx,
  args: EditorArgs & {
    identity: { created_at: string; label: string; source: "agent" | "human" };
  },
) {
  await requireRole(ctx, {
    apiKey: args.apiKey,
    actorEmail: args.actorEmail,
    adminIntent: "editorArticleWrite",
  }, "editor");
  const article = await requireArticle(ctx, args);
  const existing = storedReview(article);
  let flags: StoredReviewFlag[];
  try {
    flags = deleteReviewFlagByIdentity(
      Array.isArray(existing.flags) ? (existing.flags as StoredReviewFlag[]) : [],
      args.identity,
    );
  } catch {
    throw new PostgresError({
      code: "FLAG_NOT_FOUND",
      message: "That Review Flag no longer exists.",
    });
  }
  await ctx.db.patch(article._id, {
    editorial_review: preserveEditorialReviewWithFlags(existing, flags),
  });
  return { slug: args.slug, flags };
}

export async function replaceAgentReviewFlagsHandler(
  ctx: MutationCtx,
  args: EditorArgs & { runId: string; flags: ReviewFlagInput[] },
) {
  await requireRole(ctx, {
    apiKey: args.apiKey,
    actorEmail: args.actorEmail,
    adminIntent: "editorArticleWrite",
  }, "editor");
  if (!args.runId.trim()) {
    throw new PostgresError({ code: "INVALID_REVIEW_RUN", message: "Review Run id is required." });
  }
  for (const flag of args.flags) {
    try {
      assertAgentReviewFlagInput(flag);
    } catch (error) {
      throw new PostgresError({
        code: "INVALID_REVIEW_FLAG",
        message: error instanceof Error ? error.message : "Invalid Review Flag.",
      });
    }
  }
  const article = await requireArticle(ctx, args);
  const existing = storedReview(article);
  const existingFlags = Array.isArray(existing.flags)
    ? (existing.flags as StoredReviewFlag[])
    : [];
  const flags = replaceAgentReviewFlags(
    existingFlags,
    args.flags,
    args.runId,
    new Date().toISOString(),
  );
  await ctx.db.patch(article._id, { editorial_review: { ...existing, flags } });
  return { slug: args.slug, flags };
}

type ReviewRevisionDatabase = QueryCtx["db"] & {
  getPublishedArticleRevisions(): Promise<Array<{ slug: string; revision: string }>>;
};

/**
 * Every article's current published revision, keyed by slug, so /review can
 * derive `stale` for each sign-off. Derived from stored content, so every
 * article is present.
 */
export async function getPublishedRevisionsHandler(
  ctx: QueryCtx,
  args: { apiKey?: string; actorEmail?: string },
) {
  await requireRole(ctx, {
    apiKey: args.apiKey,
    actorEmail: args.actorEmail,
    adminIntent: "editorArticleWrite",
  }, "editor");
  const rows = await (ctx.db as ReviewRevisionDatabase).getPublishedArticleRevisions();
  return Object.fromEntries(rows.map(({ slug, revision }) => [slug, revision]));
}

/** The review-irrelevant record is dropped so the comparison is content only. */
function withoutEditorialReview(article: ArticleDocument): ArticleDocument {
  const { editorial_review: _review, ...content } = article;
  return content as ArticleDocument;
}

/**
 * What changed since a sign-off: the article at the signed revision and the
 * article as published now, both without their review record. `signed` is null
 * when the revision is not a published state of this article.
 */
export async function getReviewChangesHandler(
  ctx: QueryCtx,
  args: { apiKey?: string; actorEmail?: string; slug: string; revision: string },
) {
  await requireRole(ctx, {
    apiKey: args.apiKey,
    actorEmail: args.actorEmail,
    adminIntent: "editorArticleWrite",
  }, "editor");
  const current = articleDocument(await loadArticle(ctx, args.slug));
  const signed = await articleAtRevision(ctx, args.slug, args.revision, current);
  return {
    slug: args.slug,
    revision: args.revision,
    publishedRevision: await publishedArticleRevision(ctx, args.slug),
    signed: signed ? withoutEditorialReview(signed) : null,
    current: withoutEditorialReview(current),
  };
}
