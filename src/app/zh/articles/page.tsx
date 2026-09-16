/**
 * The Simplified Chinese mirror of `/articles`, reached only through the
 * middleware rewrite from `zh.dose.wiki/articles`. Same index component over
 * the localized article records, so each row's title and blurb read in the
 * mirror's language; the mirror carries `noindex` with a canonical link back
 * to the English index.
 */
import { buildPublicPageMetadata } from "@server/next/publicSite";
import { loadArticlesIndexRoute } from "@server/next/routeLoaders.publications";
import { ArticlesIndexPage } from "@/features/articles/pages/ArticlesIndexPage";
import { getCopyByKeys, getCopyKeysByPrefix } from "@server/next/copyBlocks";
import { resolveEmptyStateCopy } from "@server/next/emptyStateCopy";
import { UiLocaleProvider } from "@/i18n/client"
import { setRequestLocale } from "@/i18n/server";
import { LIVE_LOCALES } from "@server/next/localeHostPolicy";

export const revalidate = 3600;

const LOCALE = LIVE_LOCALES["zh.dose.wiki"];
const ARTICLE_EMPTY_COPY_KEYS = getCopyKeysByPrefix("empty-articles-");

export async function generateMetadata() {
  const result = await loadArticlesIndexRoute(LOCALE);

  return buildPublicPageMetadata({
    ...result.metadata,
    route: result.canonicalRoute,
    noIndex: true,
  });
}

export default async function LocalizedArticlesPage() {
  setRequestLocale(LOCALE.code);
  const result = await loadArticlesIndexRoute(LOCALE);
  const emptyState = result.pageProps.emptyState
    ? resolveEmptyStateCopy(await getCopyByKeys(ARTICLE_EMPTY_COPY_KEYS), "articles", result.pageProps.emptyState)
    : undefined;
  return (
    <UiLocaleProvider locale={LOCALE.code}>
      <div lang={LOCALE.htmlLang}>
        <ArticlesIndexPage
          {...result.pageProps}
          emptyState={emptyState}
        />
      </div>
    </UiLocaleProvider>
  );
}
