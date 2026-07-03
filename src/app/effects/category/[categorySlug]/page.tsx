import { notFound, redirect } from "next/navigation";
import { buildPublicPageMetadata } from "@server/next/publicSite";
import { buildEffectCategoryItemListSchema } from "@server/next/taxonomyItemListSchema";
import {
  effectCategoryRouteDescriptor,
  loadEffectCategoryRoute,
  loadTaxonomyStaticParams,
} from "@server/next/routeLoaders";
import { getEffectCategoryDefinition } from "@/data/effectCategoryDefinitions";
import { EffectCategoryPage as EffectCategoryDetailPage } from "@/features/effects/pages/EffectCategoryPage";
import { serializeJsonLd } from "@/utils/seo/structuredData";

export const revalidate = 3600;
export const dynamicParams = false;

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
  const result = await loadEffectCategoryRoute(categorySlug);

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
      description: categoryDefinition?.description ?? result.metadata.description,
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
      />
    </>
  );
}
