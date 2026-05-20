import { notFound } from "next/navigation";
import { buildPublicPageMetadata } from "@server/next/publicSite";
import { getPublicReportBySlug } from "@server/convex/publicData";
import { getReportRouteOutcome } from "@server/next/publicRouteOutcomes";
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
  const report = await getPublicReportBySlug(slug);

  return buildPublicPageMetadata({
    title: report?.title ?? "Trip report",
    description: report?.introduction ?? "Browse experience reports from dose.wiki contributors.",
    route: { family: "report", params: { slug } },
  });
}

export default async function ReportPage({ params, searchParams }: ReportPageProps) {
  const { slug } = await params;
  const { from } = await searchParams;
  const outcome = await getReportRouteOutcome(slug);

  if (outcome.state === "not-found") {
    notFound();
  }

  const substanceBySlug = Object.fromEntries(outcome.substances.map((substance) => [substance.slug, { name: substance.title }]));
  const fromSubstanceSlug = from?.trim() || undefined;
  const backTarget = getReportBackTarget({
    report: outcome.report,
    substanceBySlug,
    fromSubstanceSlug,
  });

  return (
    <TripReportDetailPage
      report={outcome.report}
      backTarget={backTarget}
    />
  );
}
