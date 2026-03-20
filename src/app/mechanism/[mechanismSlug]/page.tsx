import { notFound } from "next/navigation";
import { buildPageMetadata } from "@server/next/metadata";
import { getPublicLibrary } from "@server/convex/publicLibrary";
import { LegacyPublicRouteClient } from "../../_components/LegacyPublicRouteClient";

export const revalidate = 3600;

type MechanismPageProps = {
  params: Promise<{
    mechanismSlug: string;
  }>;
};

export async function generateMetadata({ params }: MechanismPageProps) {
  const { mechanismSlug } = await params;
  const library = await getPublicLibrary();
  const detail = library.getMechanismDetail(mechanismSlug);

  return buildPageMetadata({
    title: detail?.definition.name ?? "Mechanism",
    description: detail ? `Browse ${detail.definition.total} substances grouped under ${detail.definition.name}.` : "Browse mechanism routes.",
    pathname: `/mechanism/${mechanismSlug}`,
  });
}

export default async function MechanismPage({ params }: MechanismPageProps) {
  const { mechanismSlug } = await params;
  const library = await getPublicLibrary();
  const detail = library.getMechanismDetail(mechanismSlug);

  if (!detail) {
    notFound();
  }

  return <LegacyPublicRouteClient view={{ type: "mechanism", mechanismSlug }} />;
}
