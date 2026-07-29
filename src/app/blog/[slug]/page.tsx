import { notFound } from "next/navigation";
import { buildPublicPageMetadata } from "@server/next/publicSite";
import { loadBlogIndexRoute, loadBlogPostRoute } from "@server/next/routeLoaders";
import { isFlavorRouteEnabled, requireEffectIndexFlavor } from "@/config/siteFlavor";
import { BlogPostPage } from "@/features/blog/pages/BlogPostPage";

// Same incremental revalidation interval as the articles pages.
export const revalidate = 3600;
// Kept at `false` deliberately, and measured: with `dynamicParams = true`, an unknown slug
// is rendered on demand and Next serves the `notFound()` body at HTTP 200 — the same soft
// 404 that made `/blog` indexable on the dose.wiki build. `false` makes every unprerendered
// slug a real 404. The cost is that a build whose archive read degrades bakes no post
// routes at all, so that degradation is logged loudly — see
// `reportDegradedEffectIndexArchiveRead` in `lib/convex/publicData.reads.ts`.
export const dynamicParams = false;

export async function generateStaticParams() {
  // Prerendering is gated too: without this the dose.wiki build would still enumerate
  // and prerender Effect Index blog slugs for a route it does not serve.
  if (!isFlavorRouteEnabled("blog")) {
    return [];
  }

  const result = await loadBlogIndexRoute();

  return result.pageProps.posts.map((post) => ({ slug: post.slug }));
}

type BlogPostPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export async function generateMetadata({ params }: BlogPostPageProps) {
  requireEffectIndexFlavor();

  const { slug } = await params;
  const result = await loadBlogPostRoute(slug);

  if (result.kind === "not-found") {
    return buildPublicPageMetadata({
      title: "Blog",
      description: "Announcements and site updates from the Effect Index archive.",
      route: { family: "blogPost", params: { slug } },
    });
  }

  return buildPublicPageMetadata({
    ...result.metadata,
    route: result.canonicalRoute,
  });
}

export default async function BlogPostRoute({ params }: BlogPostPageProps) {
  requireEffectIndexFlavor();

  const { slug } = await params;
  const result = await loadBlogPostRoute(slug);

  if (result.kind === "not-found") {
    notFound();
  }

  return <BlogPostPage {...result.pageProps} />;
}
