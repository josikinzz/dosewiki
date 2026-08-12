import {
  buildPublicPageMetadata,
  buildSiteUrl,
  getPublicRoutePath,
} from "@server/next/publicSite";
import { loadBlogIndexRoute } from "@server/next/routeLoaders";
import { requireEffectIndexFlavor } from "@/config/siteFlavor";
import { getCopy } from "@server/next/copyBlocks";
import { resolveEmptyStateCopy } from "@server/next/emptyStateCopy";
import { BlogIndexPage } from "@/features/blog/pages/BlogIndexPage";
import {
  buildItemListSchema,
  serializeJsonLd,
} from "@/utils/seo/structuredData";

// Same incremental revalidation interval as the articles pages.
export const revalidate = 3600;

export async function generateMetadata() {
  requireEffectIndexFlavor();

  const result = await loadBlogIndexRoute();

  return buildPublicPageMetadata({
    ...result.metadata,
    route: result.canonicalRoute,
  });
}

export default async function BlogPage() {
  // Flavor gate first: on the dose.wiki build this route does not exist, and the guard
  // must run before any Convex read is issued.
  requireEffectIndexFlavor();

  const [result, copy] = await Promise.all([loadBlogIndexRoute(), getCopy()]);
  const canonicalUrl = buildSiteUrl(getPublicRoutePath(result.canonicalRoute));
  const itemListJsonLd = serializeJsonLd(
    buildItemListSchema({
      url: canonicalUrl,
      name: "Effect Index Blog",
      description: "Announcements and site updates from the Effect Index archive.",
      items: result.pageProps.posts.map((post) => ({
        name: post.title,
        url: buildSiteUrl(
          getPublicRoutePath({ family: "blogPost", params: { slug: post.slug } }),
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
      <BlogIndexPage
        {...result.pageProps}
        emptyState={resolveEmptyStateCopy(copy, "blog", result.pageProps.emptyState)}
      />
    </>
  );
}
