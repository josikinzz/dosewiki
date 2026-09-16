import { notFound } from "next/navigation";
import { buildPublicPageMetadata, buildSiteUrl, getPublicRoutePath } from "@server/next/publicSite";
import { loadEffectMetadataRoute, loadEffectRoute } from "@server/next/routeLoaders.substances";
import { EffectArticleServer } from "@/app/_components/public-routes/EffectArticleServer";
import { buildSubjectiveEffectSchema, serializeJsonLd } from "@/utils/seo/structuredData";
import { entitySocialCardImage } from "@/data/mappings/entitySocialCardUrl";
import EffectContextualEditor from "@/features/effects/editing/EffectContextualEditor.editor";
import { Suspense } from "react";
import { getPublicEffectDetail } from "@server/data/publicLibrary";
import { buildEffectArticleModel, getEffectArticleReplicationState } from "@/features/effects/articleSectionModel";
import type { EffectArticleViewModel } from "@server/next/publicRouteViewModels";

async function EffectEditorAction({ effectSlug, pageProps }: { effectSlug: string; pageProps: EffectArticleViewModel["pageProps"] }) {
  if (process.env.NEXT_PUBLIC_EDITOR_BUILD !== "true") return null;
  const detail = await getPublicEffectDetail(effectSlug);
  return <EffectContextualEditor slug={effectSlug} pageProps={{
    article: buildEffectArticleModel({ effect: pageProps.sourceEffect, effectDetail: detail ?? undefined, replications: getEffectArticleReplicationState(pageProps.sourceEffect) }),
    drugHrefPrefix: pageProps.drugHrefPrefix,
    categoryHrefPrefix: pageProps.categoryHrefPrefix,
    linkableSubstanceSlugs: pageProps.linkableSubstanceSlugs,
    linkableEffectSlugs: pageProps.linkableEffectSlugs,
  }} />;
}

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
  const result = await loadEffectMetadataRoute(effectSlug);

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
      <EffectArticleServer
        effectSlug={effectSlug}
        {...pageProps}
        headingActions={
          <Suspense fallback={null}><EffectEditorAction effectSlug={effectSlug} pageProps={result.pageProps} /></Suspense>
        }
      />
    </>
  );
}
