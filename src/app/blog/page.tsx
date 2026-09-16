import {
  buildPublicPageMetadata,
  buildSiteUrl,
  getPublicRoutePath,
} from "@server/next/publicSite";
import {
  loadBlogIndexRoute,
  loadWritingBlogIndexRoute,
} from "@server/next/routeLoaders.publications";
import { isEffectIndex } from "@/config/siteFlavor";
import { getCopyByKeys, getCopyKeysByPrefix } from "@server/next/copyBlocks";
import { resolveEmptyStateCopy } from "@server/next/emptyStateCopy";
import { BlogIndexPage } from "@/features/blog/pages/BlogIndexPage";
import { WritingBlogIndexPage } from "@/features/blog/pages/WritingBlogIndexPage";
import {
  buildItemListSchema,
  serializeJsonLd,
} from "@/utils/seo/structuredData";

// Same incremental revalidation interval as the articles pages.
export const revalidate = 3600;
const BLOG_EMPTY_COPY_KEYS = getCopyKeysByPrefix("empty-blog-");

/**
 * `/blog` serves two entirely different publications, chosen by build flavor.
 *
 * - **Effect Index** — the frozen blog archive, read from `effectIndexArchive`
 *   through `loadBlogIndexRoute`. It is finished; nothing new is ever added to
 *   it, and it renders exactly as it did before dose.wiki had a blog at all.
 * - **dose.wiki** — the live blog, read from the `kind: "blog"` rows of
 *   `effectIndexArticles` through `loadWritingBlogIndexRoute`.
 *
 * The two never mix. The flavor picks the loader, and each loader reads its own
 * table and its own rows, so neither corpus can appear on the other's pages.
 */
export async function generateMetadata() {
  const result = isEffectIndex()
    ? await loadBlogIndexRoute()
    : await loadWritingBlogIndexRoute();

  return buildPublicPageMetadata({
    ...result.metadata,
    route: result.canonicalRoute,
  });
}

export default async function BlogPage() {
  return isEffectIndex() ? <EffectIndexArchiveBlog /> : <DoseWikiBlog />;
}

async function EffectIndexArchiveBlog() {
  const result = await loadBlogIndexRoute();
  const emptyState = result.pageProps.emptyState
    ? resolveEmptyStateCopy(await getCopyByKeys(BLOG_EMPTY_COPY_KEYS), "blog", result.pageProps.emptyState)
    : undefined;
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
        emptyState={emptyState}
      />
    </>
  );
}

async function DoseWikiBlog() {
  const result = await loadWritingBlogIndexRoute();
  const emptyState = result.pageProps.emptyState
    ? resolveEmptyStateCopy(await getCopyByKeys(BLOG_EMPTY_COPY_KEYS), "blog", result.pageProps.emptyState)
    : undefined;
  const canonicalUrl = buildSiteUrl(getPublicRoutePath(result.canonicalRoute));
  const itemListJsonLd = serializeJsonLd(
    buildItemListSchema({
      url: canonicalUrl,
      name: "dose.wiki Blog",
      description: "News, notes, and long-form writing from the dose.wiki editors.",
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
      <WritingBlogIndexPage
        {...result.pageProps}
        emptyState={emptyState}
      />
    </>
  );
}
