import { notFound } from "next/navigation";
import { buildPageMetadata } from "@server/next/metadata";
import { getPublicPsychoactiveClassDetail } from "@server/convex/publicLibrary";
import { getStaticPsychoactiveClassParams } from "@server/next/staticParams";
import { ClassificationDetailPage } from "@/components/pages/ClassificationDetailPage";

export const revalidate = 3600;

export async function generateStaticParams() {
  return await getStaticPsychoactiveClassParams();
}

type ClassificationPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export async function generateMetadata({ params }: ClassificationPageProps) {
  const { slug } = await params;
  const detail = await getPublicPsychoactiveClassDetail(slug);

  return buildPageMetadata({
    title: detail?.label ?? "Psychoactive class",
    description: detail ? `Browse ${detail.total} substances in the ${detail.label} psychoactive class.` : "Browse psychoactive class routes.",
    pathname: `/psychoactive/${slug}`,
  });
}

export default async function PsychoactiveClassificationPage({ params }: ClassificationPageProps) {
  const { slug } = await params;
  const detail = await getPublicPsychoactiveClassDetail(slug);

  if (!detail) {
    notFound();
  }

  return <ClassificationDetailPage detail={detail} drugHrefPrefix="/" />;
}
