import { notFound } from "next/navigation";
import { buildPublicPageMetadata, buildSiteUrl, getPublicRoutePath } from "@server/next/publicSite";
import { loadEffectRoute } from "@server/next/routeLoaders.substances";
import { EffectArticlePage } from "@/features/effects/pages/EffectArticlePage";
import { buildSubjectiveEffectSchema, serializeJsonLd } from "@/utils/seo/structuredData";
import { entitySocialCardImage } from "@/data/mappings/entitySocialCardUrl";
import EffectContextualEditor from "@/features/effects/editing/EffectContextualEditor.editor";

export const revalidate = 3600;
export const dynamicParams = true;

// Keep the build bounded; published keys enter the ISR cache on first request.
export function generateStaticParams() {
  return [];
}

type EffectPageProps = {
  params: Promise<{
    effectSlug: string;
  }>;
};

export async function generateMetadata({ params }: EffectPageProps) {
  const { effectSlug } = await params;
  const result = await loadEffectRoute(effectSlug);

  if (result.kind === "not-found") {
    notFound();
  }

  return buildPublicPageMetadata({
    ...result.metadata,
    route: result.canonicalRoute,
    socialImage: entitySocialCardImage(
      "effects",
      effectSlug,
      `${result.metadata.title} subjective effect card`,
    ),
  });
}

export default async function EffectPage({ params }: EffectPageProps) {
  const { effectSlug } = await params;
  const result = await loadEffectRoute(effectSlug);

  if (result.kind === "not-found") {
    notFound();
  }

  const { sourceEffect, ...pageProps } = result.pageProps;
  const canonicalUrl = buildSiteUrl(getPublicRoutePath(result.canonicalRoute));
  const jsonLd = serializeJsonLd(buildSubjectiveEffectSchema(sourceEffect, canonicalUrl));

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd }}
      />
      <EffectArticlePage
        {...pageProps}
        headingActions={
          <EffectContextualEditor
            slug={effectSlug}
            pageProps={{
              article: pageProps.article,
              drugHrefPrefix: pageProps.drugHrefPrefix,
              categoryHrefPrefix: pageProps.categoryHrefPrefix,
              linkableSubstanceSlugs: pageProps.linkableSubstanceSlugs,
              linkableEffectSlugs: pageProps.linkableEffectSlugs,
            }}
          />
        }
      />
    </>
  );
}
