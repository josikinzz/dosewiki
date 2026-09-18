import { notFound, redirect } from "next/navigation";
import { buildPublicPageMetadata } from "@server/next/publicSite";
import { buildMechanismQualifierItemListSchema } from "@server/next/taxonomyItemListSchema";
import {
  loadMechanismQualifierRoute,
} from "@server/next/routeLoaders.taxonomy";
import { MechanismDetailPage } from "@/components/pages/MechanismDetailPage";
import { serializeJsonLd } from "@/utils/seo/structuredData";

export const revalidate = 3600;
export const dynamicParams = true;

// Keep the build bounded; published keys enter the ISR cache on first request.
export function generateStaticParams() {
  return [];
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

  if (result.kind === "redirect") {
    redirect(result.target);
  }
  if (result.kind === "not-found") {
    notFound();
  }

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

  const itemListJsonLd = serializeJsonLd(
    buildMechanismQualifierItemListSchema(
      result.detail.mechanism,
      result.detail.qualifier,
      result.canonicalRoute,
    ),
  );

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: itemListJsonLd }}
      />
      <MechanismDetailPage
        detail={result.detail.mechanism}
        activeQualifierSlug={qualifierSlug}
        drugHrefPrefix="/"
        categoryHrefPrefix="/category/"
      />
    </>
  );
}
