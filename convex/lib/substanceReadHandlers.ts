import type { QueryCtx } from "../_generated/server";
import { requireEditorWrite } from "./auth";
import { contributorReviewerEmails, normalizeProfileKey } from "./contributorProfiles";
import {
  projectEditorArticle,
  projectPublicArticle,
  projectReviewedArticleForEmails,
} from "./substanceReadProjections";

export async function getSubstanceByIdHandler(ctx: QueryCtx, args: { id: number }) {
  return await ctx.db
    .query("substanceIndex")
    .withIndex("by_article_id", (query) => query.eq("id", args.id))
    .first();
}

export async function getSubstanceByTitleHandler(ctx: QueryCtx, args: { title: string }) {
  return await ctx.db
    .query("substanceIndex")
    .withIndex("by_title", (query) => query.eq("title", args.title))
    .first();
}

export async function getEditorSubstanceBySlugHandler(
  ctx: QueryCtx,
  args: { slug: string; id?: number; apiKey?: string; actorEmail?: string },
) {
  await requireEditorWrite(ctx, {
    apiKey: args.apiKey,
    actorEmail: args.actorEmail,
    adminIntent: "editorArticleWrite",
  });
  const matches = await ctx.db
    .query("substanceIndex")
    .withIndex("by_slug", (query) => query.eq("slug", args.slug))
    .take(2);
  if (matches.length === 1) return projectEditorArticle(matches[0]);
  if (args.id === undefined) return null;
  const byId = await ctx.db
    .query("substanceIndex")
    .withIndex("by_article_id", (query) => query.eq("id", args.id))
    .first();
  return byId ? projectEditorArticle(byId) : null;
}

const ABOUT_PREVIEW_CANDIDATE_PAGE_SIZE = 64;

export async function getPublicAboutPreviewCandidatesHandler(
  ctx: QueryCtx,
  args: { cursor?: string; limit?: number },
) {
  const requestedLimit = Math.floor(args.limit ?? ABOUT_PREVIEW_CANDIDATE_PAGE_SIZE);
  const limit = Math.min(Math.max(requestedLimit, 1), ABOUT_PREVIEW_CANDIDATE_PAGE_SIZE);
  const articles = await ctx.db
    .query("substanceIndex")
    .paginate({ cursor: args.cursor ?? null, numItems: limit });
  return {
    items: articles.page.map(projectPublicArticle),
    cursor: articles.continueCursor,
    isDone: articles.isDone,
  };
}

export async function getPublicReviewedArticlesPageHandler(
  ctx: QueryCtx,
  args: { profileKey: string; cursor?: string; numItems: number },
) {
  const key = normalizeProfileKey(args.profileKey);
  const profile = key
    ? await ctx.db
        .query("contributorProfiles")
        .withIndex("by_key", (query) => query.eq("key", key))
        .first()
    : null;
  const reviewerEmails = profile ? contributorReviewerEmails(profile) : null;
  if (!reviewerEmails || reviewerEmails.size === 0) {
    return { items: [], cursor: "", isDone: true };
  }
  const result = await ctx.db.query("substanceIndex").paginate({
    cursor: args.cursor ?? null,
    numItems: args.numItems,
  });
  const items = [];
  for (const article of result.page) {
    const reviewed = projectReviewedArticleForEmails(article, reviewerEmails);
    if (reviewed) items.push(reviewed);
  }
  return {
    items,
    cursor: result.continueCursor,
    isDone: result.isDone,
  };
}
