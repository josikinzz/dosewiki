import { notFound } from "next/navigation";
import { buildPageMetadata } from "@server/next/metadata";
import { getPublicLibrary } from "@server/convex/publicLibrary";
import { LegacyPublicRouteClient } from "../../_components/LegacyPublicRouteClient";

export const revalidate = 3600;

type ClassificationPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export async function generateMetadata({ params }: ClassificationPageProps) {
  const { slug } = await params;
  const library = await getPublicLibrary();
  const detail = library.getPsychoactiveClassDetail(slug);

  return buildPageMetadata({
    title: detail?.label ?? "Psychoactive class",
    description: detail ? `Browse ${detail.total} substances in the ${detail.label} psychoactive class.` : "Browse psychoactive class routes.",
    pathname: `/psychoactive/${slug}`,
  });
}

export default async function PsychoactiveClassificationPage({ params }: ClassificationPageProps) {
  const { slug } = await params;
  const library = await getPublicLibrary();
  const detail = library.getPsychoactiveClassDetail(slug);

  if (!detail) {
    notFound();
  }

  return <LegacyPublicRouteClient view={{ type: "classification", classification: "psychoactive", slug }} />;
}
