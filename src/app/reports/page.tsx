import { getPublicDataOverview, getPublicReports } from "@server/convex/publicData";
import { buildPageMetadata } from "@server/next/metadata";
import { TripReportsPage } from "@/features/reports/pages/TripReportsPage";

export const revalidate = 3600;

export async function generateMetadata() {
  const overview = await getPublicDataOverview();

  return buildPageMetadata({
    title: `Reports · ${overview.reportCount} entries`,
    description: `Browse ${overview.reportCount} trip reports in dose.wiki.`,
    pathname: "/reports",
  });
}

export default async function ReportsPage() {
  const reports = await getPublicReports();

  return (
    <TripReportsPage
      reportHrefPrefix="/reports/"
      reports={reports.map((report) => ({
        slug: report.slug,
        title: report.title,
        featured: report.featured,
        subject: { name: report.author, trip_date: report.tripDate },
        substances: report.substanceNames.map((name) => ({ name })),
        introduction: report.introduction,
        onset: [],
        peak: [],
        offset: [],
        conclusion: undefined,
        tags: [],
      }))}
    />
  );
}
