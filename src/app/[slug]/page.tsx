import { notFound } from "next/navigation";
import { buildPageMetadata } from "@server/next/metadata";
import { getPublicSubstanceBySlug } from "@server/convex/publicData";
import { LegacyPublicRouteClient } from "../_components/LegacyPublicRouteClient";

export const revalidate = 3600;

type SubstancePageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export async function generateMetadata({ params }: SubstancePageProps) {
  const { slug } = await params;
  const substance = await getPublicSubstanceBySlug(slug);

  if (!substance) {
    notFound();
  }

  return buildPageMetadata({
    title: substance.title,
    description: substance.summary,
    pathname: `/${slug}`,
  });
}

export default async function SubstancePage({ params }: SubstancePageProps) {
  const { slug } = await params;
  const substance = await getPublicSubstanceBySlug(slug);

  if (!substance) {
    notFound();
  }

  return <LegacyPublicRouteClient view={{ type: "substance", slug }} />;
}
