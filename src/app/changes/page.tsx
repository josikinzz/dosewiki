import { getPublicContributorDirectory } from "@server/data/publicData";
import {
  getPublicArticleHistory,
  getPublicRecentChanges,
  PUBLIC_CHANGES_PAGE_LIMIT,
} from "@server/data/publicData.changelog";
import { getPublicSubstanceLookupBySlug } from "@server/data/publicData.substances";
import { buildPublicPageMetadata } from "@server/next/publicSite";
import { ChangesPage } from "@/components/pages/ChangesPage";

// The list reads through the shared 15-minute Postgres cache; the article filter
// is a query string, so the page itself renders per request.
export const dynamic = "force-dynamic";

type ChangesRouteProps = {
  searchParams: Promise<{ article?: string | string[] }>;
};

async function resolveArticle(searchParams: ChangesRouteProps["searchParams"]) {
  const { article } = await searchParams;
  const slug = (Array.isArray(article) ? article[0] : article)?.trim().toLowerCase() ?? "";
  if (!slug) return null;
  const substance = await getPublicSubstanceLookupBySlug(slug);
  return substance ? { slug: substance.slug, title: substance.name } : null;
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
  const directory = getPublicContributorDirectory();
  const article = await resolveArticle(searchParams);
  const changes = await (article
    ? getPublicArticleHistory(article.slug, directory, PUBLIC_CHANGES_PAGE_LIMIT)
    : getPublicRecentChanges(directory));

  return <ChangesPage changes={changes} article={article} />;
}
