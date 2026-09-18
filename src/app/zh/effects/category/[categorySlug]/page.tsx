import { notFound, redirect } from "next/navigation";

import { UiLocaleProvider } from "@/i18n/client"
import { setRequestLocale, t } from "@/i18n/server";
import { getEffectCategoryDefinition } from "@/data/effectCategoryDefinitions";
import { EffectCategoryPage as EffectCategoryDetailPage } from "@/features/effects/pages/EffectCategoryPage";
import { LIVE_LOCALES } from "@server/next/localeHostPolicy";
import { buildPublicPageMetadata } from "@server/next/publicSite";
import {
  effectCategoryRouteDescriptor,
  loadEffectCategoryRoute,
  loadTaxonomyStaticParams,
} from "@server/next/routeLoaders.taxonomy";
import { getCopyByKeys, getCopyKeysByPrefix } from "@server/next/copyBlocks";
import { getEffectCategoryDescriptions } from "@server/next/effectCategoryCopy";

export const revalidate = 3600;
export const dynamicParams = false;

const LOCALE = LIVE_LOCALES["zh.dose.wiki"];
const EFFECT_CATEGORY_COPY_KEYS = getCopyKeysByPrefix("effects-category-");

type EffectCategoryPageProps = {
  params: Promise<{ categorySlug: string }>;
};

export async function generateStaticParams() {
  return loadTaxonomyStaticParams(effectCategoryRouteDescriptor);
}

export async function generateMetadata({ params }: EffectCategoryPageProps) {
  setRequestLocale(LOCALE.code);
  const { categorySlug } = await params;
  const result = await loadEffectCategoryRoute(categorySlug, LOCALE);
  return buildPublicPageMetadata({
    ...result.metadata,
    title: t(result.metadata.title),
    description: t(result.metadata.description),
    route: result.canonicalRoute,
    noIndex: true,
  });
}

export default async function EffectCategoryPage({ params }: EffectCategoryPageProps) {
  setRequestLocale(LOCALE.code);
  const { categorySlug } = await params;
  const [result, copy] = await Promise.all([
    loadEffectCategoryRoute(categorySlug, LOCALE),
    getCopyByKeys(EFFECT_CATEGORY_COPY_KEYS),
  ]);

  if (result.kind === "redirect") redirect(result.target);
  if (result.kind !== "ok") notFound();

  const categoryDefinition = getEffectCategoryDefinition(categorySlug);
  const descriptions = Object.fromEntries(
    Object.entries(getEffectCategoryDescriptions(copy)).map(([slug, description]) => [
      slug,
      t(description),
    ]),
  );

  return (
    <UiLocaleProvider locale={LOCALE.code}>
      <div lang={LOCALE.htmlLang}>
        <EffectCategoryDetailPage
          categorySlug={categorySlug}
          effects={result.detail}
          effectHrefPrefix="/effects/"
          backHref="/effects"
          descriptions={{
            ...descriptions,
            [categorySlug]: descriptions[categorySlug] ?? t(categoryDefinition?.description ?? ""),
          }}
        />
      </div>
    </UiLocaleProvider>
  );
}
