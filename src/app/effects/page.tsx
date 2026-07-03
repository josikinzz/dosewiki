import { buildPublicPageMetadata, buildSiteUrl, getPublicRoutePath } from "@server/next/publicSite";
import { loadEffectsIndexRoute } from "@server/next/routeLoaders";
import { buildItemListSchema, serializeJsonLd } from "@/utils/seo/structuredData";
import { EffectsIndexPage } from "@/features/effects/pages/EffectsIndexPage";

export const revalidate = 3600;
const ITEM_LIST_LIMIT = 100;

export async function generateMetadata() {
  const result = await loadEffectsIndexRoute();

  return buildPublicPageMetadata({
    ...result.metadata,
    route: result.canonicalRoute,
  });
}

export default async function EffectsPage() {
  const result = await loadEffectsIndexRoute();
  const canonicalUrl = buildSiteUrl(getPublicRoutePath(result.canonicalRoute));
  const itemListJsonLd = serializeJsonLd(
    buildItemListSchema({
      url: canonicalUrl,
      name: "dose.wiki Subjective Effect Index",
      description: "Browse dose.wiki subjective effect descriptions and related substance pages.",
      items: result.pageProps.effects.slice(0, ITEM_LIST_LIMIT).map((effect) => ({
        name: effect.name,
        url: buildSiteUrl(getPublicRoutePath({ family: "effect", params: { effectSlug: effect.slug } })),
      })),
    }),
  );

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: itemListJsonLd }}
      />
      <EffectsIndexPage {...result.pageProps} />
    </>
  );
}
