import { notFound } from "next/navigation";
import { buildPageMetadata } from "@server/next/metadata";
import { getPublicReportBySlug, getPublicSubstances } from "@server/convex/publicData";
import { getStaticReportParams } from "@server/next/staticParams";
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

  return buildPageMetadata({
    title: report?.title ?? "Trip report",
    description: report?.introduction ?? "Browse experience reports from dose.wiki contributors.",
    pathname: `/reports/${slug}`,
  });
}

export default async function ReportPage({ params, searchParams }: ReportPageProps) {
  const { slug } = await params;
  const { from } = await searchParams;
  const [report, substances] = await Promise.all([getPublicReportBySlug(slug), getPublicSubstances()]);

  if (!report) {
    notFound();
  }

  const substanceBySlug = Object.fromEntries(substances.map((substance) => [substance.slug, { name: substance.title }]));
  const fromSubstanceSlug = from?.trim() || undefined;
  const backHref = fromSubstanceSlug ? `/${fromSubstanceSlug}` : "/reports";

  return (
    <TripReportDetailPage
      report={report}
      substanceBySlug={substanceBySlug}
      fromSubstanceSlug={fromSubstanceSlug}
      backHref={backHref}
    />
  );
}
