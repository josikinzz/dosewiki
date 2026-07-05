import { notFound } from "next/navigation";
import { buildPublicPageMetadata } from "@server/next/publicSite";
import {
  getPublicChemicalClassDetailPayload,
  getPublicChemicalClassTreePayload,
} from "@server/convex/publicChemicalClassIndex";
import { ChemicalClassDetailPage } from "@/features/chemical-classes/pages/ChemicalClassDetailPage";

export const revalidate = 3600;
export const dynamicParams = false;

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

export async function generateStaticParams() {
  const payload = await getPublicChemicalClassTreePayload();
  return Object.keys(payload.nodes).map((classKey) => ({ classKey }));
}

export async function generateMetadata({ params }: ChemicalClassPageProps) {
  const { classKey } = await params;
  const detail = await getPublicChemicalClassDetailPayload(classKey);

  if (!detail) {
    return buildPublicPageMetadata({
      title: "Chemical class",
      description: "Browse the chemical class tree on dose.wiki.",
      route: { family: "chemicalClasses" },
    });
  }

  return buildPublicPageMetadata({
    title: `${detail.label} · chemical class`,
    description:
      truncateDescription(detail.description) ??
      `Explore ${detail.label} lineage, subclasses, molecules, and published substances on dose.wiki.`,
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
