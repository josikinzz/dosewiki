import { getPublicContributorDirectory } from "@server/convex/publicData";
import {
  getPublicArticleHistory,
  getPublicRecentChanges,
  PUBLIC_CHANGES_PAGE_LIMIT,
} from "@server/convex/publicData.changelog";
import { getPublicSubstanceBySlug } from "@server/convex/publicData.substances";
import { buildPublicPageMetadata } from "@server/next/publicSite";
import { ChangesPage } from "@/components/pages/ChangesPage";

// The list reads through the shared 15-minute Convex cache; the article filter
// is a query string, so the page itself renders per request.
export const dynamic = "force-dynamic";

type ChangesRouteProps = {
  searchParams: Promise<{ article?: string | string[] }>;
};

async function resolveArticle(searchParams: ChangesRouteProps["searchParams"]) {
  const { article } = await searchParams;
  const slug = (Array.isArray(article) ? article[0] : article)?.trim().toLowerCase() ?? "";
  if (!slug) return null;
  const substance = await getPublicSubstanceBySlug(slug);
  return substance ? { slug, title: substance.title } : null;
}

export async function generateMetadata({ searchParams }: ChangesRouteProps) {
  const article = await resolveArticle(searchParams);
  return buildPublicPageMetadata({
    title: article ? `Changes to ${article.title}` : "Recent changes",
    description: article
      ? `Every human edit to the ${article.title} article, newest first.`
      : "Every human edit to a dose.wiki article, newest first.",
    pathname: article ? `/changes?article=${encodeURIComponent(article.slug)}` : "/changes",
    noIndex: article !== null,
  });
}

export default async function ChangesRoute({ searchParams }: ChangesRouteProps) {
  const [article, directory] = await Promise.all([
    resolveArticle(searchParams),
    getPublicContributorDirectory(),
  ]);
  const changes = article
    ? await getPublicArticleHistory(article.slug, directory, PUBLIC_CHANGES_PAGE_LIMIT)
    : await getPublicRecentChanges(directory);

  return <ChangesPage changes={changes} article={article} />;
}
