import { notFound } from "next/navigation";
import { buildPublicPageMetadata } from "@server/next/publicSite";
import {
  loadBlogIndexRoute,
  loadBlogPostRoute,
  loadWritingBlogIndexRoute,
  loadWritingBlogPostRoute,
} from "@server/next/routeLoaders.publications";
import { isEffectIndex, SITE_FLAVOR_CONFIG } from "@/config/siteFlavor";
import { BlogPostPage } from "@/features/blog/pages/BlogPostPage";
import { WritingBlogPostPage } from "@/features/blog/pages/WritingBlogPostPage";

// Same incremental revalidation interval as the articles pages.
export const revalidate = 3600;
// Kept at `false` deliberately, and measured: with `dynamicParams = true`, an unknown slug
// is rendered on demand and Next serves the `notFound()` body at HTTP 200 — the same soft
// 404 that made `/blog` indexable on the dose.wiki build. `false` makes every unprerendered
// slug a real 404. The cost is that a build whose archive read degrades bakes no post
// routes at all, so that degradation is logged loudly — see
// `reportDegradedEffectIndexArchiveRead` in `lib/convex/publicData.reads.ts`.
//
// It holds for both publications served here: the Effect Index build prerenders the frozen
// archive's slugs, the dose.wiki build prerenders its own `kind: "blog"` rows, and on either
// build a slug belonging to the other publication is simply not in the list — so it 404s
// hard rather than rendering the wrong corpus.
export const dynamicParams = false;

export async function generateStaticParams() {
  // Each flavor enumerates only its own posts. This is the prerender half of the
  // separation the loaders enforce at read time.
  if (isEffectIndex()) {
    const result = await loadBlogIndexRoute();
    return result.pageProps.posts.map((post) => ({ slug: post.slug }));
  }

  const result = await loadWritingBlogIndexRoute();
  return result.pageProps.posts.map((post) => ({ slug: post.slug }));
}

type BlogPostPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export async function generateMetadata({ params }: BlogPostPageProps) {
  const { slug } = await params;
  const result = isEffectIndex()
    ? await loadBlogPostRoute(slug)
    : await loadWritingBlogPostRoute(slug);

  if (result.kind === "not-found") {
    return buildPublicPageMetadata({
      title: "Blog",
      description: `Posts from ${SITE_FLAVOR_CONFIG.name}.`,
      route: { family: "blogPost", params: { slug } },
    });
  }

  return buildPublicPageMetadata({
    ...result.metadata,
    route: result.canonicalRoute,
  });
}

export default async function BlogPostRoute({ params }: BlogPostPageProps) {
  const { slug } = await params;

  if (isEffectIndex()) {
    const result = await loadBlogPostRoute(slug);

    if (result.kind === "not-found") {
      notFound();
    }

    return <BlogPostPage {...result.pageProps} />;
  }

  const result = await loadWritingBlogPostRoute(slug);

  if (result.kind === "not-found") {
    notFound();
  }

  return <WritingBlogPostPage {...result.pageProps} />;
}
