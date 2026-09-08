import { notFound } from "next/navigation";
import { buildPublicPageMetadata } from "@server/next/publicSite";
import {
  getPublicChemicalClassDetailPayload,
} from "@server/convex/publicChemicalClassIndex";
import { ChemicalClassDetailPage } from "@/features/chemical-classes/pages/ChemicalClassDetailPage";
import { SITE_FLAVOR_CONFIG } from "@/config/siteFlavor";

export const revalidate = 3600;
export const dynamicParams = true;

type ChemicalClassPageProps = {
  params: Promise<{
    classKey: string;
  }>;
};

const stripMarkdown = (value: string) =>
  value
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/[_`[\]()]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const truncateDescription = (value: string | undefined) => {
  if (!value) return undefined;
  const clean = stripMarkdown(value);
  return clean.length > 160 ? `${clean.slice(0, 157).trimEnd()}...` : clean;
};

// Keep the build bounded; published keys enter the ISR cache on first request.
export function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: ChemicalClassPageProps) {
  const { classKey } = await params;
  const detail = await getPublicChemicalClassDetailPayload(classKey);

  if (!detail) {
    notFound();
  }

  return buildPublicPageMetadata({
    title: detail.label,
    description:
      truncateDescription(detail.description) ??
      `Explore ${detail.label} lineage, subclasses, molecules, and published substances on ${SITE_FLAVOR_CONFIG.name}.`,
    route: { family: "chemicalClass", params: { classKey: detail.key } },
  });
}

export default async function ChemicalClassPage({ params }: ChemicalClassPageProps) {
  const { classKey } = await params;
  const detail = await getPublicChemicalClassDetailPayload(classKey);

  if (!detail) {
    notFound();
  }

  return <ChemicalClassDetailPage detail={detail} />;
}
