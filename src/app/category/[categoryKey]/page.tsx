import { notFound } from "next/navigation";
import { getPublicEffectArticles } from "@server/convex/publicData";
import { buildPageMetadata } from "@server/next/metadata";
import { getPublicCategoryDetail } from "@server/convex/publicLibrary";
import { getStaticCategoryParams } from "@server/next/staticParams";
import { CategoryPage as CategoryDetailPage } from "@/components/pages/CategoryPage";

export const revalidate = 3600;

export async function generateStaticParams() {
  return await getStaticCategoryParams();
}

type CategoryPageProps = {
  params: Promise<{
    categoryKey: string;
  }>;
};

export async function generateMetadata({ params }: CategoryPageProps) {
  const { categoryKey } = await params;
  const detail = await getPublicCategoryDetail(categoryKey);

  return buildPageMetadata({
    title: detail?.definition.name ?? "Category",
    description: detail ? `Browse ${detail.total} substances grouped under ${detail.definition.name}.` : "Browse substances by category.",
    pathname: `/category/${categoryKey}`,
  });
}

export default async function CategoryPage({ params }: CategoryPageProps) {
  const { categoryKey } = await params;
  const [detail, effects] = await Promise.all([getPublicCategoryDetail(categoryKey), getPublicEffectArticles()]);

  if (!detail) {
    notFound();
  }

  return <CategoryDetailPage detail={detail} effects={effects} drugHrefPrefix="/" />;
}
