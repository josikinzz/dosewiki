import { notFound } from "next/navigation";
import { buildPageMetadata } from "@server/next/metadata";
import { getPublicEffectBySlug } from "@server/convex/publicData";
import { getPublicLibrary } from "@server/convex/publicLibrary";
import { LegacyPublicRouteClient } from "../../_components/LegacyPublicRouteClient";

export const revalidate = 3600;

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
  const [effect, library] = await Promise.all([getPublicEffectBySlug(effectSlug), getPublicLibrary()]);
  const detail = library.getEffectDetail(effectSlug);

  if (!effect || !detail) {
    notFound();
  }

  return <LegacyPublicRouteClient view={{ type: "effect", effectSlug }} />;
}
