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
  const detail = library.getChemicalClassDetail(slug);

  return buildPageMetadata({
    title: detail?.label ?? "Chemical class",
    description: detail ? `Browse ${detail.total} substances in the ${detail.label} chemical class.` : "Browse chemical class routes.",
    pathname: `/chemical/${slug}`,
  });
}

export default async function ChemicalClassificationPage({ params }: ClassificationPageProps) {
  const { slug } = await params;
  const library = await getPublicLibrary();
  const detail = library.getChemicalClassDetail(slug);

  if (!detail) {
    notFound();
  }

  return <LegacyPublicRouteClient view={{ type: "classification", classification: "chemical", slug }} />;
}
