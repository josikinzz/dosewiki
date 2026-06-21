import { notFound } from "next/navigation";
import { buildPublicPageMetadata } from "@server/next/publicSite";
import { loadSubstanceRoute } from "@server/next/routeLoaders";
import { getStaticSubstanceParams } from "@server/next/staticParams";
import { SubstanceArticlePage } from "@/features/article/pages/SubstanceArticlePage";
import { buildSiteUrl, getPublicRoutePath } from "@server/next/publicSite";
import { buildSubstanceSchema, serializeJsonLd } from "@/utils/seo/structuredData";

export const revalidate = 3600;
export const dynamicParams = false;

export async function generateStaticParams() {
  return await getStaticSubstanceParams();
}

type SubstancePageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export async function generateMetadata({ params }: SubstancePageProps) {
  const { slug } = await params;
  const result = await loadSubstanceRoute(slug);

  if (result.kind === "not-found") {
    notFound();
  }

  return buildPublicPageMetadata({
    ...result.metadata,
    route: result.canonicalRoute,
  });
}

export default async function SubstancePage({ params }: SubstancePageProps) {
  const { slug } = await params;
  const result = await loadSubstanceRoute(slug);

  if (result.kind === "not-found") {
    notFound();
  }

  const canonicalUrl = buildSiteUrl(getPublicRoutePath(result.canonicalRoute));
  const jsonLd = serializeJsonLd(buildSubstanceSchema(result.pageProps.article, canonicalUrl));

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd }}
      />
      <SubstanceArticlePage {...result.pageProps} />
    </>
  );
}
