import { notFound, redirect } from "next/navigation";
import { buildPublicPageMetadata } from "@server/next/publicSite";
import { buildEffectCategoryItemListSchema } from "@server/next/taxonomyItemListSchema";
import {
  effectCategoryRouteDescriptor,
  loadEffectCategoryRoute,
  loadTaxonomyStaticParams,
} from "@server/next/routeLoaders.taxonomy";
import { getEffectCategoryDefinition } from "@/data/effectCategoryDefinitions";
import { EffectCategoryPage as EffectCategoryDetailPage } from "@/features/effects/pages/EffectCategoryPage";
import { serializeJsonLd } from "@/utils/seo/structuredData";
import { getCopyByKeys, getCopyKeysByPrefix } from "@server/next/copyBlocks";
import {
  effectCategoryCopyKey,
  getEffectCategoryDescriptions,
} from "@server/next/effectCategoryCopy";

export const revalidate = 3600;
export const dynamicParams = false;

const EFFECT_CATEGORY_COPY_KEYS = getCopyKeysByPrefix("effects-category-");

export async function generateStaticParams() {
  return loadTaxonomyStaticParams(effectCategoryRouteDescriptor);
}

type EffectCategoryPageProps = {
  params: Promise<{
    categorySlug: string;
  }>;
};

export async function generateMetadata({ params }: EffectCategoryPageProps) {
  const { categorySlug } = await params;
  const result = await loadEffectCategoryRoute(categorySlug);

  return buildPublicPageMetadata({
    ...result.metadata,
    route: result.canonicalRoute,
  });
}

export default async function EffectCategoryPage({ params }: EffectCategoryPageProps) {
  const { categorySlug } = await params;
  const [result, copy] = await Promise.all([
    loadEffectCategoryRoute(categorySlug),
    getCopyByKeys(EFFECT_CATEGORY_COPY_KEYS),
  ]);

  if (result.kind === "redirect") {
    redirect(result.target);
  }

  if (result.kind !== "ok") {
    notFound();
  }

  const categoryDefinition = getEffectCategoryDefinition(categorySlug);
  const itemListJsonLd = serializeJsonLd(
    buildEffectCategoryItemListSchema({
      categoryName: categoryDefinition?.name ?? result.metadata.title,
      categorySlug,
      description:
        copy.text(effectCategoryCopyKey(categorySlug)) ||
        categoryDefinition?.description ||
        result.metadata.description,
      effects: result.detail,
      route: result.canonicalRoute,
    }),
  );

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: itemListJsonLd }}
      />
      <EffectCategoryDetailPage
        categorySlug={categorySlug}
        effects={result.detail}
        effectHrefPrefix="/effects/"
        backHref="/effects"
        descriptions={getEffectCategoryDescriptions(copy)}
      />
    </>
  );
}
