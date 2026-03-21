import { notFound } from "next/navigation";
import { buildPageMetadata } from "@server/next/metadata";
import { getPublicMechanismDetail } from "@server/convex/publicLibrary";
import { getStaticMechanismQualifierParams } from "@server/next/staticParams";
import { MechanismDetailPage } from "@/components/pages/MechanismDetailPage";

export const revalidate = 3600;

export async function generateStaticParams() {
  return await getStaticMechanismQualifierParams();
}

type MechanismQualifierPageProps = {
  params: Promise<{
    mechanismSlug: string;
    qualifierSlug: string;
  }>;
};

export async function generateMetadata({ params }: MechanismQualifierPageProps) {
  const { mechanismSlug, qualifierSlug } = await params;
  const detail = await getPublicMechanismDetail(mechanismSlug);
  const qualifier = detail?.qualifiers.find((entry) => entry.key === qualifierSlug);

  return buildPageMetadata({
    title: qualifier ? `${detail?.definition.name} · ${qualifier.label}` : "Mechanism qualifier",
    description: qualifier ? `Browse ${qualifier.total} substances in the ${qualifier.label} qualifier.` : "Browse mechanism qualifier routes.",
    pathname: `/mechanism/${mechanismSlug}/${qualifierSlug}`,
  });
}

export default async function MechanismQualifierPage({ params }: MechanismQualifierPageProps) {
  const { mechanismSlug, qualifierSlug } = await params;
  const detail = await getPublicMechanismDetail(mechanismSlug);
  const qualifier = detail?.qualifiers.find((entry) => entry.key === qualifierSlug);

  if (!detail || !qualifier) {
    notFound();
  }

  return (
    <MechanismDetailPage
      detail={detail}
      activeQualifierSlug={qualifierSlug}
      drugHrefPrefix="/"
      categoryHrefPrefix="/category/"
    />
  );
}
