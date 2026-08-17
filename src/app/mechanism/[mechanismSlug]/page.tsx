import { notFound, redirect } from "next/navigation";
import { buildPublicPageMetadata } from "@server/next/publicSite";
import { buildMechanismItemListSchema } from "@server/next/taxonomyItemListSchema";
import {
  loadMechanismRoute,
  loadTaxonomyStaticParams,
  mechanismRouteDescriptor,
} from "@server/next/routeLoaders.taxonomy";
import { MechanismDetailPage } from "@/components/pages/MechanismDetailPage";
import { serializeJsonLd } from "@/utils/seo/structuredData";

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

  const itemListJsonLd = serializeJsonLd(
    buildMechanismItemListSchema(result.detail, result.canonicalRoute),
  );

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: itemListJsonLd }}
      />
      <MechanismDetailPage detail={result.detail} drugHrefPrefix="/" categoryHrefPrefix="/category/" />
    </>
  );
}
