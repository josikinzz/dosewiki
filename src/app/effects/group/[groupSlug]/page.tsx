import { notFound } from "next/navigation";

import {
  EFFECT_INDEX_VIEW_PARAMS,
  effectIndexViewFromSlug,
  effectIndexViewPath,
} from "@/utils/indexViewRoutes";
import {
  EffectsIndexRoute,
  getEffectsIndexMetadata,
} from "../../_components/EffectsIndexRoute";

export const revalidate = 3600;
export const dynamicParams = false;

export function generateStaticParams() {
  return EFFECT_INDEX_VIEW_PARAMS.map(({ slug }) => ({ groupSlug: slug }));
}

type EffectGroupPageProps = {
  params: Promise<{ groupSlug: string }>;
};

export async function generateMetadata({ params }: EffectGroupPageProps) {
  const { groupSlug } = await params;
  const initialView = effectIndexViewFromSlug(groupSlug);
  if (!initialView) {
    notFound();
  }
  return getEffectsIndexMetadata(effectIndexViewPath(initialView));
}

export default async function EffectGroupPage({ params }: EffectGroupPageProps) {
  const { groupSlug } = await params;
  const initialView = effectIndexViewFromSlug(groupSlug);
  if (!initialView) {
    notFound();
  }
  const pathname = effectIndexViewPath(initialView);
  return <EffectsIndexRoute initialView={initialView} pathname={pathname} />;
}
