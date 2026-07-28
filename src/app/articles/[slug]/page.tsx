import { notFound } from "next/navigation";
import { buildPublicPageMetadata } from "@server/next/publicSite";
import { loadArticleRoute } from "@server/next/routeLoaders";
import { getStaticArticleParams } from "@server/next/staticParams";
import { EffectIndexArticlePage } from "@/features/articles/pages/EffectIndexArticlePage";

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
      description: "Browse Effect Index articles in dose.wiki.",
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

  return <EffectIndexArticlePage {...result.pageProps} />;
}
