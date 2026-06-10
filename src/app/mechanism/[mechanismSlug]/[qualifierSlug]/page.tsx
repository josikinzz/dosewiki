import { notFound, redirect } from "next/navigation";
import { buildPublicPageMetadata } from "@server/next/publicSite";
import {
  loadMechanismQualifierRoute,
  loadTaxonomyStaticParams,
  mechanismQualifierRouteDescriptor,
} from "@server/next/routeLoaders";
import { MechanismDetailPage } from "@/components/pages/MechanismDetailPage";

export const revalidate = 3600;
export const dynamicParams = false;

export async function generateStaticParams() {
  return loadTaxonomyStaticParams(mechanismQualifierRouteDescriptor);
}

type MechanismQualifierPageProps = {
  params: Promise<{
    mechanismSlug: string;
    qualifierSlug: string;
  }>;
};

export async function generateMetadata({ params }: MechanismQualifierPageProps) {
  const { mechanismSlug, qualifierSlug } = await params;
  const result = await loadMechanismQualifierRoute(mechanismSlug, qualifierSlug);

  return buildPublicPageMetadata({
    ...result.metadata,
    route: result.canonicalRoute,
  });
}

export default async function MechanismQualifierPage({ params }: MechanismQualifierPageProps) {
  const { mechanismSlug, qualifierSlug } = await params;
  const result = await loadMechanismQualifierRoute(mechanismSlug, qualifierSlug);

  if (result.kind === "redirect") {
    redirect(result.target);
  }

  if (result.kind !== "ok") {
    notFound();
  }

  return (
    <MechanismDetailPage
      detail={result.detail.mechanism}
      activeQualifierSlug={qualifierSlug}
      drugHrefPrefix="/"
      categoryHrefPrefix="/category/"
    />
  );
}
