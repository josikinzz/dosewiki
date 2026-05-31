import { PageHeader } from "@/components/layout/PageHeader";
import type { ReportCardModel } from "@/types/tripReport";
import type { PublicRouteEmptyState } from "@server/next/publicRouteOutcomes";
import { TripReportsExplorer } from "./TripReportsExplorer";

interface TripReportsPageProps {
  reports: ReportCardModel[];
  reportHrefPrefix?: string;
  emptyState?: PublicRouteEmptyState;
}

/**
 * Trip reports listing page with view mode selector.
 */
export function TripReportsPage({
  reports,
  reportHrefPrefix,
  emptyState,
}: TripReportsPageProps) {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 pb-20 pt-10">
      <PageHeader
        title="Trip Reports"
        icon="lucide:file-signature"
        showSpotlight={false}
        description="A collection of high-quality, consistently formatted trip reports documenting subjective experiences with various substances. These reports serve as anecdotal accounts supporting the documented effects in our Subjective Effect Index."
      />

      <TripReportsExplorer
        reports={reports}
        reportHrefPrefix={reportHrefPrefix}
        emptyState={emptyState}
      />
    </div>
  );
}
