import { buildPublicPageMetadata } from "@server/next/publicSite";
import { TripReportSubmissionPage } from "@/features/reports/submissions/TripReportSubmissionPage";
import { SITE_FLAVOR_CONFIG } from "@/config/siteFlavor";

export const metadata = buildPublicPageMetadata({
  title: "Submit a Trip Report",
  description: `Submit a structured trip report for private editor review on ${SITE_FLAVOR_CONFIG.name}.`,
  pathname: "/reports/submit",
  noIndex: true,
});

export default function SubmitTripReportPage() {
  return <TripReportSubmissionPage />;
}
