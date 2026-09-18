/**
 * The Simplified Chinese mirror of `/articles/[slug]`, reached only through
 * the middleware rewrite from `zh.dose.wiki/articles/<slug>`. Same loader with
 * the localized library article spliced in; the mirror carries `noindex` and
 * a canonical link back to the English article.
 */
import { notFound } from "next/navigation";
import { buildPublicPageMetadata } from "@server/next/publicSite";
import { loadArticleRoute } from "@server/next/routeLoaders.publications";
import { EffectIndexArticlePage } from "@/features/articles/pages/EffectIndexArticlePage";
import { UiLocaleProvider } from "@/i18n/client"
import { setRequestLocale, t } from "@/i18n/server";
import { LIVE_LOCALES } from "@server/next/localeHostPolicy";

export const revalidate = 3600;
export const dynamicParams = true;

export function generateStaticParams() {
  return [];
}

const LOCALE = LIVE_LOCALES["zh.dose.wiki"];

type LocalizedArticlePageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export async function generateMetadata({ params }: LocalizedArticlePageProps) {
  const { slug } = await params;
  const result = await loadArticleRoute(slug, LOCALE);

  if (result.kind === "not-found") {
    notFound();
  }

  return buildPublicPageMetadata({
    ...result.metadata,
    route: result.canonicalRoute,
    noIndex: true,
  });
}

export default async function LocalizedArticlePage({ params }: LocalizedArticlePageProps) {
  setRequestLocale(LOCALE.code);
  const { slug } = await params;
  const result = await loadArticleRoute(slug, LOCALE);

  if (result.kind === "not-found") {
    notFound();
  }

  return (
    <UiLocaleProvider locale={LOCALE.code}>
      <div lang={LOCALE.htmlLang}>
        <EffectIndexArticlePage {...result.pageProps} locale={LOCALE.code} t={t} />
      </div>
    </UiLocaleProvider>
  );
}
