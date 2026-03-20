import { notFound } from "next/navigation";
import { buildPageMetadata } from "@server/next/metadata";
import { getPublicReportBySlug } from "@server/convex/publicData";
import { LegacyPublicRouteClient } from "../../_components/LegacyPublicRouteClient";

export const revalidate = 3600;

type ReportPageProps = {
  params: Promise<{
    slug: string;
  }>;
  searchParams?: Promise<{
    from?: string;
  }>;
};

export async function generateMetadata({ params }: ReportPageProps) {
  const { slug } = await params;
  const report = await getPublicReportBySlug(slug);

  return buildPageMetadata({
    title: report?.title ?? "Trip report",
    description: report?.introduction ?? "Browse experience reports from dose.wiki contributors.",
    pathname: `/reports/${slug}`,
  });
}

export default async function ReportPage({ params, searchParams }: ReportPageProps) {
  const { slug } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const report = await getPublicReportBySlug(slug);

  if (!report) {
    notFound();
  }

  return <LegacyPublicRouteClient view={{ type: "report", slug }} fromSubstanceSlug={resolvedSearchParams?.from} />;
}
