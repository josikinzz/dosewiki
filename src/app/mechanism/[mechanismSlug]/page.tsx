import { notFound, redirect } from "next/navigation";
import { buildPublicPageMetadata } from "@server/next/publicSite";
import {
  loadMechanismRoute,
  loadTaxonomyStaticParams,
  mechanismRouteDescriptor,
} from "@server/next/routeLoaders";
import { MechanismDetailPage } from "@/components/pages/MechanismDetailPage";

export const revalidate = 3600;
export const dynamicParams = false;

export async function generateStaticParams() {
  return loadTaxonomyStaticParams(mechanismRouteDescriptor);
}

type MechanismPageProps = {
  params: Promise<{
    mechanismSlug: string;
  }>;
};

export async function generateMetadata({ params }: MechanismPageProps) {
  const { mechanismSlug } = await params;
  const result = await loadMechanismRoute(mechanismSlug);

  return buildPublicPageMetadata({
    ...result.metadata,
    route: result.canonicalRoute,
  });
}

export default async function MechanismPage({ params }: MechanismPageProps) {
  const { mechanismSlug } = await params;
  const result = await loadMechanismRoute(mechanismSlug);

  if (result.kind === "redirect") {
    redirect(result.target);
  }

  if (result.kind !== "ok") {
    notFound();
  }

  return (
    <MechanismDetailPage detail={result.detail} drugHrefPrefix="/" categoryHrefPrefix="/category/" />
  );
}
