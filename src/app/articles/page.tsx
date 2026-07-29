import {
  buildPublicPageMetadata,
  buildSiteUrl,
  getPublicRoutePath,
} from "@server/next/publicSite";
import { loadArticlesIndexRoute } from "@server/next/routeLoaders";
import { ArticlesIndexPage } from "@/features/articles/pages/ArticlesIndexPage";
import {
  buildItemListSchema,
  serializeJsonLd,
} from "@/utils/seo/structuredData";
import { SITE_FLAVOR_CONFIG } from "@/config/siteFlavor";

export const revalidate = 3600;

export async function generateMetadata() {
  const result = await loadArticlesIndexRoute();

  return buildPublicPageMetadata({
    ...result.metadata,
    route: result.canonicalRoute,
  });
}

export default async function ArticlesPage() {
  const result = await loadArticlesIndexRoute();
  const canonicalUrl = buildSiteUrl(getPublicRoutePath(result.canonicalRoute));
  const itemListJsonLd = serializeJsonLd(
    buildItemListSchema({
      url: canonicalUrl,
      name: `${SITE_FLAVOR_CONFIG.name} Articles`,
      description:
        "Published guides, scales, and long-form writing from the Effect Index archive.",
      items: result.pageProps.articles.map((article) => ({
        name: article.title,
        url: buildSiteUrl(
          getPublicRoutePath({
            family: "article",
            params: { slug: article.slug },
          }),
        ),
      })),
    }),
  );

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: itemListJsonLd }}
      />
      <ArticlesIndexPage {...result.pageProps} />
    </>
  );
}
