import { notFound } from "next/navigation";
import { buildPublicPageMetadata } from "@server/next/publicSite";
import { loadArticleRoute } from "@server/next/routeLoaders.publications";
import { EffectIndexArticlePage } from "@/features/articles/pages/EffectIndexArticlePage";
import { EditorLauncherTarget } from "@/features/editor-launcher/EditorLauncherTarget";
import WritingContextualEditor from "@/features/dev/tools/writing/WritingContextualEditor.editor";
import { t } from "@/i18n/server";

export const revalidate = 3600;
export const dynamicParams = true;

// Keep the build bounded; published keys enter the ISR cache on first request.
export function generateStaticParams() {
  return [];
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
    notFound();
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
      <EditorLauncherTarget
        target={{
          kind: "writing",
          slug: result.pageProps.article.slug,
          name: result.pageProps.article.title,
          writingKind: "article",
        }}
      />
      <WritingContextualEditor slug={result.pageProps.article.slug} writingKind="article" bylineAuthors={result.pageProps.bylineAuthors} />
      <EffectIndexArticlePage {...result.pageProps} t={t} />
    </>
  );
}
