import { notFound } from "next/navigation";

import {
  SUBSTANCE_INDEX_VIEW_PARAMS,
  substanceIndexViewFromSlug,
  substanceIndexViewPath,
} from "@/utils/indexViewRoutes";
import {
  getSubstancesIndexMetadata,
  SubstancesIndexRoute,
} from "../../_components/SubstancesIndexRoute";

export const revalidate = 3600;
export const dynamicParams = false;

export function generateStaticParams() {
  return SUBSTANCE_INDEX_VIEW_PARAMS.map(({ slug }) => ({ groupSlug: slug }));
}

type SubstanceGroupPageProps = {
  params: Promise<{ groupSlug: string }>;
};

export async function generateMetadata({ params }: SubstanceGroupPageProps) {
  const { groupSlug } = await params;
  const initialView = substanceIndexViewFromSlug(groupSlug);
  if (!initialView) {
    notFound();
  }
  return getSubstancesIndexMetadata(substanceIndexViewPath(initialView));
}

export default async function SubstanceGroupPage({ params }: SubstanceGroupPageProps) {
  const { groupSlug } = await params;
  const initialView = substanceIndexViewFromSlug(groupSlug);
  if (!initialView) {
    notFound();
  }
  const pathname = substanceIndexViewPath(initialView);
  return <SubstancesIndexRoute initialView={initialView} pathname={pathname} />;
}
