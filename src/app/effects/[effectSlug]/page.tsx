import { notFound } from "next/navigation";
import { buildPublicPageMetadata } from "@server/next/publicSite";
import { loadEffectRoute } from "@server/next/routeLoaders";
import { getStaticEffectParams } from "@server/next/staticParams";
import { EffectArticlePage } from "@/features/effects/pages/EffectArticlePage";

export const revalidate = 3600;
export const dynamicParams = false;

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
  const result = await loadEffectRoute(effectSlug);

  if (result.kind === "not-found") {
    return buildPublicPageMetadata({
      title: "Effect",
      description: "Browse subjective effect details in dose.wiki.",
      route: { family: "effect", params: { effectSlug } },
    });
  }

  return buildPublicPageMetadata({
    ...result.metadata,
    route: result.canonicalRoute,
  });
}

export default async function EffectPage({ params }: EffectPageProps) {
  const { effectSlug } = await params;
  const result = await loadEffectRoute(effectSlug);

  if (result.kind === "not-found") {
    notFound();
  }

  return <EffectArticlePage {...result.pageProps} />;
}
