import { notFound } from "next/navigation";
import { buildPageMetadata } from "@server/next/metadata";
import { getPublicLibrary } from "@server/convex/publicLibrary";
import { LegacyPublicRouteClient } from "../../_components/LegacyPublicRouteClient";

export const revalidate = 3600;

type CategoryPageProps = {
  params: Promise<{
    categoryKey: string;
  }>;
};

export async function generateMetadata({ params }: CategoryPageProps) {
  const { categoryKey } = await params;
  const library = await getPublicLibrary();
  const detail = library.getCategoryDetail(categoryKey);

  return buildPageMetadata({
    title: detail?.definition.name ?? "Category",
    description: detail ? `Browse ${detail.total} substances grouped under ${detail.definition.name}.` : "Browse substances by category.",
    pathname: `/category/${categoryKey}`,
  });
}

export default async function CategoryPage({ params }: CategoryPageProps) {
  const { categoryKey } = await params;
  const library = await getPublicLibrary();
  const detail = library.getCategoryDetail(categoryKey);

  if (!detail) {
    notFound();
  }

  return <LegacyPublicRouteClient view={{ type: "category", categoryKey }} />;
}
