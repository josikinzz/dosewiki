import { notFound } from "next/navigation";
import { buildPageMetadata } from "@server/next/metadata";
import { getEffectsByCategory } from "@server/convex/publicData";
import { LegacyPublicRouteClient } from "../../../_components/LegacyPublicRouteClient";

export const revalidate = 3600;

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

  return <LegacyPublicRouteClient view={{ type: "effect-category", categorySlug }} />;
}
