import { notFound } from "next/navigation";
import { buildPublicPageMetadata } from "@server/next/publicSite";
import { loadArticleRoute } from "@server/next/routeLoaders.publications";
import { getStaticArticleParams } from "@server/next/staticParams";
import { EffectIndexArticlePage } from "@/features/articles/pages/EffectIndexArticlePage";
import { SITE_FLAVOR_CONFIG } from "@/config/siteFlavor";
import { EditorLauncherTarget } from "@/features/editor-launcher/EditorLauncherTarget";

export const revalidate = 3600;
export const dynamicParams = false;

export async function generateStaticParams() {
  return await getStaticArticleParams();
}

type ArticlePageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export async function generateMetadata({ params }: ArticlePageProps) {
  const { slug } = await params;
  const result = await loadArticleRoute(slug);

  if (result.kind === "not-found") {
    return buildPublicPageMetadata({
      title: "Article",
      description: SITE_FLAVOR_CONFIG.articleFallbackDescription,
      route: { family: "article", params: { slug } },
    });
  }

  return buildPublicPageMetadata({
    ...result.metadata,
    route: result.canonicalRoute,
  });
}

export default async function ArticlePage({ params }: ArticlePageProps) {
  const { slug } = await params;
  const result = await loadArticleRoute(slug);

  if (result.kind === "not-found") {
    notFound();
  }

  return (
    <>
      {result.pageProps.article.bodyFormat === "markdown" ? (
        <EditorLauncherTarget
          target={{
            kind: "writing",
            slug: result.pageProps.article.slug,
            name: result.pageProps.article.title,
            writingKind: "article",
          }}
        />
      ) : null}
      <EffectIndexArticlePage {...result.pageProps} />
    </>
  );
}
