import { notFound, redirect } from "next/navigation";
import { buildPublicPageMetadata } from "@server/next/publicSite";
import { loadSubstanceMetadataRoute, loadSubstanceRoute } from "@server/next/routeLoaders.substances";
import { getStaticSubstanceParams } from "@server/next/staticParams";
import { SubstanceArticlePage } from "@/features/article/pages/SubstanceArticlePage";
import { buildSiteUrl, getPublicRoutePath } from "@server/next/publicSite";
import { buildSubstanceSchema, serializeJsonLd } from "@/utils/seo/structuredData";
import { isEffectIndex } from "@/config/siteFlavor";
import {
  SUBSTANCE_SOCIAL_CARD_SIZE,
  substanceSocialCardUrl,
} from "@/data/mappings/substanceSocialCardUrl";

export const revalidate = 3600;
export const dynamicParams = true;

export async function generateStaticParams() {
  // The ISR page cache does not survive a Vercel deployment, so articles that
  // are not prerendered pay a cold server render on the first request after
  // every deploy. The high and normal priority tiers are prerendered here from
  // one cached lookup read (see PRERENDERED_SUBSTANCE_PRIORITIES); the low
  // priority long tail keeps `dynamicParams` on-demand rendering plus the
  // hourly ISR cache so the build does not scale with the whole corpus.
  return await getStaticSubstanceParams();
}

type SubstancePageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export async function generateMetadata({ params }: SubstancePageProps) {
  const { slug } = await params;
  const result = await loadSubstanceMetadataRoute(slug);

  if (result.kind === "not-found") {
    notFound();
  }

  // dose.wiki substance pages use immutable build-generated cards. Effect
  // Index keeps its own publication-wide social identity.
  const socialCardPath =
    result.kind === "ok" && !isEffectIndex() ? substanceSocialCardUrl(slug) : null;

  return buildPublicPageMetadata({
    ...result.metadata,
    route: result.canonicalRoute,
    socialImage: socialCardPath
      ? {
          path: socialCardPath,
          width: SUBSTANCE_SOCIAL_CARD_SIZE,
          height: SUBSTANCE_SOCIAL_CARD_SIZE,
          alt: `${result.metadata.title} substance guide`,
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
      {result.publicRevision && (
        <meta name="dosewiki-public-revision" content={result.publicRevision} />
      )}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd }}
      />
      <SubstanceArticlePage {...result.pageProps} />
    </>
  );
}
