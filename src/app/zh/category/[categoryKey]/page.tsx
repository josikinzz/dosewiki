/**
 * The Simplified Chinese mirror of `/category/[categoryKey]`, reached only
 * through the middleware rewrite from `zh.dose.wiki/category/<key>`. It reuses
 * the English route loader with localized effect records and keeps the English
 * route as its canonical URL.
 */
import { notFound, redirect } from "next/navigation";

import { CategoryPage as CategoryDetailPage } from "@/components/pages/CategoryPage";
import { UiLocaleProvider } from "@/i18n/client"
import { setRequestLocale, t } from "@/i18n/server";
import { buildPublicPageMetadata } from "@server/next/publicSite";
import { buildCategoryItemListSchema } from "@server/next/taxonomyItemListSchema";
import { LIVE_LOCALES } from "@server/next/localeHostPolicy";
import { loadCategoryRoute, loadCategoryMetadataRoute } from "@server/next/routeLoaders.taxonomy";
import { serializeJsonLd } from "@/utils/seo/structuredData";

export const revalidate = 3600;
export const dynamicParams = true;

export function generateStaticParams() {
  return [];
}

const LOCALE = LIVE_LOCALES["zh.dose.wiki"];

type LocalizedCategoryPageProps = {
  params: Promise<{
    categoryKey: string;
  }>;
};

export async function generateMetadata({ params }: LocalizedCategoryPageProps) {
  setRequestLocale(LOCALE.code);
  const { categoryKey } = await params;
  const result = await loadCategoryMetadataRoute(categoryKey);

  if (result.kind === "redirect") {
    redirect(result.target);
  }
  if (result.kind === "not-found") {
    notFound();
  }

  return buildPublicPageMetadata({
    title: result.metadata.title,
    description: t(result.metadata.description),
    route: result.canonicalRoute,
    noIndex: true,
  });
}

export default async function LocalizedCategoryPage({ params }: LocalizedCategoryPageProps) {
  setRequestLocale(LOCALE.code);
  const { categoryKey } = await params;
  const result = await loadCategoryRoute(categoryKey, LOCALE);

  if (result.kind === "redirect") {
    redirect(result.target);
  }
  if (result.kind !== "ok") {
    notFound();
  }

  const itemListJsonLd = serializeJsonLd(
    buildCategoryItemListSchema(result.detail, result.canonicalRoute),
  );

  return (
    <UiLocaleProvider locale={LOCALE.code}>
      <div lang={LOCALE.htmlLang}>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: itemListJsonLd }}
        />
        <CategoryDetailPage
          detail={result.detail}
          effects={result.effects}
          artistCreditLinks={result.artistCreditLinks}
          drugHrefPrefix="/"
        />
      </div>
    </UiLocaleProvider>
  );
}
