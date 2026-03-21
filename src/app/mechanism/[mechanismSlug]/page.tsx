import { notFound } from "next/navigation";
import { buildPageMetadata } from "@server/next/metadata";
import { getPublicMechanismDetail } from "@server/convex/publicLibrary";
import { getStaticMechanismParams } from "@server/next/staticParams";
import { MechanismDetailPage } from "@/components/pages/MechanismDetailPage";

export const revalidate = 3600;

export async function generateStaticParams() {
  return await getStaticMechanismParams();
}

type MechanismPageProps = {
  params: Promise<{
    mechanismSlug: string;
  }>;
};

export async function generateMetadata({ params }: MechanismPageProps) {
  const { mechanismSlug } = await params;
  const detail = await getPublicMechanismDetail(mechanismSlug);

  return buildPageMetadata({
    title: detail?.definition.name ?? "Mechanism",
    description: detail ? `Browse ${detail.definition.total} substances grouped under ${detail.definition.name}.` : "Browse mechanism routes.",
    pathname: `/mechanism/${mechanismSlug}`,
  });
}

export default async function MechanismPage({ params }: MechanismPageProps) {
  const { mechanismSlug } = await params;
  const detail = await getPublicMechanismDetail(mechanismSlug);

  if (!detail) {
    notFound();
  }

  return <MechanismDetailPage detail={detail} drugHrefPrefix="/" categoryHrefPrefix="/category/" />;
}
