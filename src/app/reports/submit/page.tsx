import { buildPublicPageMetadata } from "@server/next/publicSite";
import { flavoredCopyKey, flavoredCopyText, getCopyByKeys } from "@server/next/copyBlocks";
import { TripReportSubmissionPage } from "@/features/reports/submissions/TripReportSubmissionPage";
import { SITE_FLAVOR_CONFIG } from "@/config/siteFlavor";

export async function generateMetadata() {
  const copy = await getCopyByKeys([flavoredCopyKey("seo-reports-submit-description")]);

  return buildPublicPageMetadata({
    title: "Submit a Trip Report",
    description: flavoredCopyText(
      copy,
      "seo-reports-submit-description",
      `Submit a structured trip report for private editor review on ${SITE_FLAVOR_CONFIG.name}.`,
    ),
    pathname: "/reports/submit",
    noIndex: true,
  });
}

export default function SubmitTripReportPage() {
  return <TripReportSubmissionPage />;
}
