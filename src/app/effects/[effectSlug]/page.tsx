import { Suspense } from "react";
import { notFound } from "next/navigation";
import { buildPageMetadata } from "@server/next/metadata";
import { getPublicEffectBySlug } from "@server/convex/publicData";
import { getPublicEffectDetail } from "@server/convex/publicLibrary";
import { getStaticEffectParams } from "@server/next/staticParams";
import { EffectReplicationsSection, EffectReplicationsSectionFallback } from "../../_components/public-routes/EffectReplicationsSection";
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
  const effect = await getPublicEffectBySlug(effectSlug);

  return buildPageMetadata({
    title: effect?.name ?? "Effect",
    description: effect?.summary ?? "Browse subjective effect details in dose.wiki.",
    pathname: `/effects/${effectSlug}`,
  });
}

export default async function EffectPage({ params }: EffectPageProps) {
  const { effectSlug } = await params;
  const [effect, detail] = await Promise.all([getPublicEffectBySlug(effectSlug), getPublicEffectDetail(effectSlug)]);

  if (!effect || !detail) {
    notFound();
  }

  return (
    <EffectArticlePage
      effect={effect}
      effectDetail={detail ?? undefined}
      drugHrefPrefix="/"
      categoryHrefPrefix="/category/"
      replicationsSection={
        effect.gallery_order?.length ? (
          <Suspense fallback={<EffectReplicationsSectionFallback />}>
            <EffectReplicationsSection effectSlug={effectSlug} galleryOrder={effect.gallery_order} />
          </Suspense>
        ) : undefined
      }
    />
  );
}
