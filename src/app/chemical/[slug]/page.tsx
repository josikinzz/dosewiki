import { notFound, redirect } from "next/navigation";
import { buildPublicPageMetadata } from "@server/next/publicSite";
import {
  chemicalClassRouteDescriptor,
  loadChemicalClassRoute,
  loadTaxonomyStaticParams,
} from "@server/next/routeLoaders";
import { ClassificationDetailPage } from "@/components/pages/ClassificationDetailPage";

export const revalidate = 3600;

export async function generateStaticParams() {
  return loadTaxonomyStaticParams(chemicalClassRouteDescriptor);
}

type ChemicalClassPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export async function generateMetadata({ params }: ChemicalClassPageProps) {
  const { slug } = await params;
  const result = await loadChemicalClassRoute(slug);

  return buildPublicPageMetadata({
    ...result.metadata,
    route: result.canonicalRoute,
  });
}

export default async function ChemicalClassificationPage({ params }: ChemicalClassPageProps) {
  const { slug } = await params;
  const result = await loadChemicalClassRoute(slug);

  if (result.kind === "redirect") {
    redirect(result.target);
  }

  if (result.kind !== "ok") {
    notFound();
  }

  return <ClassificationDetailPage detail={result.detail} drugHrefPrefix="/" />;
}
