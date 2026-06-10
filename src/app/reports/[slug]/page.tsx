import { notFound } from "next/navigation";
import { buildPublicPageMetadata } from "@server/next/publicSite";
import { loadReportRoute, REPORT_FALLBACK_METADATA } from "@server/next/routeLoaders";
import { getStaticReportParams } from "@server/next/staticParams";
import { getReportBackTarget } from "@/features/reports/domain/tripReportIndex";
import { TripReportDetailPage } from "@/features/reports/pages/TripReportDetailPage";

export const revalidate = 3600;

export async function generateStaticParams() {
  return await getStaticReportParams();
}

type ReportPageProps = {
  params: Promise<{
    slug: string;
  }>;
  searchParams: Promise<{
    from?: string;
  }>;
};

export async function generateMetadata({ params }: ReportPageProps) {
  const { slug } = await params;
  const result = await loadReportRoute(slug);

  if (result.kind === "not-found") {
    return buildPublicPageMetadata({
      ...REPORT_FALLBACK_METADATA,
      route: { family: "report", params: { slug } },
    });
  }

  return buildPublicPageMetadata({
    ...result.metadata,
    route: result.canonicalRoute,
  });
}

export default async function ReportPage({ params, searchParams }: ReportPageProps) {
  const { slug } = await params;
  const { from } = await searchParams;
  const result = await loadReportRoute(slug);

  if (result.kind === "not-found") {
    notFound();
  }

  const fromSubstanceSlug = from?.trim() || undefined;
  const backTarget = getReportBackTarget({
    report: result.pageProps.report,
    substanceBySlug: result.substanceBySlug,
    fromSubstanceSlug,
  });

  return (
    <TripReportDetailPage
      {...result.pageProps}
      backTarget={backTarget}
    />
  );
}
