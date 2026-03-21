import { notFound } from "next/navigation";
import { buildPageMetadata } from "@server/next/metadata";
import { getPublicChemicalClassDetail } from "@server/convex/publicLibrary";
import { getStaticChemicalClassParams } from "@server/next/staticParams";
import { ClassificationDetailPage } from "@/components/pages/ClassificationDetailPage";

export const revalidate = 3600;

export async function generateStaticParams() {
  return await getStaticChemicalClassParams();
}

type ClassificationPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export async function generateMetadata({ params }: ClassificationPageProps) {
  const { slug } = await params;
  const detail = await getPublicChemicalClassDetail(slug);

  return buildPageMetadata({
    title: detail?.label ?? "Chemical class",
    description: detail ? `Browse ${detail.total} substances in the ${detail.label} chemical class.` : "Browse chemical class routes.",
    pathname: `/chemical/${slug}`,
  });
}

export default async function ChemicalClassificationPage({ params }: ClassificationPageProps) {
  const { slug } = await params;
  const detail = await getPublicChemicalClassDetail(slug);

  if (!detail) {
    notFound();
  }

  return <ClassificationDetailPage detail={detail} drugHrefPrefix="/" />;
}
