import { notFound } from "next/navigation";
import { buildPublicPageMetadata } from "@server/next/publicSite";
import { getEffectArticleViewModel } from "@server/next/publicRouteViewModels";
import { getStaticEffectParams } from "@server/next/staticParams";
import { EffectArticlePage } from "@/features/effects/pages/EffectArticlePage";

export const revalidate = 3600;

export async function generateStaticParams() {
  return await getStaticEffectParams();
}

type EffectPageProps = {
  params: Promise<{
    effectSlug: string;
  }>;
};

export async function generateMetadata({ params }: EffectPageProps) {
  const { effectSlug } = await params;
  const viewModel = await getEffectArticleViewModel(effectSlug);

  return buildPublicPageMetadata({
    title: viewModel?.metadata.title ?? "Effect",
    description: viewModel?.metadata.description ?? "Browse subjective effect details in dose.wiki.",
    route: { family: "effect", params: { effectSlug } },
  });
}

export default async function EffectPage({ params }: EffectPageProps) {
  const { effectSlug } = await params;
  const viewModel = await getEffectArticleViewModel(effectSlug);

  if (!viewModel) {
    notFound();
  }

  return <EffectArticlePage {...viewModel.pageProps} />;
}
