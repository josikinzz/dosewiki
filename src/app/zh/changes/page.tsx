import { ChangesPage } from "@/components/pages/ChangesPage";
import { UiLocaleProvider } from "@/i18n/client"
import { setRequestLocale, t } from "@/i18n/server";
import { getPublicContributorDirectory } from "@server/convex/publicData";
import {
  getPublicArticleHistory,
  getPublicRecentChanges,
  PUBLIC_CHANGES_PAGE_LIMIT,
} from "@server/convex/publicData.changelog";
import { getPublicSubstanceBySlug } from "@server/convex/publicData.substances";
import { LIVE_LOCALES } from "@server/next/localeHostPolicy";
import { buildPublicPageMetadata } from "@server/next/publicSite";

export const dynamic = "force-dynamic";

const LOCALE = LIVE_LOCALES["zh.dose.wiki"];

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
  setRequestLocale(LOCALE.code);
  const article = await resolveArticle(searchParams);
  return buildPublicPageMetadata({
    title: article ? t("Changes to {{name}}", { name: article.title }) : t("Recent changes"),
    description: article
      ? t("Every human edit to the {{name}} article, newest first.", { name: article.title })
      : t("Every human edit to a dose.wiki article, newest first."),
    pathname: article ? `/changes?article=${encodeURIComponent(article.slug)}` : "/changes",
    noIndex: true,
  });
}

export default async function ChangesRoute({ searchParams }: ChangesRouteProps) {
  setRequestLocale(LOCALE.code);
  const [article, directory] = await Promise.all([
    resolveArticle(searchParams),
    getPublicContributorDirectory(),
  ]);
  const changes = article
    ? await getPublicArticleHistory(article.slug, directory, PUBLIC_CHANGES_PAGE_LIMIT)
    : await getPublicRecentChanges(directory);

  return (
    <UiLocaleProvider locale={LOCALE.code}>
      <div lang={LOCALE.htmlLang}>
        <ChangesPage changes={changes} article={article} />
      </div>
    </UiLocaleProvider>
  );
}
