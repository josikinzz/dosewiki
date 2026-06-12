import { buildPublicPageMetadata } from "@server/next/publicSite";
import { TripReportSubmissionPage } from "@/features/reports/submissions/TripReportSubmissionPage";

export const metadata = buildPublicPageMetadata({
  title: "Submit a Trip Report",
  description: "Submit a structured trip report for private editor review on dose.wiki.",
  pathname: "/reports/submit",
  noIndex: true,
});

export default function SubmitTripReportPage() {
  return <TripReportSubmissionPage />;
}
