import { notFound, redirect } from "next/navigation";
import { buildPublicPageMetadata } from "@server/next/publicSite";
import {
  categoryRouteDescriptor,
  loadCategoryRoute,
  loadTaxonomyStaticParams,
} from "@server/next/routeLoaders";
import { CategoryPage as CategoryDetailPage } from "@/components/pages/CategoryPage";

export const revalidate = 3600;
export const dynamicParams = false;

export async function generateStaticParams() {
  return loadTaxonomyStaticParams(categoryRouteDescriptor);
}

type CategoryPageProps = {
  params: Promise<{
    categoryKey: string;
  }>;
};

export async function generateMetadata({ params }: CategoryPageProps) {
  const { categoryKey } = await params;
  const result = await loadCategoryRoute(categoryKey);

  return buildPublicPageMetadata({
    ...result.metadata,
    route: result.canonicalRoute,
  });
}

export default async function CategoryPage({ params }: CategoryPageProps) {
  const { categoryKey } = await params;
  const result = await loadCategoryRoute(categoryKey);

  if (result.kind === "redirect") {
    redirect(result.target);
  }

  if (result.kind !== "ok") {
    notFound();
  }

  return <CategoryDetailPage detail={result.detail} effects={result.effects} drugHrefPrefix="/" />;
}
