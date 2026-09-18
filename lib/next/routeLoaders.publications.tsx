import { msg } from "../../src/i18n/messages";
import "server-only";

import { cache } from "react";
import {
  getPublishedPublicationIndex,
  getPublicEffectIndexArticleBySlug,
  getPublicEffectIndexPostBySlug,
  getPublicEffectIndexPosts,
  type PublicEffectIndexArticle,
} from "@server/data/publicData";
import { getPublicContributorIdentitiesByLookupKeys } from "../data/publicData.contributors";
import type { ArticleIndexEntry } from "../../src/features/articles/domain/articlesIndex";
import { getLocalizedPublicArticleBySlug, getLocalizedPublicArticles } from "@server/translation/localizedRecords";
import type { LiveLocale } from "@server/next/localeHostPolicy";
import { buildBlogPostExcerpt, toBlogPostViewModel, type BlogPostViewModel } from "../../src/features/blog/domain/blogPostModel";
import { toWritingBlogPost, toWritingBlogIndexPost, writingBlogPostSummary, type WritingBlogPost, type WritingBlogIndexPost } from "../../src/features/blog/domain/writingBlogModel";
import { SITE_FLAVOR_CONFIG } from "../../src/config/siteFlavor";
import type { ArticleBylineAuthor } from "../../src/features/articles/domain/articleByline";
import { findContributorProfileByKeyOrAlias, normalizeProfileKey } from "../contributorProfileIdentity";
import { articlesIndexEmptyState, blogIndexEmptyState, type PublicRouteEmptyState } from "./publicRouteOutcomes";
import { getPublicRoutePath } from "./publicSite";
import type { NotFoundRouteResult, OkRouteResult } from "./routeLoaderResults";

export type ArticleRouteResult =
  | OkRouteResult<{
      article: PublicEffectIndexArticle;
      bylineAuthors: ArticleBylineAuthor[];
    }>
  | NotFoundRouteResult;

/**
 * Bylines render from `authorProfileKeys`, never from `authors`: the legacy
 * import left `authors` as raw Mongo ObjectIds, and "by 60542430198361300fea3610"
 * is worse than no byline at all. A key that no contributor profile claims is
 * dropped for the same reason, so an unbackfilled article shows no byline
 * exactly as it does today.
 */
async function resolveArticleBylineAuthors(
  article: Pick<PublicEffectIndexArticle, "authorProfileKeys">,
): Promise<ArticleBylineAuthor[]> {
  const keys = article.authorProfileKeys ?? [];

  if (keys.length === 0) {
    return [];
  }

  const profiles = await getPublicContributorIdentitiesByLookupKeys(keys);
  const seen = new Set<string>();
  const authors: ArticleBylineAuthor[] = [];

  for (const rawKey of keys) {
    const profile = findContributorProfileByKeyOrAlias(profiles, normalizeProfileKey(rawKey));

    if (!profile || seen.has(profile.key)) {
      continue;
    }

    seen.add(profile.key);
    authors.push({
      key: profile.key,
      name: profile.displayName,
      href: getPublicRoutePath({ family: "contributor", params: { profileKey: profile.key } }),
      ...(profile.avatarUrl ? { avatarSrc: profile.avatarUrl } : {}),
    });
  }

  return authors;
}

/**
 * `effectIndexArticles` holds both families. A row is an article unless it says
 * otherwise, which is what keeps every legacy import — none of which carries
 * `kind` — on the article routes exactly as before.
 */
function isArticleKind(article: Pick<PublicEffectIndexArticle, "kind">): boolean {
  return article.kind !== "blog";
}

function isBlogKind(article: Pick<PublicEffectIndexArticle, "kind">): boolean {
  return article.kind === "blog";
}

export const loadArticleRoute = cache(async (slug: string, locale: LiveLocale | null = null): Promise<ArticleRouteResult> => {
  const article = locale
    ? await getLocalizedPublicArticleBySlug(slug, locale.code)
    : await getPublicEffectIndexArticleBySlug(slug);

  // A blog post is not reachable at `/articles/<slug>` even though it shares
  // the table: the two families never render on each other's routes.
  if (!article || !isArticleKind(article)) {
    return { kind: "not-found" };
  }

  const bylineAuthors = await resolveArticleBylineAuthors(article);

  return {
    kind: "ok",
    pageProps: { article, bylineAuthors },
    metadata: {
      title: article.title,
      description:
        article.shortDescription?.trim() || `${article.title} Effect Index article.`,
      noIndex: article.publication_status !== "published",
    },
    canonicalRoute: { family: "article", params: { slug } },
  };
});

export type ArticlesIndexRouteResult = OkRouteResult<{
  articles: ArticleIndexEntry[];
  emptyState?: PublicRouteEmptyState;
}>;

export const loadArticlesIndexRoute = cache(
  async (locale: LiveLocale | null = null): Promise<ArticlesIndexRouteResult> => {
    const published = locale
      ? await getLocalizedPublicArticles(locale.code)
      : await getPublishedPublicationIndex("article");
    const articles = published.filter(isArticleKind);

    return {
      kind: "ok",
      pageProps: {
        articles,
        emptyState:
          articles.length === 0 ? articlesIndexEmptyState : undefined,
      },
      metadata: {
        title: msg("Articles"),
        description: `Browse ${articles.length} published Effect Index articles in ${SITE_FLAVOR_CONFIG.name}.`,
      },
      canonicalRoute: { family: "articles" },
    };
  },
);

export type BlogIndexRouteResult = OkRouteResult<{
  posts: BlogPostViewModel[];
  emptyState?: PublicRouteEmptyState;
}>;

/**
 * The archived Effect Index blog. Only routed on the Effect Index flavor — the pages
 * themselves call `requireEffectIndexFlavor()` before reaching these loaders.
 */
export const loadBlogIndexRoute = cache(async (): Promise<BlogIndexRouteResult> => {
  const posts = (await getPublicEffectIndexPosts()).map(toBlogPostViewModel);

  return {
    kind: "ok",
    pageProps: {
      posts,
      emptyState: posts.length === 0 ? blogIndexEmptyState : undefined,
    },
    metadata: {
      title: "Blog",
      description: `Announcements and site updates from the ${SITE_FLAVOR_CONFIG.name} archive.`,
    },
    canonicalRoute: { family: "blog" },
  };
});

export type BlogPostRouteResult =
  | OkRouteResult<{ post: BlogPostViewModel }>
  | NotFoundRouteResult;

export const loadBlogPostRoute = cache(async (slug: string): Promise<BlogPostRouteResult> => {
  const post = await getPublicEffectIndexPostBySlug(slug);

  if (!post) {
    return { kind: "not-found" };
  }

  const viewModel = toBlogPostViewModel(post);

  return {
    kind: "ok",
    pageProps: { post: viewModel },
    metadata: {
      title: viewModel.title,
      description:
        buildBlogPostExcerpt(viewModel.body, 160) ||
        `${viewModel.title} — a post from the ${SITE_FLAVOR_CONFIG.name} archive.`,
    },
    canonicalRoute: { family: "blogPost", params: { slug: viewModel.slug } },
  };
});

export type WritingBlogIndexRouteResult = OkRouteResult<{
  posts: WritingBlogIndexPost[];
  emptyState?: PublicRouteEmptyState;
}>;

/**
 * The dose.wiki blog: `kind: "blog"` rows of `effectIndexArticles`, written in
 * the /dev Blog tab.
 *
 * This is a different blog from `loadBlogIndexRoute`, which serves the frozen
 * Effect Index archive out of `effectIndexArchive`. The separation is by data as
 * well as by flavor — these loaders read only rows that say `kind: "blog"`, and
 * no such row exists in the archive table, so neither corpus can leak into the
 * other's pages even if both routes were somehow reachable on one build.
 */
export const loadWritingBlogIndexRoute = cache(
  async (): Promise<WritingBlogIndexRouteResult> => {
    const rows = await getPublishedPublicationIndex("blog");
    const posts = rows.map((row) => toWritingBlogIndexPost(row));

    return {
      kind: "ok",
      pageProps: {
        posts,
        emptyState: posts.length === 0 ? blogIndexEmptyState : undefined,
      },
      metadata: {
        title: "Blog",
        description: `News, notes and long-form writing from ${SITE_FLAVOR_CONFIG.name}.`,
      },
      canonicalRoute: { family: "blog" },
    };
  },
);

export type WritingBlogPostRouteResult =
  | OkRouteResult<{ post: WritingBlogPost }>
  | NotFoundRouteResult;

export const loadWritingBlogPostRoute = cache(
  async (slug: string): Promise<WritingBlogPostRouteResult> => {
    const row = await getPublicEffectIndexArticleBySlug(slug);

    if (!row || !isBlogKind(row)) {
      return { kind: "not-found" };
    }

    const post = toWritingBlogPost(row, await resolveArticleBylineAuthors(row));

    return {
      kind: "ok",
      pageProps: { post },
      metadata: {
        title: post.title,
        description:
          writingBlogPostSummary(post, 160) ||
          `${post.title} — a post from ${SITE_FLAVOR_CONFIG.name}.`,
      },
      canonicalRoute: { family: "blogPost", params: { slug: post.slug } },
    };
  },
);
