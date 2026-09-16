import type { QueryCtx } from "../../lib/postgres/runtime/server"
import { requireRole } from "./auth";
import { contributorReviewerEmails, normalizeProfileKey } from "./contributorProfiles";
import {
  projectEditorArticle,
  projectPublicArticle,
  projectReviewedArticleCredit,
  projectReviewedArticleForEmails,
} from "../../src/data/projections/substanceReadProjections";
import { publicReadIndexReady } from "./publicReadIndexes";
import { reviewedArticlesPage, REVIEWED_ARTICLES_CURSOR_PREFIX } from "./reviewedArticleIndexReads";

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
  await requireRole(ctx, {
    apiKey: args.apiKey,
    actorEmail: args.actorEmail,
    adminIntent: "editorArticleWrite",
  }, "editor");
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
  if (args.cursor) {
    return { items: [], cursor: args.cursor, isDone: true };
  }
  const requestedLimit = Math.floor(args.limit ?? ABOUT_PREVIEW_CANDIDATE_PAGE_SIZE);
  const limit = Math.min(Math.max(requestedLimit, 1), 12);
  const db = ctx.db as typeof ctx.db & {
    getPublicAboutPreviewRows: (limit: number) => Promise<Array<Parameters<typeof projectPublicArticle>[0]>>;
  };
  const articles = await db.getPublicAboutPreviewRows(limit);
  return {
    items: articles.map(projectPublicArticle),
    cursor: "",
    isDone: true,
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
  // A cursor issued by the legacy source pager finishes on that pager even
  // when readiness changes between requests. Fresh reads use only the index.
  if ((!args.cursor || args.cursor.startsWith(REVIEWED_ARTICLES_CURSOR_PREFIX))
    && await publicReadIndexReady(ctx, "reviews")) {
    return reviewedArticlesPage(ctx, reviewerEmails, args);
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

/**
 * One page of public-safe review credits across the whole corpus: which
 * contributor profile completed the expert review of which article. This is
 * the bulk counterpart of `getPublicReviewedArticlesPageHandler` above — one
 * corpus pass answers "who reviewed what" for *every* profile at once, which
 * is what the About roster's reference counting needs, where the per-profile
 * read would cost a full corpus scan per contributor.
 *
 * The email→profile index is rebuilt from the (small) profile table on each
 * page call; a stored email claimed by two profiles goes to the earlier row,
 * and the counting side re-resolves the returned keys alias-aware anyway, so
 * a legacy shadow profile converges on the canonical one. Reviewer emails are
 * matched here and discarded: only slug + profile key leave the deployment.
 */
export async function getPublicReviewedArticleCreditsPageHandler(
  ctx: QueryCtx,
  args: { cursor?: string; numItems: number },
) {
  const profiles = await ctx.db.query("contributorProfiles").collect();
  const emailToProfileKey = new Map<string, string>();
  for (const profile of profiles) {
    for (const email of contributorReviewerEmails(profile)) {
      if (!emailToProfileKey.has(email)) {
        emailToProfileKey.set(email, profile.key);
      }
    }
  }
  const prefix = "review-credits-v1:";
  if ((!args.cursor || args.cursor.startsWith(prefix)) && await publicReadIndexReady(ctx, "reviews")) {
    const result = await ctx.db.query("reviewedArticles").paginate({
      cursor: args.cursor ? args.cursor.slice(prefix.length) : null,
      numItems: args.numItems,
    });
    return {
      items: result.page.flatMap((row) => {
        const profileKey = emailToProfileKey.get(row.reviewer_email);
        return profileKey ? [{ slug: row.slug, profileKey }] : [];
      }),
      cursor: prefix + result.continueCursor,
      isDone: result.isDone,
    };
  }
  const result = await ctx.db.query("substanceIndex").paginate({
    cursor: args.cursor ?? null,
    numItems: args.numItems,
  });
  const items = [];
  for (const article of result.page) {
    const credit = projectReviewedArticleCredit(article, emailToProfileKey);
    if (credit) items.push(credit);
  }
  return {
    items,
    cursor: result.continueCursor,
    isDone: result.isDone,
  };
}
