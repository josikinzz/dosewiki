import { notFound, redirect } from "next/navigation";
import { buildPublicPageMetadata } from "@server/next/publicSite";
import { loadSubstanceRoute } from "@server/next/routeLoaders.substances";
import { getStaticSubstanceParams } from "@server/next/staticParams";
import { SubstanceArticlePage } from "@/features/article/pages/SubstanceArticlePage";
import { buildSiteUrl, getPublicRoutePath } from "@server/next/publicSite";
import { buildSubstanceSchema, serializeJsonLd } from "@/utils/seo/structuredData";
import { getMoleculeUpdatedAt } from "@server/convex/publicData.molecules";
import {
  MOLECULE_SOCIAL_CARD_SIZE,
  moleculeSocialCardUrl,
} from "@/data/mappings/moleculeOverrideUrl";

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

  // Substances with a stored molecule get a square molecule card instead of
  // the flavor-wide one; `?v=<updatedAt>` rolls the URL on every editor save.
  // (`getMoleculeUpdatedAt` is request-cached, so the page render reuses it.)
  // Alias redirects keep the flavor card — only canonical pages own a molecule.
  const moleculeUpdatedAt = result.kind === "ok" ? await getMoleculeUpdatedAt(slug) : null;

  return buildPublicPageMetadata({
    ...result.metadata,
    route: result.canonicalRoute,
    socialImage: moleculeUpdatedAt
      ? {
          path: moleculeSocialCardUrl(slug, moleculeUpdatedAt),
          width: MOLECULE_SOCIAL_CARD_SIZE,
          height: MOLECULE_SOCIAL_CARD_SIZE,
          alt: `${result.metadata.title} molecule structure`,
        }
      : undefined,
  });
}

export default async function SubstancePage({ params }: SubstancePageProps) {
  const { slug } = await params;
  const result = await loadSubstanceRoute(slug);

  if (result.kind === "redirect") {
    redirect(result.target);
  }

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
