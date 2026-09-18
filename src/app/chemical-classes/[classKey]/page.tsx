import { notFound } from "next/navigation";
import { buildPublicPageMetadata } from "@server/next/publicSite";
import {
  formatChemicalClassMetadataDescription,
  loadChemicalClassDetailRoute,
} from "@server/next/routeLoaders.chemicalClasses";
import { ChemicalClassDetailPage } from "@/features/chemical-classes/pages/ChemicalClassDetailPage";
import { t } from "@/i18n/server";

export const revalidate = 3600;
export const dynamicParams = true;

type ChemicalClassPageProps = {
  params: Promise<{
    classKey: string;
  }>;
};

// Keep the build bounded; published keys enter the ISR cache on first request.
export function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: ChemicalClassPageProps) {
  const { classKey } = await params;
  const result = await loadChemicalClassDetailRoute(classKey);

  if (result.kind === "not-found") {
    notFound();
  }

  return buildPublicPageMetadata({
    title: result.metadata.title,
    description: formatChemicalClassMetadataDescription(
      t(result.metadata.description, result.metadata.values),
    ),
    route: result.canonicalRoute,
  });
}

export default async function ChemicalClassPage({ params }: ChemicalClassPageProps) {
  const { classKey } = await params;
  const result = await loadChemicalClassDetailRoute(classKey);

  if (result.kind === "not-found") {
    notFound();
  }

  return <ChemicalClassDetailPage detail={result.detail} />;
}
