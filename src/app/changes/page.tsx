import { getPublicContributorDirectory } from "@server/data/publicData";
import {
  getPublicArticleHistory,
  getPublicRecentChanges,
  PUBLIC_CHANGES_PAGE_LIMIT,
} from "@server/data/publicData.changelog";
import { resolveChangeHistoryTarget, type ChangeHistorySearchParams } from "@server/next/changeHistoryTarget";
import { buildPublicPageMetadata } from "@server/next/publicSite";
import { ChangesPage } from "@/components/pages/ChangesPage";

export const dynamic = "force-dynamic";

type ChangesRouteProps = {
  searchParams: ChangeHistorySearchParams;
};

export async function generateMetadata({ searchParams }: ChangesRouteProps) {
  const article = await resolveChangeHistoryTarget(searchParams);
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
  const article = await resolveChangeHistoryTarget(searchParams);
  const changes = await (article
    ? getPublicArticleHistory(article.slug, directory, PUBLIC_CHANGES_PAGE_LIMIT)
    : getPublicRecentChanges(directory));

  return <ChangesPage changes={changes} article={article} />;
}
