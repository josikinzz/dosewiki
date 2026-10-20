import { notFound } from "next/navigation";
import { buildPublicPageMetadata } from "@server/next/publicSite";
import { loadReportRoute, REPORT_FALLBACK_METADATA } from "@server/next/routeLoaders.reports";
import { getStaticReportParams } from "@server/next/staticParams";
import { buildReportSubstanceLinks } from "@server/next/reportSubstanceLinks";
import { TripReportDetailPage } from "@/features/reports/pages/TripReportDetailPage";
import { entitySocialCardImage } from "@/data/mappings/entitySocialCardUrl";

export const revalidate = 3600;

export async function generateStaticParams() {
  return await getStaticReportParams();
}

type ReportPageProps = {
  params: Promise<{
    slug: string;
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
    socialImage: entitySocialCardImage(
      "reports",
      result.pageProps.report.slug,
      `${result.pageProps.report.title} experience report card`,
    ),
  });
}

export default async function ReportPage({ params }: ReportPageProps) {
  const { slug } = await params;
  const result = await loadReportRoute(slug);

  if (result.kind === "not-found") {
    notFound();
  }

  const substanceLinks = buildReportSubstanceLinks(
    result.pageProps.report.substances,
    result.substanceBySlug,
  );

  return (
    <TripReportDetailPage
      {...result.pageProps}
      substanceBySlug={result.substanceBySlug}
      substanceLinks={substanceLinks}
    />
  );
}
