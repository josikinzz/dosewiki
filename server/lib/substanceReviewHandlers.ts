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
  loadArticle,
  publishedArticleRevision,
} from "./articleRevisionJournal";
import { articleDocument, type ArticleDocument } from "./articleLifecycleValidation";

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
 * the reviewer read; it must name a published state of this article, and when
 * omitted the current one is recorded. A later publish then derives `stale`.
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
    }
  }
  const editorialReview: Record<string, unknown> = {
    status: args.status,
    notes: typeof existing.notes === "string" ? existing.notes : "",
    ...(Array.isArray(existing.flags) ? { flags: existing.flags } : {}),
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
 * derive `stale` for each sign-off. Articles with no recorded revision are
 * absent and read as `REVIEW_INITIAL_REVISION`.
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
