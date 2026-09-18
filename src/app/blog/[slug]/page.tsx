import { notFound } from "next/navigation";
import { buildPublicPageMetadata } from "@server/next/publicSite";
import {
  loadBlogPostRoute,
  loadWritingBlogPostRoute,
} from "@server/next/routeLoaders.publications";
import { isEffectIndex } from "@/config/siteFlavor";
import { BlogPostPage } from "@/features/blog/pages/BlogPostPage";
import { WritingBlogPostPage } from "@/features/blog/pages/WritingBlogPostPage";
import { EditorLauncherTarget } from "@/features/editor-launcher/EditorLauncherTarget";
import WritingContextualEditor from "@/features/dev/tools/writing/WritingContextualEditor.editor";

// Same incremental revalidation interval as the articles pages.
export const revalidate = 3600;
export const dynamicParams = true;

// Both flavors resolve their own published corpus on demand through the loaders.
export function generateStaticParams() {
  return [];
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
    notFound();
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

  return (
    <>
      <EditorLauncherTarget
        target={{
          kind: "writing",
          slug: result.pageProps.post.slug,
          name: result.pageProps.post.title,
          writingKind: "blog",
        }}
      />
      <WritingContextualEditor slug={result.pageProps.post.slug} writingKind="blog" bylineAuthors={result.pageProps.post.bylineAuthors} />
      <WritingBlogPostPage {...result.pageProps} />
    </>
  );
}
