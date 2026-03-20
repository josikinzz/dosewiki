import { notFound } from "next/navigation";
import { buildPageMetadata } from "@server/next/metadata";
import { getPublicLibrary } from "@server/convex/publicLibrary";
import { LegacyPublicRouteClient } from "../../../_components/LegacyPublicRouteClient";

export const revalidate = 3600;

type MechanismQualifierPageProps = {
  params: Promise<{
    mechanismSlug: string;
    qualifierSlug: string;
  }>;
};

export async function generateMetadata({ params }: MechanismQualifierPageProps) {
  const { mechanismSlug, qualifierSlug } = await params;
  const library = await getPublicLibrary();
  const detail = library.getMechanismDetail(mechanismSlug);
  const qualifier = detail?.qualifiers.find((entry) => entry.key === qualifierSlug);

  return buildPageMetadata({
    title: qualifier ? `${detail?.definition.name} · ${qualifier.label}` : "Mechanism qualifier",
    description: qualifier ? `Browse ${qualifier.total} substances in the ${qualifier.label} qualifier.` : "Browse mechanism qualifier routes.",
    pathname: `/mechanism/${mechanismSlug}/${qualifierSlug}`,
  });
}

export default async function MechanismQualifierPage({ params }: MechanismQualifierPageProps) {
  const { mechanismSlug, qualifierSlug } = await params;
  const library = await getPublicLibrary();
  const detail = library.getMechanismDetail(mechanismSlug);
  const qualifier = detail?.qualifiers.find((entry) => entry.key === qualifierSlug);

  if (!detail || !qualifier) {
    notFound();
  }

  return <LegacyPublicRouteClient view={{ type: "mechanism", mechanismSlug, qualifierSlug }} />;
}
