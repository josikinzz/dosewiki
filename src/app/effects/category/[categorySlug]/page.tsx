import { notFound } from "next/navigation";
import { buildPageMetadata } from "@server/next/metadata";
import { getEffectsByCategory } from "@server/convex/publicData";
import { getStaticEffectCategoryParams } from "@server/next/staticParams";
import { EffectCategoryPage as EffectCategoryDetailPage } from "@/features/effects/pages/EffectCategoryPage";

export const revalidate = 3600;

export async function generateStaticParams() {
  return await getStaticEffectCategoryParams();
}

type EffectCategoryPageProps = {
  params: Promise<{
    categorySlug: string;
  }>;
};

export async function generateMetadata({ params }: EffectCategoryPageProps) {
  const { categorySlug } = await params;
  const effects = await getEffectsByCategory(categorySlug);

  return buildPageMetadata({
    title: `Effect category · ${categorySlug}`,
    description: `Browse ${effects.length} effects in the ${categorySlug} category.`,
    pathname: `/effects/category/${categorySlug}`,
  });
}

export default async function EffectCategoryPage({ params }: EffectCategoryPageProps) {
  const { categorySlug } = await params;
  const effects = await getEffectsByCategory(categorySlug);

  if (effects.length === 0) {
    notFound();
  }

  return <EffectCategoryDetailPage categorySlug={categorySlug} effects={effects} effectHrefPrefix="/effects/" backHref="/effects" />;
}
